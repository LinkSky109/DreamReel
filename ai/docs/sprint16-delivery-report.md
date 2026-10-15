# DreamReel Sprint 16 交付报告（安全加固）

- 任务 ID：`TASK-20261010-016`
- 主题：R36 项目所有权校验 + R37 媒体文件访问控制加固
- 来源提交：`cdd9c08 Merge Sprint 16/17/18 patches`（2026-10-10）
- 工作流上下文：`.workflow/context-sprint16.yaml`
- 最终状态：✅ `GLOBAL_DONE`（代码已接入）；⚠️ 验证为 `PARTIAL`（缺专项自动化测试）

> ⚠️ **补记说明**：Sprint 16/17/18 由同一个提交合并，仓库内无原始 Sprint 16 的子代理/时间记录。本报告由编排者于 2026-10-12 依据 `git diff d3bdbb2 cdd9c08` 的代码事实重建，未杜撰未记录信息。

---

## 一、范围

| 需求 | 名称 | 状态 |
|---|---|---|
| R36（= T16-001） | 项目所有权校验 | ✅ 交付 |
| R37 | 媒体文件访问控制加固 | ✅ 交付 |

---

## 二、R36 项目所有权校验

新增 `src/middleware/projectAccess.js`：

- `requireProjectOwnership(req, res, { projectIdParam })`：加载项目 → 归属校验；跨用户 `403`、项目不存在 `404`；匿名请求固定视为 `default` 用户。
- `requireRecycleBinOwnership(...)`：回收站条目单独校验归属（回收站项目不在活跃表内）。
- 明确作为 R37 媒体访问控制的归属判定基础（`projectAccess.js` 顶部注释）。

接入点：

- `src/routes/projects.js`：`GET /:projectId/model-config` 改为先 `requireProjectOwnership` 再读取。

验证：**无 R36 专用自动化测试**；`tests/` 内无 `projectAccess` 引用。

---

## 三、R37 媒体文件访问控制

新增 `src/middleware/mediaAccess.js`：

- 公开目录直接放行：`/storage/audio/bgm/`、`/storage/audio/sfx/`、`/storage/scenes/`。
- 受保护目录：`videos / exports / images / audio/previews / audio/voices / thumbnails / title-sequences`。
- 身份识别顺序：`Authorization: Bearer` → `Cookie: token` → `?share=<token>`；无凭证 `401`，无效 share 令牌 `403`。
- 反查媒体归属项目：`shot.videoUrl`、`shot.versions[]`、`project.coverUrl`、导出历史、`imageAssets`、文件名含 `projectId`。
- share 令牌命中被分享项目才放行。

接入点：

- `src/server.js`：受保护目录挂载 `mediaAccess` 后再 `express.static`；公开目录不带校验；`/storage` 其余路径兜底 `404`。
- `src/routes/scenes.js`：写操作加 `authRequired`，越权错误码由 `400` 修正为 `403`；`createCustomScene/updateCustomScene` 传入 `req.user.id`。

---

## 四、测试与静态检查（合入 main 后的实测）

| 项 | 结果 |
|---|---|
| `npm test` | 523 tests / 522 pass / **1 fail** |
| 唯一失败 | `tests/templateMarket.test.js :: should list user templates by user`（**由 Sprint 18 的 FNV 缺陷引发，非本项**） |
| `npm run lint` | 0 error / 1 warning（warning 位于孤立代码 `src/app.js`） |
| R36/R37 专用测试 | **无** |

---

## 五、已知限制与风险

1. **验证缺口**：R36/R37 无专项回归测试，`401/403/share 放行/跨用户` 边界未被自动化覆盖——这是本 Sprint 最主要的欠账。
2. `mediaAccess` 对**已登录但无法反查归属**的媒体（如未持久化的临时预览）采取放行（`project == null → next()`），存在潜在越权面，建议收紧为 `403` 或白名单。
3. share 令牌校验依赖 `collaborationService.getProjectByShareToken` 的实际返回结构，未在本轮加测试。
4. 通用项目 `PUT/DELETE` 授权缺口为 Sprint 15 既有残留，本轮未修复。

---

## 六、新增 / 修改文件

**新增**

- `src/middleware/projectAccess.js`
- `src/middleware/mediaAccess.js`

**修改**

- `src/routes/projects.js`（model-config 归属校验）
- `src/routes/scenes.js`（authRequired + 403）
- `src/server.js`（storage 访问控制挂载）

---

## 七、结论

Sprint 16 交付了项目所有权校验与 `/storage` 媒体访问控制两个基础安全机制，代码已真实接入 `src/server.js` 与相关路由。**但缺少专项自动化测试**，边界行为未被证据覆盖，因此验证状态记为 `PARTIAL`。

**最终状态：`GLOBAL_DONE`（代码） / `PARTIAL`（验证）。**
