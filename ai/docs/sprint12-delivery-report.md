# DreamReel Sprint 12 交付报告

- **Sprint**：12（TASK-20261004-012）
- **主题**：造型 prompt 自动注入视频生成 + 编辑器造型表单 + 创意片头模块
- **交付日期**：2026-10-04
- **对标产品**：[LibTV](https://www.liblib.tv/)
- **工作流上下文**：`.workflow/context-sprint12.yaml`
- **最终状态**：✅ GLOBAL_DONE（产品经理复核结论：通过 PASS）

---

## 一、范围总览

| 需求 | 名称 | 类型 | 状态 |
|---|---|---|---|
| R26 | 造型 prompt 自动注入视频生成 | 后端 | ✅ 闭环 |
| R27 | 编辑器角色 tab 造型表单 UI | 前端 | ✅ 闭环 |
| R28 | 创意片头模块（4 模板 + 生成 + 预览 + 插入项目） | 后端 + 前端 | ✅ 闭环 |

**明确不做（后置 Sprint 13/14）**：导演模式、画布五 tab 整合、剧场厂牌体系。子项目 `/Users/link/myApp/CineAI` 全程只读未动。

---

## 二、需求交付说明

### R26 造型 prompt 自动注入视频生成（后端）

- `src/services/videoService.js` 新增 `_enhanceWithStyling(prompt, shot, project)`，在 `generateShot()` 中于角色动作注入之后、视觉风格锁定之前调用：
  - 仅收集**当前镜头 `shot.characterIds` 关联**的角色，逐角色取 `Character.buildStylingPrompt()`（造型风格/服装/妆容）拼入最终 prompt；
  - 兼容 Character 实例与普通 JSON 对象（裸对象直接读 wardrobe/makeup/styling 拼装）；
  - 空 characterIds、角色不存在、三字段全空时原样返回 prompt，**不污染无造型镜头**。
- 修复 Sprint 11 遗留缺陷：`src/services/projectService.js` 的 `hydrateProject` 重建 Character 时漏传 wardrobe/makeup/styling，导致服务重启后造型丢失——已补传，重启后字段与 `buildStylingPrompt()` 均可用。
- 单元测试 `tests/videoStylingPrompt.test.js`（5 用例）：stub provider 捕获**实际发给 provider 的 prompt**，覆盖有造型注入、无造型不污染、裸 JSON 兼容、空 characterIds、hydrate 重启持久化。

### R27 编辑器角色 tab 造型表单 UI（前端）

- `public/js/views/editor.js` 角色卡片新增「🎨 角色造型」分区：服装（input）、妆容（input）、整体造型（textarea），均按 `character.wardrobe/makeup/styling` 预填；「💾 保存造型」按钮。
- 保存流程：按钮置「保存中…」→ `PATCH /api/characters/:id/styling`（`public/js/api.js` 新增 `updateCharacterStyling`）→ toast「造型已保存」→ `getProject` 合并本地 state → 重渲染；失败 toast error 并恢复按钮。
- 刷新页面后三字段按接口数据回显（R26 的 hydrate 修复保证服务重启后同样回显）。
- 沿用现有暗色电影感 class（`.form-group/.form-label/.form-input/.form-textarea/.btn`）与 CSS 变量，未新造设计体系。

### R28 创意片头模块（后端 + 前端，对标 LibTV「创意片头」）

**后端**
- 新增 `src/services/titleSequenceService.js`，内置 4 个模板，每个含 id/name/visualDescription/musicMood（BGM 选曲建议）/ffmpeg 标题卡参数：

| 模板 ID | 名称 | 时长 | 视觉 |
|---|---|---|---|
| classic-gold | 黑底金字经典 | 4s | 近黑底、烫金宋体片名居中、浅金副标题、淡入淡出 |
| glitch-cyber | 故障赛博 | 4s | 深青黑底、扫描线、青/品红 RGB 错位片名 |
| ink-wash | 水墨国风 | 5s | 宣纸暖灰、墨色晕染、墨黑宋体、朱砂方印 |
| neon-retro | 霓虹复古 | 4s | 深紫渐变、粉色发光片名、青色网格线 |

- 渲染管线：`scripts/render_title_card.py`（Pillow 真实绘制中文片名/副标题到 1280×720 PNG）→ `src/utils/titleCard.js`（spawn python3 封装）→ ffmpeg `-loop 1` 合成为 mp4，含 0.6s 淡入淡出，并 mux `anullsrc` 静音 AAC 音轨。
- python/Pillow 不可用时自动回退纯色氛围背景，返回中如实标记 `titleRendered:false`，不伪装上屏。
- 新增 `src/routes/titleSequences.js`：`GET /api/title-sequences`（返回 `{total,items}`）、`POST /api/title-sequences/:id/generate`（body：projectId/title/subtitle；title 空→400，模板不存在→404，成功 201 返回 videoUrl/duration/titleRendered/audioTrack）；已在 `src/server.js` 注册 `/api/title-sequences`。

**前端**
- 新增 `public/js/views/titleSequences.js`：模板卡片网格（名称/视觉描述/推荐配乐情绪）、片头标题/副标题输入、项目下拉、生成按钮（含「生成中…」态）、`<video>` 预览、「📥 插入项目片头」——把片头作为 completed 镜头 `unshift` 到项目 `shots[0]`，duration 取接口返回值，重排 index 后 `PUT /api/projects/:id`。
- `public/js/app.js` 注册 `#/title-sequences` 路由；`public/index.html` 顶部导航新增「🎞️ 片头」。
- 配乐情绪文案如实表述为「推荐配乐情绪：…（片头为静音，可在配音轨按此情绪添加 BGM）」。
- `public/js/api.js` 新增 `listTitleSequences` / `generateTitleSequence`；本地开发 API_BASE 改为同源 `/api`（window.ENV_API_URL / localStorage 优先级不变）。

---

## 三、测试结果

| 指标 | Sprint 11 基线 | Sprint 12 交付 |
|---|---|---|
| 单元测试总数 | 321 | **332**（+11） |
| 通过 / 失败 | 321 / 0 | **332 / 0** |
| 测试命令 | `npm test`（node --test） | 同左 |

新增测试：`tests/videoStylingPrompt.test.js`（5 例）、`tests/titleSequence.test.js`（6 例，含首帧 rawvideo 像素扫描断言片名上屏）。

**Lint**：本期新增/修改文件 `npx eslint` 零错误。仓库存量 43 个历史 error（分布于 29 个 Sprint 12 未触碰文件，如 baseLLMProvider 及多个旧路由），未在本期范围、未擅自扩大修复；该存量债务表述已经 PM 独立核实。

---

## 四、E2E 冒烟证据

编排者最终以 PORT=3017 独立复测（测后已 kill、端口确认关闭）：

- `GET /health` → 200 `{"status":"ok"}`
- `GET /api/title-sequences` → `{"total":4,"items":[...]}`，4 模板字段齐全
- `POST /api/title-sequences/neon-retro/generate` `{projectId,title:"最终冒烟",subtitle}` → 201，返回 `titleRendered:true,audioTrack:true,audio:"silent",duration:4`
- 视频 URL `curl -I` → **HTTP 200，Content-Type: video/mp4**
- `ffprobe` → **h264 视频流 + aac 音频流双流**，duration 4.083s
- 前端静态资源 `/`、`/js/app.js`、`/js/views/editor.js`、`/js/views/titleSequences.js` 均 200
- 异常语义：空 title → **400**；未知模板 → **404**

子代理另以真实 Chrome 浏览器验证（PORT=3013/3015）：片头页 4 卡片渲染、项目下拉、生成后 video 预览、插入后项目 shots[0] 为片头（duration=4）；角色 tab 造型字段预填、编辑保存出现 toast「造型已保存」、整页刷新后值回显；控制台无 error。

---

## 五、新增 / 修改文件清单

**新增（9）**
- `src/services/titleSequenceService.js`
- `src/routes/titleSequences.js`
- `src/utils/titleCard.js`
- `scripts/render_title_card.py`
- `tests/videoStylingPrompt.test.js`
- `tests/titleSequence.test.js`
- `public/js/views/titleSequences.js`
- `docs/sprint12-pm-review.md`
- `.workflow/context-sprint12.yaml`

**修改（7）**
- `src/services/videoService.js`（R26 注入）
- `src/services/projectService.js`（hydrate 造型字段修复）
- `src/server.js`（片头路由注册）
- `public/js/api.js`（造型/片头 API + 同源 base）
- `public/js/views/editor.js`（造型表单）
- `public/js/app.js`（片头路由）
- `public/index.html`（导航入口）
- `README.md`（功能亮点、角色/片头 API、导航、运行时依赖说明）

---

## 六、产品经理复核结论（摘要）

完整复核文档：`docs/sprint12-pm-review.md`。

- **首轮结论：带条件通过**。3 项重要问题：① 片头片名未上屏（ffmpeg 未编译 drawtext/subtitles）却在模板描述中暗示上屏；② 片头无音轨而「配乐情绪」标签易被误解为自带配乐；③ README 未同步。
- 修复采用「Pillow 绘制标题卡 PNG → ffmpeg 合成 + 静音音轨 mux + 文案/文档如实化 + README 同步」。
- **闭环复核（二轮）最终结论：✅ 通过（PASS）**。独立证据：抽帧肉眼确认 4 模板片名真实上屏且视觉可区分；金色像素 6955 个、包围盒中心 x=641 ≈ 画幅中心；ffprobe 四模板均为 h264+aac 双流；332 测试独立复跑全过；导演模式/画布五 tab/剧场厂牌未误动，CineAI 未改动。

---

## 七、已知限制与后续路线

1. 片头为**静音视频**：musicMood 仅为 BGM 选曲情绪建议；后续可接 `audioService`/BGM 库按 mood 自动选曲混音（仓库已有 processBgm/mixAudioTracks 能力）。
2. 片头渲染依赖本机 `python3 + Pillow + 中文字体`（README 已声明，含 Docker 需预装说明）；缺依赖时回退纯色背景并标记 `titleRendered:false`。
3. 片头产物暂无 TTL/去重清理策略，`storage/title-sequences/` 会随生成累积（含本期冒烟产物，作为演示证据保留）；后续加生命周期管理。
4. `public/js` 尚未纳入 eslint 覆盖范围；仓库存量 43 个历史 lint error 未清理。
5. **后置路线**：Sprint 13 导演模式（AI 统筹运镜/节奏 prompt 编排）、剧场厂牌体系；Sprint 14 画布多 tab 整合、图片/音频独立 tab、智能剪辑模块。

---

## 八、结论

Sprint 12 三项需求（R26/R27/R28）端到端真实闭环：角色造型从「只存字段」升级为「真实注入视频生成 prompt 且只作用本镜角色」，编辑器提供可编辑可回显的造型表单，并新增对标 LibTV 的创意片头模块（4 套模板、片名真实上屏、可预览、可一键插入项目最前）。332 个单元测试全部通过，E2E 冒烟与真实浏览器验证证据充分，产品经理复核最终 **PASS**，流程状态 **GLOBAL_DONE**。
