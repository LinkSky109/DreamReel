# DreamReel 整改状态看板（STATE）

> **唯一实时状态**。任务开始/结束/阻塞时必须更新本文件；历史只追加到 `JOURNAL.md`。
> 计划：`docs/plans/2026-10-22-remediation-plan.md`；规范：`docs/handoff/README.md`。
> 本文件最后更新：**2026-10-22 15:20 (+08:00)** ／ 更新人：**lead**

## 1. 当前阶段

| 项 | 值 |
|---|---|
| 阶段 | **R2 小说域 PG 单源收口完成；已合并 main 并推送** |
| 轮次 | R2（小说域）；R0 合并 main、R1 安全止血仍待办 |
| 目标 | 进入 R1 安全/发布；main 已同步远端 |
| 阻塞 | 无；合并/推送已完成 |
| 下一步 | 1) 启动 R1-T1B 安全 P0；2) 补 R1-T1A 迁移冷启动/verify；3) 复跑 E2E；4) R2 契约与交付报告 |

## 2. 事实基线

| 项 | 值 |
|---|---|
| 仓库 | `/Users/link/myApp/DreamReel` |
| 当前分支 | `main`（已合并并推送） |
| HEAD | `5bfd062 merge: 小说域 PostgreSQL 单源与 legacy 清理`（后续文档状态提交另计） |
| main | `5bfd062`（已推送 origin/main）；tag `novel-pg-cutover-2026-10-22` |
| PostgreSQL | 迁移 `001`–`013` 已应用；`outbox_events` 已由 013 删除 |
| 小说数据 | 1 部《殖装》/1206 章/33 季/8496 集；角色 559/实体 725/资产 1621 |
| 测试基线 | 后端 **817**、前端 **138**、`check:legacy` **0**；`series:verify` 99.69% / 覆盖 99.98% |
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
| R1-T1A.1 | `db:verify:novels` 归档回退修复 | pending | — |
| R1-T1A.2 | 回滚/恢复口径 + 删死开关 | done | 文档已改为 PG-only/PITR |
| R1-T1A.3 | 迁移 013 删 episodes 旧唯一约束 | pending | 013 已被 outbox drop 占用；需重新编号 |
| R1-T1A.4 | 迁移链冷启动验证 | pending | 需从空库验证 001–013 |
| R1-T1A.5 | dual 废弃/移除 | done | `NOVEL_WRITE_MODE` 已删除 |
| R1-T1B.1–6 | 安全 P0（鉴权/API Key/路径/管理面） | pending | 见计划 |
| R1-T1C.1–5 | 发布链 | pending | 见计划 |

### R2 收口

| ID | 任务 | 状态 | 备注 |
|---|---|---|---|
| R2-T2.1 | 契约补齐（novels + api/v1.md） | review | 现有 API 文档缺失 0；novels 契约仍需补 |
| R2-T2.2 | 移除 storageService 顶层 await/水合 | done | 投影/水合已删除 |
| R2-T2.3 | Phase 3c-2 路由去投影读 | done | 生产/测试 PG-only |
| R2-T2.4 | 文档/清单刷新 | done | `check:docs` 缺失 0 |
| R2-T2.5 | 全量门禁 + 交付报告 + tag | review | `npm run check` 绿；E2E 未复跑 |
| R2-T2.6 | 收敛双构建链 | pending | — |
| R2-T2.7 | 已知边界收尾（outbox/JSON 导出/死代码） | done | outbox/worker/store/表与 JSON 导出已删 |

### R3 还债

| ID | 任务 | 状态 |
|---|---|---|
| R3-T3.1–9 | IDOR/默认用户/zod/配额/长任务/错误/前端/可观测/文档 | pending |

## 4. 最近门禁记录

| 时间 | 命令 | 结果 | 执行人 |
|---|---|---|---|
| 2026-10-22 15:17 | `npm run check` | 后端 817 / 前端 138 / lint/typecheck/docs/legacy 全绿 | lead |
| 2026-10-22 15:17 | `npm run check:legacy` | 0 违规 | lead |
| 2026-10-22 15:12 | `npm run db:migrate` / `db:status` | 013 已应用，pending 0 | lead |
| 2026-10-22 14:5x | `series:verify` | 33 季 / 8496 集 / 99.69% / 覆盖 99.98% | lead |
| 2026-10-22 14:5x | API smoke | list/detail/episodes/chars/world/assets/voices/estimate 200 | lead |

> 合并 main 前必须重跑 `npm run check` + `series:verify` + 恢复演练。

## 5. 风险与阻塞

| 风险 | 影响 | 缓解 | 状态 |
|---|---|---|---|
| R1 鉴权/密钥/路径安全未完成 | 匿名写入、密钥/文件风险 | R1-T1B | 待处理 |
| 未合并 main | 基线未发布 | T0.1 备份 → T0.3 合并 | 待用户批准 |
| E2E 未复跑 | 发布回归未知 | `npm run test:e2e` + 冒烟 | 待执行 |
| 迁移 013 已用于 outbox | T1A.3 需新编号 014 | 只增不改，新增 014 | 已记录 |
| 归档 JSON 误用 | 回退到旧数据 | 只允许离线工具 + `check:legacy` | 已控制 |

## 6. 巡检记录

| 日期 | 巡检人 | 结论 | 任务包 |
|---|---|---|---|
| 2026-10-22 | lead | 小说域 PG 单源/legacy removal 完成；待备份/合并与安全止血 | 提交 docs → check → 备份 → 合并 main → R1 |
