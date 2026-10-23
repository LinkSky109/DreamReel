# 整改收口总结（R0–R3，2026-10-23）

> 计划：`docs/plans/2026-10-22-remediation-plan.md`
> 状态：**R0–R3 全部收口，main 已推送并通过发布门禁**
> 最终提交：`74ff3af`（main = origin/main）

## 1. 结论

本轮整改完成小说域 PostgreSQL 单源、R1 安全/发布止血、R2 契约与构建收口、R3 技术债九组。
当前代码可发布；剩余事项均为已记录的增量改进，不阻塞运行。

| 轮次 | 主题 | 结果 |
|---|---|---|
| R0 | 基线/备份/门禁 | 完成；基线 tag `novel-pg-cutover-2026-10-22` |
| R1 | 数据安全、安全 P0、发布链 | 完成；tag `r1-stopgap` |
| R2 | 契约、构建链、全量门禁 | 完成；tag `r2-cutover` |
| R3 | IDOR/身份/校验/配额/长任务/错误/前端/可观测/契约自动化 | 完成（九组） |

## 2. R3 交付摘要

| 组 | 核心结果 |
|---|---|
| T3.1 IDOR | 统一项目归属校验；projects/video/versions/export/analysis/collab/open-v1 全覆盖；38 条越权矩阵 |
| T3.2 身份 | `req.userId` 单一来源；`ALLOW_ANONYMOUS`；body/query 身份失效 |
| T3.3 校验 | projects/video/teams/gallery/novels zod 契约；422 与字段剥离 |
| T3.4 配额 | LLM 日配额 429；匿名 provider 强制 mock |
| T3.5 长任务 | ADR-0005；迁移 015；jobs API + 租约 worker；幂等/恢复/取消 |
| T3.6 错误 | `AppError` + 集中映射；4xx/5xx 兜底清零；500 不泄漏 |
| T3.7 前端 | 401 跳转、Editor smoke、删 legacy `public/js`、StrictMode、ESLint web、覆盖率门槛 |
| T3.8 韧性 | Redis 限流/幂等（真实双实例验证）、CSP/HSTS、池指标、备份恢复演练 |
| T3.9 契约 | `check:api` 0 死链并接入 `npm run check` |

## 3. 最终验证

| 命令 | 结果 |
|---|---|
| `npm run check` | 后端 **946**（944 pass / 2 skip）；前端 **162**；lint 0 error；契约死链 0 |
| 覆盖率门槛 | statements 50 / branches 46 / functions 35 / lines 51（当前 50.87/46.88/35.97/52.11） |
| `gate.sh e2e` | 1 passed |
| `gate.sh build` | `public/` + `web/dist/` 通过 |
| `gate.sh smoke` | health/ready、401/200、静态首页通过 |
| `db:status` | `001`–`015` applied，pending 0 |
| 备份恢复 | 关键表行数一致（见 `2026-10-23-backup-restore-drill.md`） |
| Redis 双实例 | 限流共享 + 幂等重放 2/2 |

## 4. 关键运行开关

| 开关 | 默认 | 用途 |
|---|---|---|
| `REQUIRE_AUTH` | 生产 true | 强制登录 |
| `ALLOW_ANONYMOUS` | 生产 false | 匿名 default 身份（仅开发） |
| `REDIS_URL` | 空 | 限流/幂等切 Redis；空则进程内 |
| `VIDEO_JOB_WORKER_ENABLED` | true | 视频长任务 worker |
| `VIDEO_JOB_LEASE_MS` / `VIDEO_JOB_MAX_ATTEMPTS` | 60000 / 3 | 租约与恢复 |
| `CSP_DISABLED` / `HSTS_ENABLED` | 空 | 安全头覆盖/排障 |

## 5. 回滚

- 代码：按 merge 逆序 revert；或回退到 `r2-cutover` / `r1-stopgap`。
- 数据库：只前滚；`015_video_jobs` 为新增表，可单独 `DROP TABLE video_jobs`；数据恢复用 `pg_dump`/PITR。
- 快速降级：`ALLOW_ANONYMOUS=true`、`CSP_DISABLED=true`、`VIDEO_JOB_WORKER_ENABLED=false`、移除 `REDIS_URL`。

## 6. 后续 backlog（不阻塞收口）

| 项 | 说明 | 预估 |
|---|---|---|
| 覆盖率 80% | 当前 lines 52.11%，需补约 1,200 行测试 | 2–4 天 |
| WAL PITR 演练 | 当前仅验证逻辑备份恢复；需 WAL 归档环境 | 0.5–1 天 |
| type-aware ESLint | TS7 与 `typescript-eslint` peer 不兼容；暂用 Babel 解析 + `tsc` | 上游支持后 |
| `R1-T1B.6` 媒体严格访问开关 | 仍 deferred | 0.5 天 |
| 生产管理员角色初始化 / API Key 惰性迁移 | 运维动作 | 上线前 |

## 7. 文档索引

- 计划：`docs/plans/2026-10-22-remediation-plan.md`
- R2 交付：`docs/delivery/2026-10-22-r2-cutover.md`
- R3 交付：`docs/delivery/2026-10-23-r3-debt.md`
- 备份演练：`docs/delivery/2026-10-23-backup-restore-drill.md`
- ADR：`docs/adr/0005-video-job-persistence.md`
- 状态：`docs/handoff/STATE.md` / 历史：`docs/handoff/JOURNAL.md`
