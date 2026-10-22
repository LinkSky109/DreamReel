# 2026-10-21 验证与 E2E 收口总结

> 历史记录：本文反映 2026-10-21 当时状态，其中的小说读写模式描述已过时。
> 2026-10-22 起小说域固定 PostgreSQL 单源，见 `docs/architecture/postgres-single-source-design.md`。

> 范围：前端优化、前后端分离、数据库引入的复核；测试隔离与数据清理；健康探针与部署配置修正；核心链路 E2E 与 CI 接入。
>
> 结论口径：只记录实际执行过的命令与结果；“待执行”项单独列出，不与已验证项混写。

## 1. 结论

| 方向 | 状态 | 说明 |
|---|---|---|
| 前端优化 | 已验证 | 路由级懒加载、构建通过、主包 gzip 133.6KB、137 个前端测试通过 |
| 前后端分离 | 已验证 | `SERVE_STATIC=false` API-only、Nginx 独立托管、反代与 SPA fallback 实测通过 |
| 数据库引入 | 已验证（小说域） | 迁移 001–009 全部应用；小说主表与 9 类子集合双向校验 0 差异；其他域仍走 JSON |
| 测试隔离 | 已验证 | 测试使用独立 `<db>_test` 库，运行前后重建/删除，不写开发库 |
| 核心 E2E | 已验证 | Playwright 自包含启动 API + Vite，登录→项目→编辑器保存重开→小说详情通过 |
| 并发写 / PITR | 未执行 | 已形成演练清单，见 `docs/runbooks/postgres-resilience-drills.md` |

## 2. 验证证据

| 检查 | 命令 / 方式 | 结果 |
|---|---|---|
| 全链路质量门 | `npm run check` | EXIT 0；后端 816 tests / 0 fail；前端 38 files / 137 tests |
| 测试隔离 | `npm test` | `[test-db]` 重建并删除 `dreamreel_test`；`[test-isolation] OK` |
| 小说主表校验 | `npm run db:verify:novels` | `postgres=1 source=1 mismatches=0`（双向） |
| 小说子集合校验 | `npm run db:verify:novel-children` | chunks/characters/entities/seasons/episodes/states/sets/assets 全部 0 差异 |
| outbox 队列 | `npm run outbox:stats` | `{ done: 22 }`，dead 0 |
| API-only | `SERVE_STATIC=false` 临时实例 | `/health` 200、`/api/v1/meta` 200、`/` 返回 JSON 404 |
| 分离部署 | `deploy/docker-compose.dev.yml`（override 3102/8180） | storage-init 成功；api healthy；`/health/ready` 200；node 写探针 OK；web 200；`/api/novels` 200 |
| 静态缓存 | Nginx 实测 | 公开素材 `public, max-age=604800`；受保护媒体 `private, no-store`；assets `immutable` |
| 健康探针 | 正常 PG / 错误 PG | 正常 200 `db: postgres`；错误 503 `connect ECONNREFUSED` |
| 核心 E2E | `npm run test:e2e` | 1 passed（约 6.8s），自动启动 API:3301 + Vite:5273 |

## 3. 主要修复

### 3.1 测试与数据

- `scripts/run-tests.js`：派生独立测试库 `<库名>_test`，运行前重建并执行迁移，结束后删除；禁止对非 `_test` 库执行 drop。
- PG 契约测试由“跳过”变为真实执行，测试数 798 → 816。
- `scripts/migrate-novels-to-pg.js --verify`：增加 PostgreSQL → JSON 反向比对。
- 新增 `scripts/db-cleanup-test-data.js`（默认 dry-run）：清除 2 部测试小说与 24 条 dead outbox；真实小说《殖装》保留。
- `outbox:stats` 保持兼容；新增 `outbox:stats:group` 与 `outbox:retry-dead --org`。

### 3.2 健康检查与部署

- `isPostgresEnabled()` 覆盖 `NOVEL_REPO_MODE=postgres` 与非 legacy 写入模式；`/health/ready` 不再“探针绿、业务红”。
- `deploy/docker-compose.dev.yml`：注入仓库根 `.env` 的 `JWT_SECRET`；小说域默认 legacy，避免容器内误用 localhost 数据库。
- 存储改为 named volume + `storage-init`：首次从宿主 `storage/` 只读复制并修正权限，规避 Docker Desktop `virtiofs ro` 导致的 503。
- `deploy/nginx.conf`：公开素材与受保护媒体分目录缓存；隐藏上游默认 `Cache-Control`，避免 `max-age=0` 与 7 天缓存并存。
- `web/vite.config.ts`：代理目标跟随根 `.env` 的 `PORT`；支持 `VITE_PORT` / `VITE_HOST`。
- README 更新：`.env`、Docker Desktop 存储卷、分离部署端口与 E2E 运行方式。

## 4. E2E 能力

- 测试：`e2e/core-flow.spec.ts`
- 配置：`playwright.config.ts`
- 独立 API：`scripts/e2e-server.js`
- 运行：`npm run test:e2e`
- 完整门禁：`npm run check:full`（`check` + E2E）
- CI：`.github/workflows/ci.yml`（PostgreSQL service + Chromium + check + E2E + build）

自包含行为：

1. 自动启动 API `127.0.0.1:3301` 与 Vite `127.0.0.1:5273`
2. 每次重建 `test-results/e2e-storage`，不写开发库
3. 测试自行注册账号、创建项目、创建并摄取小说
4. 覆盖登录 → 新建项目 → 编辑器添加场次/保存 → 刷新重开 → 小说详情 → 项目库回显

## 5. 未执行 / 边界

- **多实例并发写**：仅有演练清单，尚未执行；写主库切换后必须重跑。
- **备份 / PITR**：仅有演练清单；WAL 归档、自动备份、恢复演练尚未落地。
- **监控告警**：outbox dead、连接池、复制延迟尚未接入告警。
- **生产压测 / 慢查询**：未执行。
- CI workflow 已提交，本次不把远端执行结果纳入阻塞项。

## 6. 提交记录

```text
8e48c44  merge: 测试隔离、健康探针与分离部署收口
5322633  merge: 自包含 E2E 与 CI 自动验证
```

相关文档：

- `docs/runbooks/novels-postgres-cutover.md`
- `docs/runbooks/postgres-resilience-drills.md`
- `README.md`（分离部署、E2E）

## 7. 后续建议

1. 在独立演练库执行并发写与 PITR 清单，记录 RPO/RTO 与实际结果。
2. 写主库切换前，重跑并发写与备份恢复。
3. 接入 outbox dead、连接池、复制延迟告警。
4. 扩展 E2E：登录失败、权限拒绝、小说导入异常、移动端关键路径。
5. 逐步补齐 `docs/api/v1.md` 的端点覆盖（当前 337 个端点、文档 39 个）。
