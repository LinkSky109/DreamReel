# DreamReel Agent Guide

开始改动前，先读：

- `.opencode/skills/dreamreel-layer-collaboration/SKILL.md`：分层分支、验收、合并、回滚
- `docs/collaboration/layer-workflow.md`：完整协作规范
- `docs/adr/`：架构决策
- `docs/runbooks/`：运行、备份恢复与演练
- `docs/plans/2026-10-22-novel-legacy-removal.md`：小说域 legacy 路径移除阶段与门禁

## 硬性规则

1. 不在 `main` 上直接开发；按层使用 `feat/frontend|backend|db|llm`。
2. 跨层改动先改契约（`src/contracts/*`、`docs/api/v1.md`）。
3. 迁移只增不改；已应用迁移由 checksum 保护。
4. 新接口默认鉴权；公开接口显式加入 `src/middleware/authGate.js` 白名单。
5. 交付必须带验证证据；`npm run check` 通过才算完成。
6. 小说域只走 PostgreSQL：不存在读/写模式开关；`db.json` 仅保留非小说集合。回滚优先改 `REQUIRE_AUTH` 等非小说开关；小说数据回滚只用 `pg_dump`/PITR。
7. 不提交 `.env`、密钥、构建缓存。

## 常用命令

```bash
npm run check
npm run check:legacy
npm run db:status
npm run db:verify:novels
npm run db:verify:novel-children
npm run series:verify -- <novelId>
```

> `npm run check:legacy` 已接入 `npm run check`；当前必须保持 0 违规。
