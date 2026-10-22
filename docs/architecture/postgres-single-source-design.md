# PostgreSQL 单一事实源设计（小说域已落地）

> 状态：小说域单一事实源（PG-only）设计与现状（2026-10-22）
> 关联：ADR-0001（PostgreSQL + Repository）、`docs/plans/2026-10-22-novel-legacy-removal.md`
> 目标：小说域只保留 PostgreSQL 一条读写路径；`storage/data/db.json` 只承载尚未迁移的非小说集合。

## 1. 结论先行

- 小说域的结构化数据**只写 PostgreSQL、只读 PostgreSQL**；不存在读/写模式开关。
- 请求路径不再依赖 `storageService` 的小说内存投影，也不再依赖 JSON 小说集合。
- `db.json` 中的小说集合已停止写入并归档到 `storage/archive/novels-from-db-*.json`；
  `db.json` 仅保留用户/项目/社区/团队/计费等尚未迁移的集合。
- 启动不再为业务请求水合小说集合；旧归档只由离线恢复/回填工具读取。
- 回滚以 `pg_dump` / PITR 为唯一数据回滚手段；不再保留 JSON 双写或模式切换回滚。
- CI 门禁 `npm run check:legacy` 扫描 `src/**` 与 `scripts/**`，禁止重新引入旧路径；
  离线恢复/回填工具在脚本内单独 allowlist。

## 2. 当前基线

| 项 | 基线 |
|---|---|
| 分支 | `feat/novel-pg-single-source` 线（`a2f72c0` 起小说主表/子集合 PG 优先） |
| 写路径收口 | `5cccf64`、`5fe1605`、`d6c9ed9`、`e4015f9` 已分别收口写入、世界/资产/同步、集合选定/counts、运维脚本的 PG 读 |
| 请求路径 | 生产 API 已不依赖 `storageService` 的小说内存投影 |
| 真实数据 | 《殖装》33 季 / 8496 集 / 1206 章 |
| 测试基线 | 后端 817、前端 138；`series:verify` 33 季 / 8496 集 / 时长达标 99.69% / 正文覆盖 99.98% |
| 恢复基线 | `pg_dump` 可恢复；归档 JSON 仅作应急重建（见 `docs/runbooks/novel-pg-restore.md`） |

> Phase 1–5 已合并完成；`npm run check:legacy` 为 0 违规。
> 仅保留离线恢复/回填工具、归档读取与 `apply*` 原语，均在 allowlist 内，不在请求/启动路径。

## 3. 背景与问题（已解决）

过渡期曾出现「PG 读 + JSON 写 + 异步镜像」的双事实源：

- 前端列表读 PG，剧本/分镜/资产按 JSON 查，集 ID 不一致时出现 `episode not found`；
- 运行中的进程把内存里的旧数据写回，覆盖重建结果；
- 多实例部署时各自维护内存投影，存在覆盖写与重复镜像风险。

根因是双事实源。移除旧写路径与内存投影后，上述问题在结构上消失。

## 4. 目标架构

```
React (web/) ──HTTP──> Express routes ──> Services
                                          │
                                          ├─ Repositories / UnitOfWork (Kysely)
                                          │     ├─ Novel / NovelSource
                                          │     ├─ Chunk / Season / Episode
                                          │     ├─ Character / State / World / Asset / Set
                                          │     └─ PlanRun / PlanArtifact
                                          │
                                          └─ withNovelTransaction()
                                                └─ PostgreSQL 16
Media (images/videos/audio) ──> disk / object storage
                                   DB 只存 storage_key + mime + size + sha256
```

关键原则：

1. **Service 不直接持有存储细节**：小说域依赖仓储/事务接口，不再调用 `storageService` 的小说集合方法。
2. **一次业务操作一个事务**：分季分集、重建、级联删除、批量抽取在同一事务内完成。
3. **批量规划串行化**：同一小说使用 `pg_advisory_xact_lock(hashtext('novel:'||id))`，禁止并发重排。
4. **稳定逻辑键**：季 `(novel_id, season_no)`、集 `(novel_id, logical_key)` 作为 upsert 键；重排保留既有 `id`，避免资产/交接包成为孤儿。
5. **文本与媒体分离**：正文/清洗稿入 PG；媒体字节留本地/网盘/NAS，PG 只存元数据。

## 5. 领域边界

| 数据 | 位置 | 说明 |
|---|---|---|
| 小说、季、集、章节、角色、状态、世界观、资产元数据、规划产物 | **PostgreSQL** | 小说域唯一事实源 |
| `source/cleaned.txt`（约 3–4M 字） | PG `novel_sources.cleaned_text` | 偏移只在 JS 侧（UTF-16 code unit）切片 |
| 图片/视频/音频字节 | 本地 → 网盘/NAS | PG 只存 `media_objects` 元数据与 `storage_key` |
| 用户/项目/社区/团队/计费等 | `storage/data/db.json` | 各自域迁移完成前保留；**不含小说集合** |
| 旧小说 JSON 快照 | `storage/archive/novels-from-db-*.json` | 只读归档；仅供离线恢复/回填/审计 |

### 5.1 `db.json` 边界（重要）

- 小说集合（`novelProjects`、`novelChunks`、`novelCharacters`、`novelCharacterStates`、
  `seriesSeasons`、`seriesEpisodes`、`novelWorldEntities`、`novelAssetImages`、
  `characterSets`、`worldSets`）**不再写入 `db.json`**。
- 首次切换时把旧集合归档到 `storage/archive/`，随后从 `db.json` 移除；归档不参与运行时读写。
- 非小说集合在各自域迁移完成前继续使用 JSON；全站迁移后再整体归档 `db.json`。
- 禁止把归档 JSON 重新加载进请求路径；只有离线恢复/回填脚本可以读取。

## 6. 数据模型（小说域）

核心表：

| 表 | 用途 |
|---|---|
| `novels` | 小说主表、阶段、计数、`org_id` |
| `novel_sources` | 清洗稿全文、hash、字数、编码 |
| `novel_chunks` | 章节元数据、`start_offset/end_offset`、`cleaned_hash` |
| `seasons` | 季、弧线、目标、钩子、章节范围、规划 provider |
| `episodes` | 集、`logical_key`、偏移、估算时长、大纲、剧本、状态 |
| `novel_characters` / `novel_character_states` | 角色与集内状态 |
| `novel_world_entities` | 世界观实体 |
| `novel_asset_images` | 设定图/资产元数据 |
| `character_sets` / `world_sets` | 备选集合与选定集 |
| `novel_plan_runs` / `novel_plan_artifacts` | 规划运行与章摘要/弧线/季产物 |
| `media_objects` / `media_sync_jobs` | 媒体元数据与同步任务 |

约束与口径：

- 统一 `org_id`、`created_at / updated_at / deleted_at / version`。
- 集重排按 `logical_key` upsert；软删除保留审计。
- 偏移为 **UTF-16 code unit**，与 JS `String.slice` 一致；不要在 SQL 侧按字符切片。
- `novel_chunks.content` 停止写入，正文按偏移从 `novel_sources.cleaned_text` 读取。

## 7. 写路径

```js
await withNovelTransaction(novelId, async (tx) => {
  await tx.advisoryLockNovel(novelId)
  await tx.planRuns.markSuperseded(novelId)
  await tx.sources.upsert(...)
  await tx.chunks.replaceAll(novelId, chunks)
  await tx.seasons.replaceForNovel(novelId, seasons)
  await tx.episodes.replaceForNovel(novelId, episodes)
  await tx.novels.updateCounts(novelId, counts)
  await tx.planRuns.finish(runId, stats)
})
```

- 一个事务覆盖「清旧 + 写新 + 更新 counts」，失败整体回滚，不出现半套季/集。
- 批量插入使用多值 `INSERT ... ON CONFLICT`；8–9k 行在单事务内可接受。
- 单条编辑（剧本、大纲、状态）用 `version` 乐观锁，不抢占小说级 advisory lock。
- 多实例安全：advisory lock 是数据库级，跨进程生效。
- 小说域**不产生 outbox 事件**；outbox 仅服务尚未迁移的其它域。

## 8. 读路径与 API 兼容

- 读统一走仓储；API 响应形状不变，前端无需改动。
- `GET /episodes` 返回 `id/title/targetSeconds/estimatedSeconds/chapterStart/chapterEnd/outline/screenplay/status/...`。
- `GET /chunks` 默认不返回全文；`?full=1` 时从 `novel_sources` 按偏移切片。
- 列表过滤/分页下推 SQL：episodes 按 `season_id/episode_no`，assets 按 `category`，characters/entities 按 `sort_order`。
- 不再有读回退到 JSON 的路径；PG 不可用时接口应按 5xx/健康检查失败暴露，而不是返回陈旧 JSON。

## 9. 恢复与归档

### 9.1 正式备份

- 每日 `pg_dump` + WAL/PITR；季度恢复演练。
- 只恢复 PG，不恢复 `db.json` 小说集合。

### 9.2 归档 JSON 的定位

- `storage/archive/novels-from-db-*.json` 是**历史快照**，不是事实源。
- 仅在这些场景使用：
  - PG 数据误删且没有可用 PITR 时的应急重建；
  - 离线回填/迁移旧数据；
  - 审计与对账。
- 读取归档的脚本必须登记在 `scripts/check-legacy-paths.js` 的 allowlist，且不得被服务启动路径或测试编排引用。

### 9.3 恢复流程

见 `docs/runbooks/novel-pg-restore.md`：优先 `pg_dump`/PITR；无备份时用 `npm run db:restore:novel -- --novel <id>` 从归档重建，再跑 `series:verify` 与 API smoke。

## 10. 移除计划与阶段状态

完整清单见 `docs/plans/2026-10-22-novel-legacy-removal.md`。阶段与当前状态：

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 0 | 冻结基线、`pg_dump` + 归档备份、恢复演练可执行 | ✅ |
| Phase 1 | 测试迁 PG：移除测试编排的 JSON 小说模式，fixture 全部写 PG | ✅ |
| Phase 2 | 删除读适配器与同步导出：读服务统一 PG，`getNovelProject` 异步 | ✅ |
| Phase 3 | 删除写模式与 outbox 镜像：配置、健康检查、镜像调度、小说 outbox | ✅ |
| Phase 4 | 删除 JSON 投影与 `db.json` 小说集合：启动水合、归档运行时、JSON CRUD | ✅ |
| Phase 5 | 删除同步生成/规划/资产残留，CLI 全部异步 PG | ✅ |
| Phase 6 | 文档与门禁收口：本文件、database、runbook、AGENTS、`check:legacy` | ✅ 文档与门禁已落地 |

所有 Gate 已满足：`npm run check:legacy` 0 违规、`npm run check` 全绿、API smoke 与 `series:verify` 通过。

## 11. 测试策略

| 类型 | 内容 |
|---|---|
| 契约测试 | 小说仓储 CRUD/软删/乐观锁/事务回滚 |
| 集成测试 | 独立 `_test` 库；规划 → 剧本 → 资产 → 合成 → 同步 |
| 并发测试 | 两个 `planSeries` 并发；advisory lock 串行化；无死锁/无重复 |
| 故障注入 | 事务中途抛错 → 无半套季/集；连接断开重试 |
| 数据校验 | `series:verify`：季/集数、时长、覆盖、偏移、边界 |
| 迁移测试 | 空库全量迁移；checksum 保护；重复执行幂等 |
| E2E | 导入 → 分季分集 → 单集 → 分镜 → 成片 → 导出/同步 |

测试不得依赖 `db.json` 小说集合；测试结束清理 `_test` 库。

## 12. 运维设计

- **迁移**：编号 SQL + checksum + advisory lock；已应用迁移只增不改。
- **连接池**：`DB_POOL_MAX` 按实例数 × 并发调优；设置 `statement_timeout`。
- **监控**：慢查询、事务回滚率、规划耗时、行数漂移、连接池饱和。
- **发布**：先迁移，再发布应用；切换窗口内禁止重建/规划；观察 24h。
- **回滚**：应用版本可回滚；小说数据回滚只依赖 `pg_dump`/PITR。**没有 JSON 双写回滚开关。**

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 40+ service 同步转异步，改动面大 | 按域迁移；先小说域；仓储契约测试兜底 |
| 长事务锁表 | 单事务批量插入；只锁该小说的 advisory lock |
| 8.5k 集写入慢 | 多值 INSERT；迁移期按需调整索引 |
| 文本/备份膨胀 | `cleaned_text` 入 PG；媒体不入库 |
| 重排导致资产孤儿 | `logical_key` upsert + 软删除 + 媒体归档 |
| 多实例并发写 | 数据库 advisory lock + 乐观锁 |
| 旧 `db.json` 误删 | 先归档到 `storage/archive/`，只清理小说 key |
| 离线工具被误用进请求路径 | `check:legacy` allowlist + 代码审查 |

## 14. 验收标准（小说域）

1. `npm run check` 全绿；`npm run check:legacy` 违规数为 0。
2. 规划/重建在事务内完成；注入异常后无残留季/集。
3. 同一小说并发规划被 advisory lock 串行化，结果一致。
4. 集 ID 在重排前后按 `logical_key` 稳定；资产/交接包不再孤儿。
5. `GET /episodes|seasons|chunks|assets` 与 `POST /script|assets|compose|handoff` 全链路通过。
6. 服务重启后不读取 `db.json` 小说集合，API 正常。
7. `series:verify` 通过；真实项目 33 季 / 8496 集基线不退化。
8. `pg_dump` 恢复演练通过；恢复后 `/health/ready` 与小说读写正常。

## 15. 已确认决策

| # | 决策 | 结论 |
|---|---|---|
| 1 | 范围 | **小说域先行**；稳定后按域推广全站 |
| 2 | `cleaned.txt` | 入 PG `novel_sources.cleaned_text`；偏移只在 JS 侧切片 |
| 3 | `db.json` | 小说集合归档后移除；非小说集合保留到各自域迁移完成 |
| 4 | 稳定 ID | `logical_key` upsert，重排保留既有 `id` |
| 5 | 多租户 | 本期 `org_id` 应用层隔离；RLS 后续 |
| 6 | 媒体 | 统一 `media_objects`；NAS 走 WebDAV 适配器 |
| 7 | 回滚 | 应用版本 + PG 备份/PITR；不保留 JSON 双写 |
