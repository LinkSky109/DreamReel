# 分层协作规范

> Agent 可加载技能：`.opencode/skills/dreamreel-layer-collaboration/SKILL.md`
> 相近的通用技能：`git-workflow`、`contract-first`、`module-regression`、`conventional-commit-review`、`team-agent-orchestration`。

## 1. 分支模型

长期分支：

| 分支 | 责任 | 不允许 |
|---|---|---|
| `main` | 可发布、可回滚 | 直接提交业务改动 |
| `feat/frontend` | 页面、组件、样式、PWA、i18n、a11y | 改 SQL/迁移 |
| `feat/backend` | 路由、service、middleware、鉴权 | 直接改表结构 |
| `feat/db` | 迁移、Repository、outbox、索引 | 改 UI |
| `feat/llm` | prompt、抽取、provider、评测 | 改鉴权/计费 |

短期分支：`feat/<layer>-<slug>`、`fix/<slug>`、`chore/<slug>`。

```bash
git checkout feat/db && git pull --ff-only
git checkout -b feat/db-outbox-retry
```

## 2. 一次改动的路径

```
短期分支 → 对应层分支（squash）
        → main（merge commit，按批次）
```

- 单层改动：只进对应层，再由层分支定期合 `main`。
- 跨层改动：
  - 契约不变：拆成两个 PR，先合被依赖方；
  - 契约变化：先改 `src/contracts/*` 与 `docs/api/v1.md`，两边同批次合 `main`。
- 紧急修复：从 `main` 拉 `fix/*`，合 `main` 后回合并到受影响的层分支。

## 3. 什么时候必须升级到 main 评审

满足任一条件：

- 改 API 字段、错误码、分页、鉴权；
- 新增/修改数据库迁移；
- 改 outbox、队列、重试、幂等；
- 改 prompt 的输入/输出契约或模型；
- 改计费、配额、权限矩阵；
- 影响启动顺序、健康检查、回滚开关。

## 4. 各层验收清单

### frontend

```bash
npm run typecheck
npm run test:web
npm run build:web
```

- 新页面/路由要能在 `web/dist` 独立构建；
- 交互改动附截图或录屏；
- 无障碍：键盘可达、焦点可见、对比度达标。

### backend

```bash
npm run lint
DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel npm test
```

- 新接口默认私有；公开接口显式加入白名单；
- 写接口有 zod 校验与错误码；
- 涉及权限的接口声明 `requirePermission`。

### db

```bash
npm run db:migrate
npm run db:status
npm run db:verify:novels
npm run db:verify:novel-children
npm run outbox:stats
```

- 新迁移编号递增，已应用迁移禁止修改（checksum 校验）；
- 提供回滚步骤；
- 大表变更遵循 expand → backfill → contract；
- 写路径默认 `legacy`，用开关灰度。

### llm

- 固定样例集回归（抽取/改写/分镜）；
- 记录 token、延迟、成本变化；
- 失败回退链可用；
- prompt 变更说明输入/输出差异与兼容性。

## 5. PR 规范

标题：`<type>(<layer>): <summary>`，例如 `feat(db): outbox 重试退避`。

描述必须包含：

1. 背景与目标；
2. 改动范围（层、文件、接口）；
3. 契约影响（新增/修改/废弃字段）；
4. 验证证据（命令与结果）；
5. 回滚方式（开关/迁移/备份）。

合并：

- 层内：squash；
- 层 → main：merge commit；
- 合并后删除短期分支；
- `main` 必须保持 `npm run check` 通过。

## 6. 开关与回滚

| 开关 | 安全值 | 用途 |
|---|---|---|
| `NOVEL_WRITE_MODE` | `legacy` | 关闭 PG 镜像 |
| `OUTBOX_ENABLED` | `false` | 关闭事件投递 |
| `REQUIRE_AUTH` | `false` | 关闭强制登录 |
| `SERVE_STATIC` | `true` | 单进程托管前端 |

回滚优先改开关，其次回滚代码，最后才动数据。

## 7. 多 Agent 并行

- 每个 agent 一个 worktree + 短期分支；
- 写入面按目录隔离：`web/`、`src/routes|services`、`src/db`、`prompts/`；
- 合并前由层负责人跑对应验收；
- 冲突高发文件：`src/routes/index.js`、`package.json`、`docs/architecture/*`，改动前先同步层分支。

## 8. 常见错误

- 在 `main` 上直接开发；
- 改已应用的迁移；
- 跨层 PR 只改一端；
- 用“应该可以”代替验证证据；
- 把 `.env`、构建产物、临时脚本混进提交；
- 忘记回滚开关。
