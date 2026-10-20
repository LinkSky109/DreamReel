---
name: dreamreel-layer-collaboration
description: DreamReel 分层分支协作流程。用于在 main 与 feat/frontend、feat/backend、feat/db、feat/llm 之间选择分支、拆分 PR、处理跨层契约、执行分层验收、合并与回滚。当用户要开分支、提 PR、合并、处理前后端/DB/LLM 交叉改动，或询问团队协作规范时使用。
---

# DreamReel 分层协作

## 分支拓扑

```
main                        可发布，始终通过验收
├── feat/frontend           React / Vite / 页面 / PWA / i18n / a11y
├── feat/backend            Express 路由 / service / middleware / auth
├── feat/db                 PostgreSQL / migration / repository / outbox
└── feat/llm                prompt / 抽取 / provider / eval / 成本
```

日常工作分支从所属层拉出：

```bash
git checkout feat/backend
git pull --ff-only
git checkout -b feat/backend-shot-retry
```

命名：`feat|fix|chore/<layer>-<slug>`；hotfix 从 `main` 拉 `fix/<slug>`，修完回合并到各层。

## 选择目标分支

| 改动 | 目标分支 |
|---|---|
| 只改单层 | 对应 `feat/<layer>` |
| 跨两层且契约不变 | 分别提 PR，先合被依赖层 |
| 跨层且改变接口/数据形状 | **先改契约**，同一 PR 或两个关联 PR 同时合 `main` |
| 数据迁移/回填 | `feat/db`，必须带回滚与校验 |
| prompt/模型/解析规则 | `feat/llm`，必须带样例与成本对比 |
| 发布、热修 | `main` |

## 跨层契约（强制）

先改契约，再改实现：

1. `src/contracts/*`（zod）或 `docs/api/v1.md` 先落字段、错误码、分页；
2. 前端类型与调用同步；
3. 后端保持旧字段兼容至少一个发布周期；
4. PR 描述写明：新增/修改/废弃字段、默认值、迁移方式。

相关技能：`contract-first`、`module-regression`。

## 分层验收

| 层 | 必跑 |
|---|---|
| frontend | `npm run typecheck`、`npm run test:web`、`npm run build:web` |
| backend | `npm run lint`、`DATABASE_URL=... npm test` |
| db | `npm run db:migrate`、`npm run db:verify:novels`、`npm run db:verify:novel-children`、`npm test` |
| llm | 固定样例回归、token/延迟/成本对比、失败回退链验证 |
| 全量 | `npm run check`（含 docs 端点检查） |

验收证据写进 PR：命令、结果、关键日志或截图。没有证据不算完成。

## 数据库改动规则

- 新增编号迁移，**不改已应用迁移**（checksum 会拒绝）；
- 大表变更走 expand → backfill → contract；
- 每个迁移写清回滚方式；
- 写路径默认 `NOVEL_WRITE_MODE=legacy`，新逻辑用开关灰度；
- 涉及 outbox/队列时验证：事件 `done`、失败重试、dead letter。

## 安全与鉴权

- 新接口默认私有；公开接口必须显式加入 `src/middleware/authGate.js` 白名单；
- 敏感写接口加 `requirePermission(...)`；
- 不提交密钥；`.env` 只做本地；
- `REQUIRE_AUTH`、`OUTBOX_ENABLED` 等开关默认取安全值。

## PR 与合并

1. PR 标题用 Conventional Commits；
2. 描述包含：背景、改动、契约影响、验证证据、回滚；
3. 单层 PR 至少 1 位 reviewer；db/auth 变更 2 位；
4. 合入层分支用 squash；层 → `main` 用 merge commit，保留批次边界；
5. 合入前 rebase 层分支到最新 `main`，解决冲突后再跑分层验收；
6. 合并后删除短期分支。

## 发布与回滚

- 发布前：`npm run check`、迁移状态、outbox 积压、健康检查；
- 回滚优先改开关：`NOVEL_REPO_MODE=legacy`、`NOVEL_WRITE_MODE=legacy`、`OUTBOX_ENABLED=false`、`REQUIRE_AUTH=false`；
- 数据回滚使用备份/PITR，不手改 `db.json`；
- 详细步骤见 `docs/runbooks/novels-postgres-cutover.md`。

## 相关技能

- `git-workflow`：分支/提交/冲突处理机制
- `contract-first`：契约驱动的前后端协作
- `module-regression`：跨模块回归清单
- `conventional-commit-review`：提交信息规范
- `team-agent-orchestration`：多 agent 并行时的分支隔离与合并门

## 快速检查

```bash
git branch --show-current          # 是否在正确层
git log --oneline main..HEAD       # 本 PR 提交
npm run check                      # 全量门禁
npm run db:status                  # 迁移状态
npm run outbox:stats               # 积压
```
