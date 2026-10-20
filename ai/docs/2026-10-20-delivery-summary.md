# 交付总结（2026-10-20）

## 本次合并

- 前端会话 `dev/agent-handoff-continue` 已合并到 `main`（commit `7ca1fbe`）。
- 前端收口内容：团队/企业/API 控制台/广场/创作者页面、PWA、i18n、无障碍、共享项目页。
- 后端同期完成：前后端分离、API v1 契约、PostgreSQL 迁移、novels 域读写切换、outbox、RBAC/审计。

## 后端已完成

| 阶段 | 内容 | 关键产物 |
|---|---|---|
| Phase 0 | ADR、路由/存储清单 | `docs/adr/`、`docs/architecture/` |
| Phase 1 | app/server 拆分、API-only、Docker/Nginx | `Dockerfile.api`、`Dockerfile.web`、`deploy/` |
| Phase 2 | `/api/v1`、统一响应、zod、限流、幂等 | `docs/api/v1.md` |
| Phase 3 | PostgreSQL 迁移、Repository 契约 | `src/db/migrations/`、`tests/novelRepository.test.js` |
| Phase 4 | novels 读写切 PG、影子读、outbox | `src/services/novel*ReadService.js`、`src/workers/outboxWorker.js` |
| Phase 5（部分） | RBAC 策略、强制登录闸门、审计哈希链 | `src/security/`、`src/middleware/authGate.js`、`src/services/auditLogService.js` |

## 数据与运行状态

- PostgreSQL 16：`deploy-postgres-1`，库 `dreamreel`。
- 迁移：`001`–`009` 全部应用。
- 已迁移：novels 主表、chunks 1206、characters 559、entities 725、seasons 41、episodes 8378、assets 1621、states 724、集合各 1。
- 开发环境：`NOVEL_REPO_MODE=postgres`、`NOVEL_WRITE_MODE=dual`、`OUTBOX_ENABLED=true`。
- `REQUIRE_AUTH` 默认关闭；RBAC/审计已就绪但未强制。

## 验证

- 后端测试 **816/816**（含真实 PostgreSQL 契约/outbox/审计）。
- 前端 `typecheck`、`vitest`、`vite build` 通过。
- 9 个 novels 读接口与 legacy deepEqual；timeline 58 组、状态 186 条、集合列表一致。
- outbox：create/delete 读回一致，事件全部 `done`，0 错误。
- 强制登录实测：`/api/novels` 401、`/api/gallery` 200。
- 文档端点检查：337 个后端端点，文档缺失 0。

## 回滚

- 读回退：`.env` 设 `NOVEL_REPO_MODE=legacy`。
- 写回退：`NOVEL_WRITE_MODE=legacy`、`OUTBOX_ENABLED=false`。
- 鉴权回退：`REQUIRE_AUTH=false`。
- 详见 `docs/runbooks/novels-postgres-cutover.md`。

## 未完成

- Phase 5 剩余：租户中间件强制执行、SSO/OIDC、角色分配 UI、审计查询 API。
- Phase 6：其余集合（projects/users/teams/community/billing）全量迁移。
- Phase 7：BullMQ、对象存储、pino/OpenTelemetry、备份 PITR。
- Phase 8：压测、越权测试、UAT、灰度与下线 JSON 写。
