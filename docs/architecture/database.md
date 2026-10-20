# 数据库与 Repository（Phase 3）

## 连接与开关

```bash
DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel
DB_DRIVER=postgres   # json | postgres | dual
```

`json` 仍是默认驱动，业务代码暂未切换；本阶段只建立基础设施与试点 Repository。

## 迁移

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
- 已应用文件内容被修改（校验和不一致）时直接失败，避免"悄悄改历史"。

## 表结构

当前 18 张业务表 + `schema_migrations`：

| 域 | 表 |
|---|---|
| 身份/租户 | `organizations`、`users`、`memberships` |
| 创作 | `projects`、`project_members`、`characters`、`scenes`、`shots` |
| 小说 | `novels`、`novel_chunks`、`novel_characters`、`novel_character_states`、`novel_world_entities`、`seasons`、`episodes`、`novel_asset_images` |
| 运维 | `audit_logs`、`idempotency_keys` |

约定：

- 业务主键沿用现有字符串 `id`；
- 每张租户表带 `org_id`；
- 统一 `created_at / updated_at / deleted_at / version`；
- 高频过滤字段提升为列，其余放 `payload jsonb`，保证旧数据可原样回放；
- 金额、时间等强类型字段后续按领域提升为列。

## Repository 契约

试点：`src/repositories/novelRepository.js`。

```js
list({ orgId, limit, offset, includeDeleted }) -> Novel[]
findById(id, { orgId }) -> Novel | null
create(novel, { orgId }) -> Novel
update(id, patch, { orgId, expectedVersion }) -> Novel
softDelete(id, { orgId }) -> boolean
```

- JSON 适配器直接读写 `storage.novelProjects`，用于迁移期和旧测试；
- PostgreSQL 适配器使用 Kysely，列字段与 `payload` 合并后返回；
- 乐观锁：`expectedVersion` 不匹配抛 `code=CONFLICT`；
- 软删除：默认列表排除，`includeDeleted=true` 可见。

契约测试：`tests/novelRepository.test.js`，同一组断言分别跑两个适配器；未配置 `DATABASE_URL` 时 PostgreSQL 用例自动跳过。

## Phase 4 迁移顺序

1. `auth/user/subscription`
2. `project/character/scene/shot`
3. `novel*`
4. `community/team/enterprise`
5. `audit/usage/billing`

每迁一个领域：Repository 契约测试 → 原单测 → 关键 E2E → 才允许删除旧存储调用。

## Phase 4 试点：novels 只读切换

已验证：`novelProjects` → `novels` 迁移后，PostgreSQL 返回与 JSON 语义一致。

```bash
npm run db:migrate:novels -- --dry-run   # 预览
npm run db:migrate:novels                # 幂等 upsert
npm run db:verify:novels                 # 逐条核对 title/counts
```

运行时开关（默认 `legacy`，不改变现有行为）：

```bash
NOVEL_REPO_MODE=legacy     # 全部走 JSON
NOVEL_REPO_MODE=shadow     # 返回 JSON，同时读 PG 比对并告警
NOVEL_REPO_MODE=postgres   # 列表/详情走 PG（写仍走 JSON）
```

覆盖范围：`GET /api/novels`、`GET /api/novels/:id`。

影子读比对字段：`title/status/updatedAt/counts/stage`；不一致写 `[novel-shadow]` 告警，仍返回 JSON 结果，避免影响线上。

实测：

- 迁移 `inserted=1 updated=0`，`verify mismatches=0`；
- shadow 模式 0 条告警；
- postgres 模式列表/详情与 legacy 响应**语义完全一致**（内部字段 `orgId/version/deletedAt` 不对外暴露）；
- PG 不可用时自动回退 legacy 并告警。

写入路径（create/update/delete）仍在 `novelProjectService` 中走 JSON，属于下一步。

## Phase 4 写路径：双写（JSON 为准）

开关：

```bash
NOVEL_WRITE_MODE=legacy   # 默认，不写 PG
NOVEL_WRITE_MODE=dual     # JSON 写入成功后异步镜像 PG
```

覆盖：`createNovelProject`、`updateNovelProject`、`deleteNovelProject`。

行为：

- JSON 仍是事实源，请求不等待 PG；
- 镜像失败只记录 `[novel-write]` 告警，不影响接口；
- 删除在 PG 侧是**软删除**，便于回滚与审计；
- `postgres` 写模式尚未开放，配置为 `postgres` 时等同 `legacy`，避免误判。

联调实测：

- `POST /api/novels` → PG 出现同名记录（`status=created`，`stage=source`）；
- `DELETE /api/novels/:id` → PG `deleted_at` 置位；
- 无 `[novel-write]` 告警；
- 清理测试记录后 `db:verify:novels` 仍为 `mismatches=0`。

已知限制：

- 镜像为 fire-and-forget，进程退出前可能未落库；
- `updateNovelProject` 调用频繁（如重算 counts），双写期间 PG 写放大会高于 JSON；
- 需定期执行 `npm run db:verify:novels` 对账。
