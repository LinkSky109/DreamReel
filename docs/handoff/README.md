# DreamReel 整改交接与长期运行机制

> **2026-10-22 最新**：小说域已 PG-only；legacy 读/写、JSON 投影、outbox、JSON 导出已移除。
> 当前状态、门禁与下一步以 `STATE.md` 为准；`2026-10-22-remediation-plan.md` 中相关任务为历史计划。

> 本目录是 DreamReel 收口整改的**协作事实源**。任何新智能体/工程师接手前，按本文件顺序阅读并执行开工自检。
> 计划正文：`docs/plans/2026-10-22-remediation-plan.md`。

## 1. 阅读顺序与事实优先级

1. `docs/handoff/STATE.md` — 当前阶段、任务看板、下一动作、阻塞（**唯一实时状态**）
2. `docs/handoff/JOURNAL.md` — 历史流水（append-only，只追加不改写）
3. `docs/plans/2026-10-22-remediation-plan.md` — 任务定义与验收标准
4. `docs/handoff/TEMPLATE.md` — 交接单模板（完成任务时填写）

**事实优先级**：`git`（代码/提交/状态） > `STATE.md` > `JOURNAL.md` > 计划文档 > 口头/聊天记录。
当文档与 `git` 冲突时，以 `git` 为准，并立即修正 STATE（在 JOURNAL 记录修正原因）。

## 2. 角色

| 角色 | 能做 | 不能做 |
|---|---|---|
| **Lead** | 操作 `main`、合并、派活、跑 G2/G3、维护 STATE/JOURNAL、决定升级 | 单独静默做跨泳道大改 |
| **Track Owner** | 在自己的 worktree/分支实现任务、写测试、跑 G0/G1、提交 | 操作 `main`、改其他泳道文件、改 `.env` |
| **Verifier** | 只跑门禁/冒烟、写验证记录、判环境 vs 代码 | 改代码、改测试让门禁通过 |
| **Reviewer** | 审阅 diff、按 §8 清单给出通过/阻断 | 直接替 Owner 提交（除非 Lead 指派） |

## 3. 开工自检（每个任务开始前必做）

```bash
cd <你的 worktree>            # 主仓库或 ../DreamReel-wt/<track>
git branch --show-current     # 必须是任务指定分支，不能是 main
git rev-parse --short HEAD
npm run check                 # 当前门禁（scripts/agent/* 待 R0-T0.4 建立）
git status --short | head -20 # 确认没有非本任务的文件改动
```
任一项不符 → 在 STATE 标 `blocked` 并 @Lead，不要继续。

## 4. 任务状态机

```
pending → claimed → in_progress → review → done
                         └──────→ blocked（记录原因/证据/下一步/升级对象）
```

- `claimed`：在 STATE 看板填 owner 与开始时间。
- `in_progress`：只改任务卡写明的文件；需要越界时先改任务卡（Lead 批准）。
- `review`：提交后等 Reviewer；db/auth/迁移类必须 2 人审。
- `done`：门禁绿 + 证据齐 + STATE/JOURNAL/交接单更新 + commit 已合入目标分支。
- `blocked`：超过 2h 无进展必须转 blocked，不得静默等待或反复重跑。

## 5. 分支 / worktree / 测试锁

### 5.1 分支

- 从 `main` 拉：`fix/<layer>-<slug>` 或 `feat/<layer>-<slug>`（layer ∈ db|backend|frontend|llm|security|release）。
- 只有 Lead 能 merge 到 `main`，且必须是 `--no-ff`，合并后立即打 tag（`r1-stopgap`、`r2-cutover`）。
- 禁止 `push --force`、禁止 rebase 已合并分支、禁止直接 commit 到 `main`。

### 5.2 worktree（并行开发隔离）

```bash
git worktree add -b fix/db-safety    ../DreamReel-wt/db       main
git worktree add -b fix/security-p0  ../DreamReel-wt/security main
git worktree add -b fix/release-p0   ../DreamReel-wt/release  main
ln -sfn /Users/link/myApp/DreamReel/.env         ../DreamReel-wt/<track>/.env
ln -sfn /Users/link/myApp/DreamReel/node_modules ../DreamReel-wt/<track>/node_modules
```
- `.env` 里没有 `STORAGE_PATH`，每个 worktree 用自己的 `./storage`，不会串主仓库。
- 共享 PostgreSQL 与测试库 `dreamreel_test` → **测试必须串行**；当前用 `npm run check`，gate 锁脚本待 R0-T0.4。

### 5.3 测试/门禁锁

```bash
npm run check                    # 当前全量：lint/typecheck/docs/legacy/后端 817/前端 138
npm run test:e2e                 # Playwright（独占端口）
npm run build:web                # 前端构建
# scripts/agent/gate.sh 为 R0-T0.4 待建统一封装；建立前用上述命令
```
**禁止**绕过 gate 直接并发跑 `npm test`，否则会互相 DROP/CREATE `dreamreel_test` 与清空 `storage/test-run`，造成 flaky（已实际发生过）。

## 6. 门禁标准（Definition of Done）

| 层 | 必跑 | 附加要求 |
|---|---|---|
| db | `npm run check` + `npm run db:status` + 迁移冷启动验证 | 迁移只增不改；新增迁移必须有回滚说明 |
| backend/security | `npm run check` | 新接口默认鉴权；公开接口显式加白名单并测试 |
| frontend | `npm run test:web` + `npm run build:web` | 生产构建通过；无 `localhost:3000` 硬编码 |
| docs | `npm run check:docs` | 端点/配置/回滚口径与实现一致 |
| 全量 | `npm run check` + `npm run test:e2e` + 发布冒烟 | 由 Lead 在合并前执行，结果写入 JOURNAL |

## 7. 交接协议

### 7.1 触发条件（任一）

- 任务完成 / 转 blocked / 上下文超过 60% / 单轮超过 45 分钟 / 用户打断 / 门禁连续失败 2 次。

### 7.2 交接必做（缺一不可）

1. 更新 `STATE.md`：任务状态、owner、commit sha、下一动作、阻塞。
2. 追加 `JOURNAL.md` 一条（格式见文件头，append-only）。
3. 按 `TEMPLATE.md` 写交接单（放 `docs/handoff/notes/<日期>-<任务ID>.md`，或消息正文引用）。
4. 确保工作区干净（`git status` 仅 ignored）；未完成改动要么提交为 WIP commit（`wip:` 前缀，标注不合并），要么写清恢复命令。
5. 通知 Lead（消息里带：任务 ID、分支、commit、门禁结果、下一任务建议）。

### 7.3 交接禁止

- 不允许「口头交接」而不写 STATE/JOURNAL。
- 不允许把未验证的结论写成「已完成」。
- 不允许把上下文里的临时路径、密钥、`.env` 内容写进交接单。
- 不允许在交接时留下未提交的源码改动（WIP commit 除外，且必须标注）。

## 8. Review 清单

**所有改动：**
- [ ] 改动文件与任务卡一致，无越界
- [ ] 有对应测试（先失败后通过），异常路径覆盖
- [ ] 无硬编码密钥/绝对路径/localhost
- [ ] 错误处理符合现状（不吞异常、不泄露内部 message 到生产响应）
- [ ] 文档/注释同步

**db/迁移：**
- [ ] 只新增迁移，未改已应用文件（checksum 不变）
- [ ] 在 `_test` 库或临时库从 0 迁移验证
- [ ] 回滚/恢复方式写明
- [ ] 有数据一致性校验命令

**auth/安全：**
- [ ] 新接口默认拒绝，公开接口显式白名单 + 测试
- [ ] 身份只来自 `req.auth`，无 body/query 覆盖
- [ ] 归属校验覆盖资源路由（404/403 语义正确）
- [ ] 无路径拼接写文件、无模板拼接命令执行

**frontend：**
- [ ] `tsc` 严格模式无新增错误；无新增 `any`/`@ts-ignore`
- [ ] 生产构建通过；构建产物与源码同提交（若产物入库）
- [ ] 断网/未登录/错误态有兜底

## 9. 阻塞升级 SLA

| 时长 | 动作 |
|---|---|
| 2h 无进展 | Track Owner 在 STATE 标 `blocked`，@Lead 说明卡点与已尝试方案 |
| 8h | Lead 接管或换人/并行绕行；更新计划 |
| 24h | 降级范围（拆分任务/临时开关/文档记录已知限制） |
| 48h | 上报用户，给出选项与影响 |

**自动重试**：可重试失败最多 3 次（10min → 30min → 60min 退避）；第 3 次仍失败必须 `blocked`，禁止无限重跑。

## 10. 长期运行机制

### 10.1 轮次

- **R0 基线** → **R1 止血** → **R2 收口** → **R3 还债**（R3 可分多轮，每轮 1 组）。
- 每轮开工：Lead 读 STATE/JOURNAL → 派任务包（每个 Owner 一条自包含消息）。
- 每轮收尾：Lead 跑 G2/G3 → 合并 → 更新 STATE → 写 `docs/delivery/<日期>-<轮次>.md` → 打 tag。

### 10.2 每日巡检（Lead）

每天 10:00 执行（DSH `schedule_create` daily）：

1. 读 `STATE.md` 与 `JOURNAL.md` 最新 3 条。
2. `git log --oneline -10`、`git branch -a`、`git worktree list`。
3. `npm run lint && npm run typecheck`（轻量巡检；全量按轮次执行）。
4. 检查是否有超 2h 未更新的 `in_progress` 任务 → 按 SLA 升级。
5. 更新 STATE「巡检记录」，给出当日任务包。
6. 周五汇总周报（完成/阻塞/风险/下周计划），写 `docs/delivery/`。

### 10.3 上下文与连续性

- 一个任务一个会话/一轮；不跨任务复用上下文。
- 会话中断后，新智能体从 STATE + JOURNAL + 交接单恢复，禁止凭记忆继续。
- 所有关键决策写入计划文档「变更记录」或 JOURNAL，不只存在于聊天里。

## 11. 安全与合规底线

- 不提交 `.env`、密钥、`storage/`、构建缓存；不把密钥写进文档/日志。
- 不在 `main` 直接开发；不 force push；不改已应用迁移；不删 `default` org。
- 破坏性命令（`db:restore`、`series:rebuild`、`db:cleanup:* --apply`、`DROP DATABASE`）必须先备份并获 Lead 批准。
- 推送远端、部署、发布必须获用户明确同意。
