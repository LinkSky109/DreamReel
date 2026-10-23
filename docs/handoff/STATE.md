# DreamReel 整改状态看板（STATE）

> **唯一实时状态**。任务开始/结束/阻塞时必须更新本文件；历史只追加到 `JOURNAL.md`。
> 计划：`docs/plans/2026-10-22-remediation-plan.md`；规范：`docs/handoff/README.md`。
> 本文件最后更新：**2026-10-23 10:30 (+08:00)** ／ 更新人：**lead**

## 1. 当前阶段

| 项 | 值 |
|---|---|
| 阶段 | **R3 还债完成（T3.1–T3.9）；main 已推送并过发布门禁** |
| 轮次 | R3 完成，进入发布准备 |
| 目标 | 提升覆盖率至 80%、补 WAL PITR 演练、发布评审 |
| 阻塞 | 覆盖率仍为基线门槛；PITR 需 WAL 归档环境；TS7 下无 type-aware ESLint |
| 下一步 | 1) 覆盖率增量提升；2) 真实 PITR 演练；3) 发布评审与 tag |

## 2. 事实基线

| 项 | 值 |
|---|---|
| 仓库 | `/Users/link/myApp/DreamReel` |
| 当前分支 | `main`（已推送 `origin/main`） |
| HEAD | 以 `git log --oneline -1` 为准（R3 收口合并：`82a5180`） |
| main | 与 origin/main 同步；R2 tag `r2-cutover` 已推送 |
| PostgreSQL | 迁移 `001`–`015` 已应用；新增 `video_jobs`；pending 0 |
| 小说数据 | 1 部《殖装》/1206 章/33 季/8496 集；角色 559/实体 725/资产 1621 |
| 测试基线 | 后端 **946**（944 pass / 2 skip）、前端 **158**；覆盖率门槛生效；E2E 1 passed；smoke 通过 |
| 运行时 | 小说域 PG-only；`db.json` 仅非小说集合；无 JSON 导出快照、无 outbox |
| 恢复 | `pg_dump`/PITR 为唯一数据回滚；归档 JSON 仅离线应急 |

## 3. 任务看板

图例：`pending` / `in_progress` / `review` / `done` / `blocked`

### R0 基线与集成

| ID | 任务 | Owner | 状态 | 证据/备注 |
|---|---|---|---|---|
| R0-T0.1 | 备份（pg_dump + archive + bundle） | lead | done | `storage/backup/pre-merge-20261022-153321.sql`（14MB） |
| R0-T0.2 | 在途改动按层提交 | lead | done | 分层 commit + 4 个 worktree 已合并 |
| R0-T0.3 | 合并 main + tag | lead | done | merge `5bfd062`；tag `novel-pg-cutover-2026-10-22`；已 push |
| R0-T0.4 | 门禁/测试锁脚本 | lead | pending | `check` 已可用；`scripts/agent/*` 未建 |
| R0-T0.5 | 长期 worktree | lead | review | 本轮已用临时 worktree 完成并行并清理 |
| R0-T0.6 | 长期巡检机制 | lead | pending | STATE/JOURNAL 已转为正式源 |

### R1 止血

| ID | 任务 | 状态 | 备注 |
|---|---|---|---|
| R1-T1A.1 | `db:verify:novels` 归档回退修复 | done | 归档回退 + 只读 verify；mismatches=0 |
| R1-T1A.2 | 回滚/恢复口径 + 删死开关 | done | 文档已改为 PG-only/PITR |
| R1-T1A.3 | 迁移 014 删 episodes 旧唯一约束 | done | 014 已应用；重排用例通过 |
| R1-T1A.4 | 迁移链冷启动验证 | done | 临时库 001–014 全应用 |
| R1-T1A.5 | dual 废弃/移除 | done | `NOVEL_WRITE_MODE` 已删除 |
| R1-T1B.1–5 | 安全 P0（鉴权/API Key/路径/管理面） | done | 869 测试、smoke 401/200 通过 |
| R1-T1C.1–5 | 发布链 | done | API 基址/镜像/Compose+迁移/产物策略/smoke |
| R1-T1B.6 | 媒体严格访问开关 | deferred | 本轮控制改动面，留 R3 |

### R2 收口

| ID | 任务 | 状态 | 备注 |
|---|---|---|---|
| R2-T2.1 | 契约补齐（novels + api/v1.md） | done | 8 端点契约 + 422 测试 |
| R2-T2.2 | 移除 storageService 顶层 await/水合 | done | 投影/水合已删除 |
| R2-T2.3 | Phase 3c-2 路由去投影读 | done | 生产/测试 PG-only |
| R2-T2.4 | 文档/清单刷新 | done | `check:docs` 缺失 0 |
| R2-T2.5 | 全量门禁 + 交付报告 + tag | done | gate full + E2E 通过；`r2-cutover` 已推送 |
| R2-T2.6 | 收敛双构建链 | done | `build`→public；`build:web`→web/dist；产物守卫/CI |
| R2-T2.7 | 已知边界收尾（outbox/JSON 导出/死代码） | done | outbox/worker/store/表与 JSON 导出已删 |

### R3 还债

| ID | 任务 | 状态 | 证据 |
|---|---|---|---|
| R3-T3.1 | IDOR 全覆盖 | done | `projectIdor.test.js` 38 条矩阵；跨用户 403 |
| R3-T3.2 | 身份单一来源 | done | `identity.js` + `ALLOW_ANONYMOUS`；`identity.test.js` |
| R3-T3.3 | zod 写接口校验 | done | projects/video/teams/gallery/novels 契约 + 422 |
| R3-T3.4 | LLM 配额/匿名 mock | done | `quotaGuard.js`；429；匿名 provider=mock |
| R3-T3.5 | 长任务持久化 | done | ADR-0005；迁移 015；jobs API/worker；`videoJobs.test.js` |
| R3-T3.6 | 错误映射统一 | done | `AppError` + `errorHandler`；25 路由无 4xx/5xx 兜底 |
| R3-T3.7 | 前端质量 | done | 401 跳转、Editor smoke、删 `public/js`、StrictMode、ESLint web、覆盖率门槛 |
| R3-T3.8 | 可观测与韧性 | done | Redis 限流/幂等（真实双实例测试）、CSP/HSTS、池指标、备份恢复演练 |
| R3-T3.9 | 契约自动化 | done | `check:api` 0 死链，入 `npm run check` |

## 4. 最近门禁记录

| 时间 | 命令 | 结果 | 执行人 |
|---|---|---|---|
| 2026-10-22 15:17 | `npm run check` | 后端 817 / 前端 138 / lint/typecheck/docs/legacy 全绿 | lead |
| 2026-10-22 19:51 | `npm run check` | 后端 869 / 前端 143 / legacy 0 | lead |
| 2026-10-22 20:13 | `gate.sh full` | 后端 878 / 前端 143 / legacy 0 | lead |
| 2026-10-22 20:13 | `test:e2e` / `smoke.sh` / `gate.sh build` | E2E 1 passed；smoke 通过；public 零 diff | lead |
| 2026-10-22 19:5x | `db:verify:novels` / `smoke.sh` | mismatches=0；401/200/静态首页通过 | lead |
| 2026-10-22 15:17 | `npm run check:legacy` | 0 违规 | lead |
| 2026-10-22 15:12 | `npm run db:migrate` / `db:status` | 013 已应用，pending 0 | lead |
| 2026-10-22 14:5x | `series:verify` | 33 季 / 8496 集 / 99.69% / 覆盖 99.98% | lead |
| 2026-10-22 14:5x | API smoke | list/detail/episodes/chars/world/assets/voices/estimate 200 | lead |
| 2026-10-23 09:20 | `npm run check` | 后端 946 / 前端 148 / 覆盖率门槛 / 死链 0 | lead |
| 2026-10-23 09:25 | `gate.sh e2e` / `build` / `smoke` | E2E 1 passed；双构建通过；smoke 通过 | lead |
| 2026-10-23 09:40 | 备份恢复演练 | 关键表行数一致；报告 `2026-10-23-backup-restore-drill.md` | lead |
| 2026-10-23 09:50 | Redis 双实例集成 | 限流共享 + 幂等重放 2/2 通过 | lead |
| 2026-10-23 11:10 | 覆盖率增量 | 50.39/46.65/35.23/51.58；门槛 50/46/35/51 | lead |

> 合并 main 前必须重跑 `npm run check` + `series:verify` + 恢复演练。

## 5. 风险与阻塞

| 风险 | 影响 | 缓解 | 状态 |
|---|---|---|---|
| 生产管理员无角色分配流程 | 管理面 403 | 上线前补角色/运维初始化 | 待处理 |
| API Key 旧明文惰性迁移 | 旧 key 首次使用才哈希 | 上线前触发一次或跑一次性迁移 | 待处理 |
| 覆盖率仅锁基线 | 回归保护弱于目标 | 按域补测试，逐步抬升至 80% | 待处理 |
| PITR 未真演练 | 时间点恢复未验证 | 需 WAL 归档环境；逻辑恢复已演练 | 待处理 |
| TS7 无 type-aware ESLint | 类型级 lint 缺失 | 依赖 tsc；待 typescript-eslint 支持 TS7 | 待处理 |
| 迁移 013 已用于 outbox | T1A.3 使用 014 | 已应用 014 | 已缓解 |
| 归档 JSON 误用 | 回退到旧数据 | 只允许离线工具 + `check:legacy` | 已控制 |

## 6. 巡检记录

| 日期 | 巡检人 | 结论 | 任务包 |
|---|---|---|---|
| 2026-10-23 | lead | R3 九组完成并推送；发布门禁通过 | 覆盖率提升 → PITR → 发布评审 |
