# DreamReel 工作流说明（AI 管理文档）

> 本目录是 AI 管理文档的**工作流上下文**（每期 Sprint 一份 `context-sprintNN.yaml`）。

## 目录约定（本次重排后）

| 目录 | 作用 |
|---|---|
| `ai/workflow/` | 工作流上下文（`context*.yaml`：范围/验收/状态日志） |
| `ai/docs/` | 需求 / 交付报告 / 方案（PRD、`sprint*-delivery-report.md`、`novel-series-plan.md`…） |
| `ai/refs/` | 参考与产物（arch_report、ui_design、artifacts…） |
| `src/` `public/` `scripts/` `tests/` | 项目代码 |
| `storage/` | 代码输出文件（运行时生成，gitignore） |

> 路径已统一：文档内引用为 `ai/workflow/...`、`ai/docs/...`；运行时输出为 `storage/...`（对外媒体 URL 仍是 `/storage/...`）。

## 每期 Sprint 流程

1. **上下文**：新建 `ai/workflow/context-sprintNN.yaml`（范围/验收/风险/state_log）。
2. **实现**：TDD（先跑绿→改→回归）；产出代码 + 测试。
3. **验证**：`npm test`、`npm run lint`、真实 E2E（HTTP/CLI/浏览器）。
4. **交付**：`ai/docs/sprintNN-delivery-report.md`；同步 `README.md`。
5. **提交**：Conventional Commits（`feat:`/`fix:`/`docs:`…）。

## 状态机

- 工作流态：`GLOBAL_PENDING → GLOBAL_IN_DEV → GLOBAL_IN_TEST → GLOBAL_IN_CONSISTENCY → GLOBAL_DONE`
- 小说项目阶段：`source → characters → world → series → episodes → assets → compose`（**进入下一阶段后，之前阶段锁定**）

## 小说 → 剧集 流水线（现状）

```
书名/链接 → TXT下载(一次)+清理 → 分章切片 → 角色(备选/选定) → 世界观(备选/选定)
→ 分季分集(1章≥1集,每季≥200集) → 单集剧本(85–95s) → 图/音/视频 → 成片 → 剧集包 → 存储同步
```

- 图片：Ark `doubao-seedream-5.0-pro`（真实）；文本：opencode（本地 OpenCode 服务）；视频：Ark Doubao-Seedance 待 plan，当前走**外部生成交接**。
- 运行：`npm start`（默认 :3000，可用 `PORT`）；CLI：`npm run novel -- <cmd>`。
