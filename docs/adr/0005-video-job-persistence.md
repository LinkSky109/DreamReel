# ADR-0005: 长任务持久化（video jobs）

- 状态：已接受（2026-10-23）
- 相关：ADR-0001（PostgreSQL）、ADR-0004（Express）
- 任务：R3-T3.5

## 背景

视频生成当前是「进程内异步任务」：

- `videoService.activeTasks` 是内存 Map，服务重启即丢失；
- 路由立即返回 `202 generating`，客户端只能轮询项目镜头状态；
- 没有幂等键，重复点击会重复扣额度、重复调用 provider；
- 多实例部署时，任务状态与取消操作只对当前实例可见。

付费生成是长任务（几十秒到数分钟），必须具备「重启可恢复、重复提交不重复执行、状态可查询、可取消」。

## 决策

1. **PostgreSQL 作为任务唯一事实源**，新增迁移 `015_video_jobs.sql`。内存 Map 降级为运行期缓存，不再作为状态来源。
2. 状态机固定为：
   ```
   queued → running → succeeded
                    ├→ failed
                    └→ canceled
   ```
   - `cancel_requested` 不单独成状态，用布尔列表达；worker 在镜头边界检查并转入 `canceled`。
   - 重试不新增状态，用 `attempt / max_attempts` 表达。
3. **租约式领取**：worker 领取任务时写 `worker_id + lease_expires_at`；启动/周期扫描把租约过期的 `running` 任务：
   - `attempt < max_attempts` → 回到 `queued`；
   - 否则 → `failed`（`error_code=LEASE_EXPIRED`）。
4. **幂等键**：客户端通过 `Idempotency-Key` 头提交；唯一约束 `(user_id, type, idempotency_key)`。重复提交返回已有任务（`200` + `replayed=true`），不重复扣额度。
5. **进度**：任务行保存 `total / completed / message / updated_at`；worker 每完成一个镜头更新一次，查询接口返回同一结构。
6. **API**（v1 与 legacy 共用实现）：
   | 方法 | 路径 | 说明 |
   |---|---|---|
   | POST | `/api/video/jobs` | 创建任务；body `{ projectId, shotIds?, styleId? }`；返回 `202 { jobId }` |
   | GET | `/api/video/jobs/:jobId` | 任务详情（含进度） |
   | GET | `/api/video/jobs?projectId=` | 项目任务列表（最近 N 条） |
   | POST | `/api/video/jobs/:jobId/cancel` | 请求取消；已终态返回 `409` |
7. **权限**：创建/查询/取消都复用 `requireProjectAccess`；取消只允许项目所有者。
8. **Worker 形态**：内置轮询 worker（默认 1s，`VIDEO_JOB_WORKER_INTERVAL_MS`），单实例默认开启；多实例通过租约天然互斥，不需要 Redis。BullMQ 迁移留到确有跨实例吞吐需求时。
9. **额度**：额度在任务创建时扣减；创建后失败/取消不自动退还（与当前即时生成语义一致），后续可增加补偿任务。

## 备选方案

| 方案 | 结论 | 原因 |
|---|---|---|
| 继续只用内存 Map | 未采用 | 重启丢任务，无法满足恢复与多实例 |
| BullMQ + Redis | 暂不采用 | 基础部署没有 Redis；引入新基础设施与运维面，收益在吞吐而非持久化 |
| 独立 worker 进程/服务 | 暂不采用 | 迁移面大；先以内置 worker + 租约验证语义，再按负载拆分 |
| 复用 `generationHistory` 当任务表 | 未采用 | 历史是完成态记录，缺状态机、租约、幂等约束 |

## 后果

正面：

- 重启后 `running` 任务可回到队列，客户端可继续查询。
- 幂等键消除重复点击造成的重复扣费与重复生成。
- 任务状态与取消跨实例可见。
- 不引入 Redis 等新基础设施。

负面：

- 新增一张表与 worker 生命周期管理，测试需要覆盖租约/恢复/幂等。
- 单 worker 吞吐有限；高并发需要后续拆分 worker 或迁 BullMQ。
- 额度补偿暂缺，失败任务仍消耗额度。

风险与缓解：

- **重复执行**：租约 + `attempt` 上限；每次领取先做条件更新（`WHERE status='queued'`）。
- **取消延迟**：只在镜头边界生效；长单镜头无法中断 provider 调用。
- **表膨胀**：任务保留 30 天，按 `created_at` 定期清理（脚本 + cron）。

## 验收

- 迁移 `015` 可前滚；`db:status` pending=0。
- 杀进程重启后，`queued/running`（租约过期）任务可继续完成。
- 相同 `Idempotency-Key` 重复 POST 只创建一个任务、只扣一次额度。
- 跨用户查询/取消任务返回 403；own 200。
- `npm run check` 全绿，新增 jobs 状态机、幂等、恢复测试。
