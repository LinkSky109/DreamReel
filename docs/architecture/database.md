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

## Phase 4 扩面：章节 / 角色 / 世界观（只读）

同一开关 `NOVEL_REPO_MODE` 同时作用于：

- `GET /api/novels/:id/chunks`
- `GET /api/novels/:id/characters`
- `GET /api/novels/:id/world/entities`

迁移：

```bash
npm run db:migrate:novel-children            # chunks + characters + entities
npm run db:migrate:novel-children -- --kind=chunks
npm run db:verify:novel-children
```

实测（真实数据）：

| 集合 | 行数 | 迁移差异 | shadow 告警 | PG vs JSON |
|---|---:|---:|---:|---|
| chunks | 1206 | 0 | 0 | 内容与顺序一致 |
| characters | 559 | 0 | 0 | 内容与顺序一致 |
| entities | 725 | 0 | 0 | 内容与顺序一致 |

### 顺序稳定性（005 迁移）

JSON 对象插入顺序是角色/实体列表的隐含契约；`created_at` 可能相同，不能作为稳定排序。
新增 `sort_order` 列，迁移时写入源顺序，PG 查询按 `sort_order` 排序：

- 角色/实体保持与旧接口完全相同的顺序；
- 实体仍按 `mentions` 降序，`sort_order` 作为稳定次级顺序。

### 选择集过滤

角色/世界观列表会按 `selectedCharacterSet` / `selectedWorldSet` 过滤。迁移期这两个配置仍在 JSON，
PG 读取后在服务层做同样的过滤与排序，保证响应语义不变。

## Phase 4 扩面：季 / 集 / 设定图（只读）

同一 `NOVEL_REPO_MODE` 继续覆盖：

- `GET /api/novels/:id/seasons`
- `GET /api/novels/:id/episodes`（支持 `?seasonId=`）
- `GET /api/novels/:id/assets`（支持 `?category=`，统计由返回行计算）

迁移：

```bash
npm run db:migrate:novel-children
npm run db:verify:novel-children
```

实测（真实数据）：

| 集合 | 行数 | 迁移差异 | shadow 告警 | PG vs JSON |
|---|---:|---:|---:|---|
| seasons | 41 | 0 | 0 | 内容与顺序一致 |
| episodes | 8378 | 0 | 0 | 内容与顺序一致（含 seasonId 过滤） |
| assets | 1621 | 0 | 0 | 内容/顺序/统计一致（含 category 过滤） |

累计迁移 **12,530 行**（6 个集合）。

### 顺序与统计

- 季按 `seasonNo` 升序、集按 `episodeNo` 升序；
- 设定图按 `createdAt` 降序，`sort_order` 作为稳定次级顺序（006 迁移）；
- 资产统计改为由返回行计算，避免"列表走 PG、统计走 JSON"的口径分裂。

### 重要边界

季/集/设定图的**写路径尚未镜像**：重新抽取或生成新数据后，PG 会滞后于 JSON。
因此当前 `postgres` 读模式只用于迁移验证，正式切换前必须先补写镜像（下一步）。

## Phase 4 写镜像：六类子集合

`NOVEL_WRITE_MODE=dual` 现在覆盖：

| 集合 | 触发方法 |
|---|---|
| chunks | `createNovelChunk` |
| characters | `createNovelCharacter` / `updateNovelCharacter` |
| entities | `createWorldEntity` / `updateWorldEntity` |
| seasons | `createSeason` |
| episodes | `createEpisode` / `updateEpisode` |
| assets | `createNovelAssetImage` / `updateNovelAssetImage` / `deleteNovelAssetImage` |

实现要点：

- 写入进入**写后队列**，同 id 合并，串行 flush，避免批量抽取时打满连接池；
- 删除为软删除；同一 id 重新写入会清除 `deleted_at`；
- 删除作品时按 `novel_id` 软删除六类子集合；
- `sort_order` 对新增行使用毫秒时间戳追加到末尾（007 迁移改为 bigint，避免 int4 溢出）；
- 失败只告警，不回滚 JSON；进程关闭时 `flushNow()` 尽量排空。

联调实测（真实 PostgreSQL）：

- 六类 upsert 各 1 行，更新角色名后 PG 同步为「甲-改」；
- `deleteNovelProjectCascade` 后六类未删除行均为 0（软删除生效）。

仍存在的边界：

- 队列为进程内、fire-and-forget；进程崩溃会丢最后一批写；
- 多实例部署时各自写库，需要后续换 outbox/队列；
- `novel_character_states`、角色集/世界观集尚未迁移。
