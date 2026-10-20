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
