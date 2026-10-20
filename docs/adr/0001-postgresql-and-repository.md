# ADR-0001: 用 PostgreSQL + Kysely 替代 JSON 文件存储

- 状态：已接受（2026-10-20）
- 决策者：研发负责人
- 相关：ADR-0003 多租户与 RBAC

## 背景

当前所有业务数据由 `src/services/storageService.js` 维护为进程内对象，经 debounce 后**全量重写** `storage/data/db.json`（约 18 MB，1206 个 novelChunks、8378 个 seriesEpisodes、1621 个 novelAssetImages）。

这带来四个硬限制：

1. **无法横向扩容**：多实例会互相覆盖写。
2. **写放大**：任何一次小修改都会重写整个文件；写入期间进程崩溃可能丢最近一次 debounce 的数据。
3. **查询能力缺失**：列表过滤、分页、聚合、审计都在内存里做全表扫描。
4. **企业能力无法落地**：事务、行级安全（RLS）、外键、唯一约束、软删除、乐观锁都只能靠应用代码自觉。

40+ 个 service 通过同步调用访问 `storageService`，这是迁移的最大成本。

## 决策

1. 主库使用 **PostgreSQL 16**。
2. 数据访问使用 **`pg` + Kysely**，迁移使用按编号的 SQL 文件 + 自带 runner（advisory lock、校验和），不引入重量级 ORM。
3. 保留现有字符串业务主键 `id`，避免 API 破坏性变更；新表可用 UUIDv7。
4. 引入 Repository 层：`src/repositories/*` 定义接口，先提供 `json` 适配器（委托现有 storageService），再提供 `postgres` 适配器，用同一套契约测试验证行为一致。
5. 启动时校验 schema 版本，生产迁移由独立 Job 执行并加 advisory lock。
6. 通过 `DB_DRIVER=json|postgres|dual` 控制切换，默认 `json` 直到 Phase 6。

## 备选方案

| 方案 | 结论 | 原因 |
|---|---|---|
| Prisma | 未采用 | 迁移体验好，但 RLS、部分索引、JSONB 复杂查询和批量 upsert 灵活性弱于 SQL-first |
| Drizzle | 未采用 | 类型体验好，但项目后端是 JavaScript（非 TS），收益降低 |
| 继续 JSON + 分片 | 未采用 | 无法解决事务、并发写、跨实例与审计要求 |
| MongoDB | 未采用 | 关系与权限模型强，事务/约束/RLS 不如 PostgreSQL |

## 迁移策略

- **先抽象后替换**：Repository 契约 + JSON 适配器先行，业务代码逐步改为依赖接口。
- **按领域迁移**：auth/user → project/character/scene → novel/series → community/team/enterprise。
- **同步转异步**：移除 service 构造函数中的 `_loadFromStorage()`；启动时统一初始化；禁止模块顶层查询。
- **切换门槛**：迁移报告零关键差异、双写影子读一致、核心 E2E 全绿。
- **回滚**：保留 `db.json` 只读归档与 `DB_DRIVER=json` 开关至少一个发布周期。

## 后果

正面：

- 获得事务、约束、索引、RLS、PITR 备份与在线扩展能力。
- 列表/详情查询可下推到数据库，消除内存全表扫描。
- 审计、用量、计费可以落到同一事务边界内。

负面：

- 40+ service 的同步调用需要改为异步，Phase 4 是最大工作量与最高风险。
- 项目聚合模型（project 内嵌 characters/scenes/shots）需要 Repository 负责组装，存在 N+1 风险。
- 团队需要熟悉 SQL 迁移与 Kysely 查询构建。

## 验收

- 空库执行全部迁移成功，且可回滚。
- Repository 契约测试在 JSON 与 PostgreSQL 两种适配器下通过。
- 关键计数与抽样深比较一致。
- `DB_DRIVER=postgres` 下核心 E2E 全绿。
