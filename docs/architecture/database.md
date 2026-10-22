# 数据库与 Repository

> 2026-10-22：小说域已固定 PostgreSQL 单源；本文描述当前数据库、迁移与仓储约定。
> 小说域移除计划见 `docs/plans/2026-10-22-novel-legacy-removal.md`；
> 设计见 `docs/architecture/postgres-single-source-design.md`。

## 1. 连接与驱动

```bash
DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel
DB_DRIVER=postgres
```

- 小说域**固定使用 PostgreSQL**，不受 `DB_DRIVER` 影响，也不存在读/写模式开关。
- `DB_DRIVER` 只控制尚未迁移域的 Repository 选择（如项目/身份试点）。
- `storage/data/db.json` 只保留非小说集合；小说集合已归档到 `storage/archive/novels-from-db-*.json`，不参与运行时读写。
- 运行时依赖 PG 的服务启动前必须能连接数据库；`/health/ready` 会检查连接。

## 2. 迁移

迁移文件：`src/db/migrations/*.sql`，按文件名排序执行。

```bash
npm run db:migrate           # 执行挂起的迁移
npm run db:migrate -- --dry-run
npm run db:status
```

实现要点（`src/db/migrate.js`）：

- `schema_migrations(version, checksum, applied_at)` 记录已应用版本；
- 每个迁移在独立事务内执行，失败回滚；
- `pg_advisory_lock` 防止并发迁移；
- 已应用文件内容被修改（校验和不一致）时直接失败，避免“悄悄改历史”。

迁移只增不改。需要变更已上线结构时新增迁移，按 expand → backfill → contract 处理。

## 3. 表结构

当前业务表：

| 域 | 表 |
|---|---|
| 身份/租户 | `organizations`、`users`、`memberships` |
| 创作 | `projects`、`project_members`、`characters`、`scenes`、`shots` |
| 小说 | `novels`、`novel_sources`、`novel_chunks`、`novel_characters`、`novel_character_states`、`novel_world_entities`、`seasons`、`episodes`、`novel_asset_images`、`character_sets`、`world_sets` |
| 小说规划 | `novel_plan_runs`、`novel_plan_artifacts` |
| 媒体 | `media_objects`、`media_sync_jobs` |
| 运维 | `outbox_events`（仅非小说域使用）、`audit_logs`、`idempotency_keys` |
| 迁移 | `schema_migrations` |

约定：

- 业务主键沿用现有字符串 `id`；
- 每张租户表带 `org_id`；
- 统一 `created_at / updated_at / deleted_at / version`；
- 高频过滤字段提升为列，其余放 `payload jsonb`，保证旧数据可原样回放；
- 金额、时间等强类型字段后续按领域提升为列。

小说域补充：

- `novel_sources.cleaned_text` 存清洗稿；`novel_chunks.content` 停止写入，正文按偏移读取。
- 偏移是 UTF-16 code unit，只在 JS 侧 `slice(start, end)`。
- `episodes.logical_key` + 部分唯一索引保证重排稳定；季使用 `(novel_id, season_no)`。
- 小说域不产生 outbox 事件。

## 4. Repository 契约

小说域：

```js
// NovelRepository
list({ orgId, limit, offset, includeDeleted }) -> Novel[]
findById(id, { orgId }) -> Novel | null
create(novel, { orgId, tx }) -> Novel
update(id, patch, { orgId, expectedVersion, tx }) -> Novel
softDelete(id, { orgId, tx }) -> boolean

// 子集合仓储
list(novelId, { tx })
replaceAll(novelId, rows, { tx })
upsert(row, { tx })
softDelete(id, { tx })
```

- PostgreSQL 适配器使用 Kysely；列字段与 `payload` 合并后返回。
- 乐观锁：`expectedVersion` 不匹配抛 `code=CONFLICT`。
- 软删除：默认列表排除，`includeDeleted=true` 可见。
- 契约测试：`tests/novelRepository.test.js` 等；未配置 `DATABASE_URL` 时 PG 用例跳过。

## 5. 事务与锁

`src/repositories/unitOfWork.js` 提供 `withNovelTransaction(novelId, fn)`：

- 事务开始即取 `pg_advisory_xact_lock(hashtext('novel:'||id))`；
- 分季分集、重建、级联删除、批量抽取在同一事务内完成；
- 失败整体回滚，不留下半套季/集；
- 单条编辑使用 `version` 乐观锁，避免长事务。

## 6. 数据迁移与校验

```bash
npm run db:migrate:novels            # 小说主表迁移（幂等）
npm run db:verify:novels             # 主表逐条核对
npm run db:migrate:novel-children    # 子集合迁移
npm run db:verify:novel-children     # 子集合逐条核对
npm run series:verify -- <novelId>   # 季/集时长、覆盖、偏移
```

- 迁移脚本幂等（按 id upsert）。
- `db:verify:*` 做双向比对，PG 多出的行也会报差异。
- `db:cleanup:test-data` 默认 dry-run；确认后加 `--apply`。
- 离线恢复/回填工具读取 `storage/archive/novels-from-db-*.json`，禁止被请求路径引用。

## 7. 备份与回滚

- 正式备份：每日 `pg_dump` + WAL/PITR；季度恢复演练。
- 回滚：应用版本回滚 + PG 备份/PITR 恢复；小说域没有 JSON 双写回滚开关。
- 归档 JSON 只用于无备份时的应急重建与审计，见 `docs/runbooks/novel-pg-restore.md`。

## 8. 后续域迁移

顺序：auth/user/subscription → project/character/scene/shot → community/team/enterprise → usage/audit/billing。

每迁一个域：

1. Schema 迁移；
2. Repository + 契约测试；
3. 数据回填与对账；
4. 切读写；
5. 删除旧存储调用，归档该域 JSON 集合。

全站迁移完成后归档 `db.json`，停用 outbox worker，再删除过渡设施。
