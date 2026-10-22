# PostgreSQL 单一事实源设计（结构化数据全量落库）

> 状态：设计提案（2026-10-21）
> 关联：ADR-0001（PostgreSQL + Repository）、`docs/runbooks/novels-postgres-cutover.md`
> 目标：结束「PG 读 + JSON 写 + outbox 镜像」的过渡态，让 PostgreSQL 成为唯一事实源。

## 1. 背景与问题

当前小说域已经切到「**PostgreSQL 读、JSON 写、outbox 异步镜像**」：

- 前端始终通过后端 API 取数，不直接读 JSON；
- 但后端写路径仍以 `storage/data/db.json` 为准，PG 只是镜像；
- 读 PG、写 JSON 的两套事实源会产生**集 ID 不一致**：
  - 前端列表（PG）能打开某集；
  - 剧本/分镜/资产（按 JSON 查）报 `episode not found`。

2026-10-21 已实际发生一次：运行中的开发服务把内存里的旧 JSON 写回，覆盖了重建结果，JSON 与 PG 的 8495/8496 集 ID 完全不同。靠「停服务 + 重建 + 同步」修复，但**根因是双事实源**。

## 2. 现状盘点

| 层 | 现状 |
|---|---|
| 读 | 小说域直接走 PG（`NOVEL_REPO_MODE` 已移除） |
| 写 | `NOVEL_WRITE_MODE=dual`，JSON 成功后再 outbox 镜像 PG |
| 其它域 | projects/users/community/teams/enterprise/billing… 仍全 JSON |
| `storageService` | 进程内对象 + debounce 全量重写 `db.json`；44 个文件、336 处调用 |
| `novelChildRepository` | PG 适配器只有 `list`，**没有写方法** |
| `novelRepository` | JSON 与 PG 均有 create/update/softDelete，可用于主表写切换 |
| 迁移机制 | 编号 SQL + checksum + advisory lock（`src/db/migrate.js`）已就绪 |
| 文本/媒体 | `source/cleaned.txt`、图片/视频/音频在磁盘；DB 只存路径/元数据 |
| 测试 | `npm test` 会重建独立 `_test` 库；JSON 测试可用 `SKIP_TEST_DB=1` |

结论：基础设施已具备，缺的是**写路径仓储化 + 事务边界 + 域切换**。

## 3. 目标与非目标

### 目标

1. PostgreSQL 成为所有**结构化数据**的唯一事实源。
2. 写路径全部异步仓储 + 事务；不再有「先写 JSON 再镜像」。
3. 读路径统一走仓储；移除 legacy/shadow 双读。
4. 小说域先落地，验证后按域推广到全站。
5. API 形状不变，前端无需改调用。
6. 可备份、可恢复、可观测、可回滚（切写前）。

### 非目标

- 不把图片/视频/音频等大二进制塞进 PG（只存元数据 + 存储键）。
- 不在本阶段引入 ORM 或改写前端。
- 不在本阶段做跨地域/分库分表。
- 不改变现有业务规则（分季分集/剧本/资产逻辑保持不变）。

## 4. 目标架构

```
React (web/) ──HTTP──> Express routes ──> Services
                                          │
                                          ├─ Repositories (Kysely)
                                          │     ├─ NovelRepository
                                          │     ├─ NovelSourceRepository
                                          │     ├─ Chunk/Season/EpisodeRepository
                                          │     ├─ Character/World/AssetRepository
                                          │     └─ ...
                                          │
                                          └─ UnitOfWork.withTransaction()
                                                └─ PostgreSQL 16
Media (images/videos/audio) ──> disk / object storage
                                   DB 只存 storage_key + mime + size + sha256
```

关键原则：

1. **Service 不直接持有存储细节**：依赖 Repository 接口，不再调用 `storageService`。
2. **一次业务操作一个事务**：分季分集、重建、级联删除、批量抽取必须在同一事务内。
3. **批量规划串行化**：同一小说用 `pg_advisory_xact_lock(hashtext('novel:'||id))`，禁止并发重排。
4. **稳定逻辑键**：季 `(novel_id, season_no)`、集 `(novel_id, episode_no)` 作为 upsert 键，重排时保留既有 `id`，避免资产/交接包成为孤儿。
5. **文本与媒体分离**：正文/清洗稿入 PG；媒体留对象存储。

## 5. 领域拆分与迁移顺序

| 阶段 | 域 | 关键表 | 风险 |
|---|---|---|---|
| N1 | 小说（先做） | novels / novel_sources / novel_chunks / characters / states / world / seasons / episodes / assets / plan | 中（已有读 PG 基础） |
| N2 | 身份与租户 | organizations / users / memberships / subscriptions | 高（认证链路） |
| N3 | 创作 | projects / characters / scenes / shots / versions / comments | 高（聚合模型、N+1） |
| N4 | 社区与团队 | reviews / reports / teams / studios / enterprise / api_keys | 中 |
| N5 | 运维与计费 | usage / audit / exports / notifications | 中 |

每个域必须完成：Schema → Repository + 契约测试 → 数据迁移 → 双跑对账 → 切写 → 删旧路径。

## 6. 小说域数据模型设计

### 6.1 新增/调整

```sql
-- 正文：一部小说一份清洗稿（3–4 MB 文本，TEXT/TOAST 足够）
CREATE TABLE novel_sources (
  novel_id      text PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
  org_id        text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type   text NOT NULL DEFAULT 'text',
  source_ref    text NOT NULL DEFAULT '',
  cleaned_text  text NOT NULL DEFAULT '',
  cleaned_hash  text NOT NULL DEFAULT '',
  encoding      text NOT NULL DEFAULT 'utf-8',
  word_count    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1
);

-- 章节：只存偏移与元数据；正文从 novel_sources 切片（JS 侧切）
ALTER TABLE novel_chunks
  ADD COLUMN IF NOT EXISTS start_offset integer,
  ADD COLUMN IF NOT EXISTS end_offset   integer,
  ADD COLUMN IF NOT EXISTS cleaned_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS word_count   integer NOT NULL DEFAULT 0;
-- content 列保留但停止写入（兼容旧数据/迁移），最终可 DROP

-- 季：LLM 大事件信息
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS arc_name          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS goal              text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS acts              jsonb,
  ADD COLUMN IF NOT EXISTS ending_hook       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimated_episodes integer,
  ADD COLUMN IF NOT EXISTS plan_provider     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chapter_start     integer,
  ADD COLUMN IF NOT EXISTS chapter_end       integer;
CREATE UNIQUE INDEX IF NOT EXISTS seasons_novel_no_uq ON seasons (novel_id, season_no) WHERE deleted_at IS NULL;

-- 集：偏移、实际时长、跨章、大纲、剧本
ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS chapter_start     integer,
  ADD COLUMN IF NOT EXISTS chapter_end       integer,
  ADD COLUMN IF NOT EXISTS start_offset      integer,
  ADD COLUMN IF NOT EXISTS end_offset        integer,
  ADD COLUMN IF NOT EXISTS estimated_seconds numeric(8,2),
  ADD COLUMN IF NOT EXISTS short_source      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleaned_hash      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS outline           jsonb,
  ADD COLUMN IF NOT EXISTS screenplay        jsonb,
  ADD COLUMN IF NOT EXISTS target_seconds    integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS logical_key       text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS episodes_logical_uq ON episodes (novel_id, logical_key) WHERE deleted_at IS NULL;

-- 规划运行与产物（替代 plan/*.json）
CREATE TABLE novel_plan_runs (
  id           text PRIMARY KEY,
  org_id       text NOT NULL,
  novel_id     text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  cleaned_hash text NOT NULL,
  provider     text NOT NULL DEFAULT '',
  model        text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'running', -- running | done | failed
  stats        jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE novel_plan_artifacts (
  run_id       text NOT NULL REFERENCES novel_plan_runs(id) ON DELETE CASCADE,
  kind         text NOT NULL, -- chapter-summaries | arcs | seasons | exceptions
  payload      jsonb NOT NULL,
  PRIMARY KEY (run_id, kind)
);

-- 媒体元数据：只存元数据，字节存本地/网盘/NAS
CREATE TABLE media_objects (
  id           text PRIMARY KEY,
  org_id       text NOT NULL,
  novel_id     text REFERENCES novels(id) ON DELETE CASCADE,
  kind         text NOT NULL,                 -- image | video | audio | poster | source
  backend      text NOT NULL DEFAULT 'local', -- local | webdav | nas | quark | s3
  storage_key  text NOT NULL,                 -- backend 内路径/对象键
  url          text NOT NULL DEFAULT '',
  mime         text NOT NULL DEFAULT '',
  size_bytes   bigint NOT NULL DEFAULT 0,
  sha256       text NOT NULL DEFAULT '',
  provider     text NOT NULL DEFAULT '',
  sync_status  text NOT NULL DEFAULT 'local', -- local | syncing | synced | failed
  remote_key   text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS media_objects_novel_kind_idx
  ON media_objects (novel_id, kind) WHERE deleted_at IS NULL;

-- 同步任务（替代 sync/ledger.json 的进程内台账）
CREATE TABLE media_sync_jobs (
  id           bigserial PRIMARY KEY,
  org_id       text NOT NULL,
  media_id     text NOT NULL REFERENCES media_objects(id) ON DELETE CASCADE,
  target       text NOT NULL, -- webdav | nas | quark
  status       text NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

### 6.2 偏移量口径（重要）

- 现有偏移是 **UTF-16 code unit**（JS `String.slice`）。
- PostgreSQL `substr` 按字符计，遇到代理对（emoji/生僻字）会错位。
- 设计约定：**偏移只在 JS 侧切片**；查询返回 `novel_sources.cleaned_text` 后用 `slice(start,end)`。
- 若未来要在 SQL 侧切，必须统一改成 Unicode code point 并做迁移。

### 6.3 稳定 ID 与重排语义

- 现状：每次重排 `generateId()` 生成新集 ID，旧资产/交接包/剧本全部变孤儿。
- 设计：增加 `logical_key`（如 `s{seasonNo}:e{episodeNo}`），唯一索引 `(novel_id, logical_key)`。
- 重排时按 `logical_key` **upsert**：
  - 集数与顺序不变的集保留 `id` 与已生成资产；
  - 被删除的集软删除并归档媒体；
  - 新增集插入。
- 迁移时用现有 `seasonNo/episodeNo` 回填 `logical_key`。

## 7. 写路径设计

### 7.1 Repository 契约（小说域）

```js
// NovelRepository（已有，补 listAll/事务内更新 counts）
findById(id, { orgId, tx })
list({ orgId, limit, offset })
create(novel, { orgId, tx })
update(id, patch, { orgId, expectedVersion, tx })
softDelete(id, { orgId, tx })

// NovelSourceRepository
get(novelId, { tx })
upsert(novelId, { cleanedText, cleanedHash, sourceType, sourceRef, encoding }, { tx })

// NovelChunkRepository
list(novelId, { tx })
replaceAll(novelId, chunks, { tx })   // 删除旧 + 批量插入

// SeasonRepository / EpisodeRepository
list(novelId, { tx })
replaceForNovel(novelId, seasons, { tx })  // 事务内删旧 + upsert 新（按 logical_key）
updateEpisode(id, patch, { expectedVersion, tx })

// Character/State/World/Asset/SetRepository
// 统一 list / replaceAll / upsert / softDelete
```

### 7.2 事务与锁

```js
await withNovelTransaction(novelId, async (tx) => {
  await tx.advisoryLockNovel(novelId)        // pg_advisory_xact_lock(hashtext('novel:'||id))
  await tx.planRuns.markSuperseded(novelId)
  await tx.sources.upsert(...)
  await tx.chunks.replaceAll(novelId, chunks)
  await tx.seasons.replaceForNovel(novelId, seasons)
  await tx.episodes.replaceForNovel(novelId, episodes)
  await tx.novels.updateCounts(novelId, counts)
  await tx.planRuns.finish(runId, stats)
})
```

- **一个事务覆盖「清旧 + 写新 + 更新 counts」**，失败整体回滚，不出现半套季/集。
- 批量插入用多值 `INSERT ... ON CONFLICT` 或 `COPY`；8–9k 行在单事务内可接受。
- 单条编辑（剧本、大纲、状态）用 `version` 乐观锁，不抢占小说级 advisory lock。
- 多实例安全：advisory lock 是数据库级，天然跨进程。

### 7.3 幂等与缓存

- `cleaned_hash` 决定规划缓存是否有效；hash 不变时复用 `novel_plan_runs` 产物。
- LLM 章摘要/弧线存 `novel_plan_artifacts`，按 `cleaned_hash + provider + model` 命中；不再依赖本地 `plan/*.json`。
- 重跑同一规划：同事务 upsert，结果一致。
- 删除小说：`ON DELETE CASCADE` + 媒体归档任务；不再需要 outbox 逐表删除。

### 7.4 outbox 的去留

- **小说域 Phase 3a**：`seasons / episodes / novel_sources` 已直接写 PG，不再产生对应的 JSON/outbox 写。
- **小说域 Phase 3b**：`novels` 主表、`chunks / characters / entities / assets / states / sets` 已改为 PG 优先；
  JSON 仅作本地读缓存（同步读路径过渡用），不再产生小说域 outbox 事件。
  缓存下线与 `NOVEL_REPO_MODE` 已移除；`NOVEL_WRITE_MODE` 仅保留测试/回滚。
- **其它域**：在各自迁移前保留 outbox；全站切写后停 worker、保留表一个发布周期，再删除。
- 好处：消除「JSON 写成功、事件未落库」的崩溃窗口与 ID 漂移。

## 8. 读路径与 API 兼容

- 读统一走 Repository；`NOVEL_REPO_MODE=legacy|shadow` 已移除。
- API 响应形状不变：
  - `GET /episodes` 仍返回 `id/title/targetSeconds/estimatedSeconds/chapterStart/chapterEnd/outline/screenplay/status/...`
  - `GET /chunks` 默认不返回全文；`?full=1` 时从 `novel_sources` 切片。
- 列表过滤/分页下推 SQL：
  - episodes：`WHERE novel_id=? AND season_id=? ORDER BY episode_no`
  - assets：`WHERE novel_id=? AND category=?`
  - characters/entities：按 `sort_order`、`mentions`
- 可选：小说详情/季列表短 TTL 读缓存；写事务提交后失效。

## 9. 文本与媒体存储

### 9.1 职责划分

| 数据 | 存放 | 说明 |
|---|---|---|
| 结构化数据（小说/季/集/角色/用户/团队…） | **PostgreSQL** | 事务、约束、查询、审计 |
| `cleaned.txt`（3–4M 字 / ~9MB/本） | **PG `novel_sources.cleaned_text`（推荐）** | 分章/分集按偏移读取，必须与元数据一致；也可放 NAS + 本地缓存 + hash 校验 |
| `raw.txt` | 首次下载归档（磁盘/NAS）或 PG 压缩 `bytea` | 仅溯源，不参与规划 |
| 图片/视频/音频 | **本地 → 网盘/NAS**，PG 只存 `media_objects` 元数据 | 媒体字节不入库 |
| 规划产物 | PG JSONB | 去掉本地 `plan/*.json`，多实例共享 |
| `db.json` | 小说集合已移出；自动归档到 `storage/archive/novels-from-db-*.json` | 回滚与审计 |

### 9.2 媒体存储：网盘/NAS 可插拔

现状：媒体在 `storage/images|videos|audio`，`novelSyncService` 已支持 `local / webdav / quark`，同步台账在 `sync/ledger.json`。

目标：把媒体后端抽象为 `MediaStorageProvider`，NAS 后续直接接入，不改业务代码：

```js
interface MediaStorageProvider {
  name()                         // local | webdav | nas | quark | s3
  put(key, buffer|stream, meta)  // 写入
  getStream(key, range?)         // 读取（支持 Range）
  exists(key)                    // 存在性
  remove(key)                    // 删除
  url(key, { expires })          // 直链/签名地址（可选）
  move(fromKey, toKey)           // 归档/迁移
}
```

适配器：

| 后端 | 场景 | 说明 |
|---|---|---|
| `local` | 当前开发/单机 | `storage/` 目录 |
| `webdav` | **NAS（推荐）** | 群晖/威联通等开启 WebDAV；`MEDIA_BACKEND=webdav` + URL/账号 |
| `nas` | 未来独立 NAS 服务 | 可实现为 WebDAV/S3 适配器；NFS/SMB 建议挂载成本地目录后走 `local` |
| `quark` | 现有夸克网盘 | 已有 `novelSyncService` 逻辑，可迁到 provider |
| `s3` | MinIO/对象存储 | 可选，复用同一接口 |

设计要点：

1. **PG 只存元数据**：`backend + storage_key + url + sha256 + size`；媒体字节永远在外部存储。
2. **写入顺序**：本地先落盘（快速返回）→ 异步上传网盘/NAS → 更新 `sync_status`；`media_sync_jobs` 记录任务，替代 `sync/ledger.json`。
3. **读取顺序**：本地命中 → 远端代理/重定向；`mediaAccess` 中间件按 `backend` 解析。
4. **去重与完整性**：`sha256` 内容寻址；同 hash 不重复上传。
5. **NAS 迁移**：新增 `webdav` 适配器即可；`backend` 字段允许逐条迁移，不需要改表结构。
6. **安全**：网盘/NAS 凭据只放环境变量/密钥管理，不入库、不入日志；对外只暴露受控 URL。
7. **源文本**：`cleaned.txt` 是“文本”不是“媒体”，优先 PG；若放 NAS，需本地缓存 + `cleaned_hash` 校验，避免读偏移时跨网络抖动。

> 媒体体积大，**不要**把图片/视频/音频作为 `bytea` 存 PG；否则 WAL、备份、连接池都会被拖垮。

## 10. 迁移与切换策略

### Phase 0：稳定现状（已完成/进行中）

- 重建脚本禁止在服务运行时执行（端口检测）。
- 增加 `verify-data-consistency`：JSON 与 PG 行数、ID 集合、关键字段哈希比对（切写前使用）。
- 修复本次 ID 不一致（已完成：33 季 / 8496 集，ID 集合一致）。

### Phase 1：Schema + Repository + 契约测试（不改运行时）

- 新增迁移 `010_novel_source_and_plan.sql`、`011_episode_model.sql`。
- 新增/补齐小说域 Repository，JSON 与 PG 双适配器。
- 契约测试：同一组断言跑 JSON/PG 两套；覆盖 create/update/softDelete/replaceAll/事务回滚。
- 验收：`npm test` 全绿；新旧读接口结果 deepEqual。

### Phase 2：数据回填 + 双跑对账

- 一次性迁移：`novels/novel_sources/chunks/seasons/episodes/characters/states/world/assets/sets/plan`。
- 回填 `logical_key`、`start_offset/end_offset`、`outline/screenplay`、`estimated_seconds`。
- 双跑：写仍 JSON，但同事务写 PG；用 `verify-data-consistency` 对账。
- 验收：行数一致、ID 集合一致、抽样内容哈希一致、0 告警。

### Phase 3：小说域写切换（关键门）

- **Phase 3a（已完成）**：`NOVEL_WRITE_MODE=postgres`；季/集/正文与单集链路只写 PG；JSON 季/集停止写入。
- **Phase 3b（已完成）**：`novels` 主表 + 子集合（chunks/characters/entities/assets/states/sets）PG 优先；
  JSON 仅作本地读缓存；小说域不再产生 outbox 事件。
- **Phase 3c-1（已完成）**：启动时从 PG 水合内存投影；小说集合不再写回 `db.json`；
  旧 JSON 自动归档到 `storage/archive/novels-from-db-*.json`；恢复/回填脚本自动读取最新归档。
- **Phase 3c-2（进行中）**：已移除 `NOVEL_REPO_MODE=legacy|shadow`；生产 `NOVEL_WRITE_MODE=postgres` 时读服务强制 PG，
  `legacy` 读适配器仅在 `NOVEL_WRITE_MODE=legacy`（测试/回滚）下启用。
  核心生成链路（分季/大纲/剧本/角色状态/资产/配音图/交接/分镜/季设定图/风格/voice）、
  路由层、抽取/合并抽取、合成与 selected-set 过滤已改用异步 PG 读；
  内存投影仍供资产图库单条/统计、角色卡、timeline、novelSync 与 legacy 适配器使用，下一步继续异步化并删除投影；
  `db.json`（非小说域）在各自迁移完成后归档只读。
- 验收：
  - 重建/规划在事务内完成，失败无半套数据；
  - 并发两个规划请求，advisory lock 串行化；
  - 单集剧本/分镜/资产/合成/交接全链路通过；
  - 前端无需改动；
  - 回滚：切回 `dual` + 旧 JSON 只读副本（一个发布周期）。

### Phase 4：其它域按序迁移

- 顺序：auth/user/subscription → project/character/scene/shot → community/team/enterprise → usage/audit/billing。
- 每域重复 Phase 1–3 的门禁。
- 全部完成后 `DB_DRIVER=postgres`，移除 JSON 分支。

### Phase 5：下线过渡设施

- 停 outbox worker，删 `outbox_events` 与相关代码。
- 删除 `NOVEL_WRITE_MODE`/`DB_DRIVER=json`。
- `db.json` 归档到 `storage/archive/db-<date>.json`，不再读写。
- 更新 runbook/ADR。

## 11. 测试策略

| 类型 | 内容 |
|---|---|
| 契约测试 | JSON/PG 适配器同断言；CRUD/软删/乐观锁/事务回滚 |
| 集成测试 | 独立 `_test` 库；规划→剧本→资产→合成→同步 |
| 并发测试 | 两个 `planSeries` 并发；advisory lock；无死锁/无重复 |
| 故障注入 | 事务中途抛错 → 无半套季/集；连接断开重试 |
| 数据对账 | 行数、ID 集合、内容 hash、抽样 deepEqual |
| 迁移测试 | 空库全量迁移；从 009 升级；checksum 保护 |
| E2E | 导入 → 分季分集 → 单集 → 分镜 → 成片 → 导出/同步 |
| 性能 | 8.5k 集事务耗时、列表/详情 P95、连接池饱和 |

## 12. 运维设计

- **备份**：每日 `pg_dump` + WAL/PITR；季度恢复演练；媒体单独备份。
- **迁移**：沿用 SQL runner（advisory lock、checksum、事务）。
- **连接池**：`DB_POOL_MAX` 按实例数 × 并发调优；设置 `statement_timeout`。
- **监控**：慢查询（pg_stat_statements）、事务回滚率、规划耗时、行数漂移、outbox 积压（迁移期）。
- **发布**：先迁移后切开关；切换窗口内禁止重建/规划；切换后观察 24h。
- **回滚**：Phase 3 前改开关即可；Phase 3 后用 PITR/备份恢复，JSON 只读副本仅作对账。

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 40+ service 同步转异步，改动面大 | 按域迁移；先小说域；Repository 契约测试兜底 |
| 长事务锁表 | 单事务批量插入；只锁该小说的 advisory lock；避免全表操作 |
| 8.5k 集写入慢 | 多值 INSERT/COPY；关闭不必要的索引后再建（迁移期） |
| 文本/备份膨胀 | cleaned_text 入 PG 但可压缩；媒体不入库 |
| 重排导致资产孤儿 | `logical_key` upsert + 软删除 + 媒体归档 |
| 多实例并发写 | 数据库 advisory lock + 乐观锁 |
| 迁移期数据漂移 | 双跑 + 对账脚本 + 切换前冻结写入 |
| 测试/CI 依赖 | 已有独立 `_test` 库；JSON 适配器保留到 Phase 5 |

## 14. 小说域文件级改动清单（Phase 1–3）

**迁移**
- `src/db/migrations/010_novel_source_and_plan.sql`
- `src/db/migrations/011_episode_model_and_logical_key.sql`

**仓储/事务**
- `src/repositories/novelRepository.js`（补 `tx` 支持）
- `src/repositories/novelSourceRepository.js`（新）
- `src/repositories/novelChunkRepository.js`（新，替换 `replaceAll`）
- `src/repositories/seasonRepository.js`、`episodeRepository.js`（新）
- `src/repositories/novelPlanRepository.js`（新）
- `src/repositories/unitOfWork.js`（新，`withNovelTransaction` + advisory lock）
- `src/repositories/novelChildRepository.js`（补写方法或拆分）

**服务**
- `novelProjectService`、`novelChunkService`、`seriesPlannerService`、`seasonPlanService`
- `characterExtractionService`、`worldbuildingService`、`characterGrowthService`
- `episodeOutlineService`、`episodeScriptService`、`episodeAssetService`
- `seasonAssetService`、`bulkEpisodeService`、`episodeComposeService`、`shotHandoffService`
- `storageService`：小说方法标记 deprecated，切写后删除

**脚本/校验**
- `scripts/migrate-novels-to-pg.js`（扩展 sources/plans/logical_key）
- `scripts/rebuild-series.js`（事务 + 只写 PG + 停服务保护）
- `scripts/verify-series.js`（读 PG）
- `scripts/verify-data-consistency.js`（JSON/PG 对账，切写前）

**删除（Phase 3 后）**
- 小说域的 `novelWriteSync`/`novelChildWriteSync` 分支
- `NOVEL_WRITE_MODE` 开关与内存投影（读已固定 PG）
- `plan/*.json` 本地缓存

**前端**
- 无改动（API 形状不变）。已有的 `outline/estimatedSeconds/chapterStart/chapterEnd` 继续使用。

## 15. 验收标准（小说域）

1. 规划/重建在一个事务内完成；注入异常后无残留季/集。
2. 同一小说并发规划被 advisory lock 串行化，结果一致。
3. 集 ID 在重排前后对 `logical_key` 稳定；资产/交接包不再孤儿。
4. `GET /episodes|seasons|chunks|assets`、`POST /script|assets|compose|handoff` 全链路通过。
5. JSON 与 PG 对账：行数、ID 集合、内容 hash 全部一致（切写前）。
6. `npm test`（含 PG 契约）、`npm run test:web`、`npm run typecheck`、`npm run lint`、E2E 全绿。
7. 切换后 24h 无 `episode not found`、无 5xx、无 outbox 积压。
8. 回滚演练：Phase 3 前切回 `dual` 可用；Phase 3 后 PITR 恢复演练通过。

## 17. 实施进度（2026-10-21）

| 阶段 | 状态 | 产出 |
|---|---|---|
| Phase 0 稳定 | ✅ | 重建停服务保护、JSON/PG ID 一致性修复 |
| Phase 1 Schema + 仓储 | ✅ | 迁移 `010/011/012`；`novelSource/Chunk/Season/Episode/Plan` 仓储；`withNovelTransaction`；826 测试通过 |
| Phase 2 数据回填 | ✅ | `novel_sources` 3,490,654 字；chunks 1206（偏移齐全）；seasons 33（弧线/目标/钩子）；episodes 8496（`logical_key` 齐全）；plan artifacts 入库；JSON/PG 集 ID 集合完全一致 |
| Phase 3a 写切换（季/集/正文） | ✅ | `NOVEL_WRITE_MODE=postgres`：seasons/episodes/novel_sources 写 PG；分集/剧本/大纲/资产/合成/交接/分镜/批量服务改用异步存储门面；事务 + advisory lock |
| Phase 3b 写切换（项目/子集合） | ✅ | `novels` 主表与 chunks/characters/entities/assets/states/sets 改 PG 优先；JSON 仅本地读缓存；小说域 outbox 停止产生；创建/更新/删除项目直达 PG |
| Phase 3c-1 PG 水合 + JSON 停写 | ✅ | 启动从 PG 水合小说内存投影；db.json 不再写小说集合；旧 JSON 自动归档；恢复/回填脚本读归档 |
| Phase 3c-2 去内存投影 | 🚧 进行中 | 已删除 `NOVEL_REPO_MODE=legacy|shadow`；核心生成、路由、抽取、合成、selected-set 已异步 PG 读；下一步资产单条/统计、角色卡、timeline、novelSync 异步化并删除投影；非小说域迁移完成后归档 db.json |
| Phase 4 其它域 | ⏳ | 身份/创作/社区/团队/计费按域迁移 |
| Phase 5 下线过渡设施 | ⏳ | 停 outbox、删 `db.json`/legacy 开关 |

Phase 1/2 期间**运行时行为不变**；Phase 3a/3b 已切换小说域写 PG：

```bash
npm run db:migrate
npm run db:backfill:novel-write -- --novel <novelId> [--dry-run]
# 灾难恢复（从 JSON 重建 PG）
npm run db:restore:novel -- --novel <novelId>
```

Phase 3b 当前状态：

- `NOVEL_WRITE_MODE=postgres`（读固定 PG）
- 小说主表、季/集/正文、角色/世界观/资产/状态/集合/chunks 均以 PG 为事实源；
- 写路径先 PG、成功后更新本地 JSON 读缓存；JSON 不再是事实源；
- 小说域不再写入 `outbox_events`；已有 29 条历史事件为 done；
- Phase 3c-1：启动时从 PG 水合内存投影；`db.json` 只保留非小说数据；
  旧小说 JSON 归档在 `storage/archive/novels-from-db-*.json`；
- 真实项目《殖装》：33 季 / 8496 集 / 1206 章，JSON 与 PG 集 ID 集合一致；
- 验收：826 后端测试、138 前端测试、临时项目 API 写入/删除、真实项目读接口全通过；
- 恢复手册：`docs/runbooks/novel-pg-restore.md`（正式备份以 `pg_dump`/PITR 为准，归档 JSON 仅应急）。

## 16. 已确认决策（2026-10-21）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 范围 | **小说域先行**，稳定后再按域推广全站 |
| 2 | `cleaned.txt` | **入 PG** `novel_sources.cleaned_text`；偏移只在 JS 侧切片 |
| 3 | `db.json` | 切写后**只读归档一个发布周期**，再删除 |
| 4 | 稳定 ID | **`logical_key` upsert**，重排保留既有 `id` |
| 5 | 多租户 | 本期只做 `org_id` 应用层隔离；RLS 放后续 |
| 6 | 媒体 | 统一 `media_objects`；NAS 走 **WebDAV** 适配器，后续可扩 `nas/s3` |

实施顺序：**Phase 1（本次）→ Phase 2 → Phase 3**，之后按域推广。

### Phase 1 本次范围（运行时行为不变）

- 迁移：`novel_sources`、`novel_plan_runs/artifacts`、`media_objects/media_sync_jobs`、
  chunks/season/episode 新列、`logical_key` 回填与部分唯一索引。
- 仓储：`novelSourceRepository`、`novelChunkRepository`、`seasonRepository`、
  `episodeRepository`、`novelPlanRepository`。
- 事务：`withNovelTransaction`（`pg_advisory_xact_lock` + 事务内多仓储）。
- 测试：PG 集成测试（upsert 保留 ID、soft-delete missing、事务回滚、advisory lock）。
- 不改 `seriesPlannerService` 等运行时写路径；Phase 2 做数据回填与双跑，Phase 3 切写。
