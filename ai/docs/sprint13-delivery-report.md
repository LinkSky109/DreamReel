# DreamReel Sprint 13 交付报告

- **Sprint**：13（TASK-20261004-013）
- **主题**：导演模式（导演 prompt 编排）+ 剧场计划厂牌体系
- **交付日期**：2026-10-04
- **对标产品**：[LibTV](https://www.liblib.tv/)
- **工作流上下文**：`.workflow/context-sprint13.yaml`
- **最终状态**：✅ GLOBAL_DONE（产品经理独立复核结论：通过 PASS）

---

## 一、范围总览

| 需求 | 名称 | 类型 | 状态 |
|---|---|---|---|
| R29 | 导演模式（5 位导演档案 + 分镜编排 + prompt 真实注入 + 开关） | 后端 + 前端 | ✅ 闭环 |
| R30 | 剧场计划厂牌体系（厂牌 / 签约创作者 / 剧集 / 作品归入，广场 + 详情） | 后端 + 前端 | ✅ 闭环 |

**明确不做（Sprint 14）**：画布五 tab 整合、图片生成 / 音频生成独立 tab、智能剪辑模块。子项目 `/Users/link/myApp/CineAI` 全程只读、未做任何修改。

---

## 二、需求交付说明

### R29 导演模式（对标 LibTV「导演执导」，本质是 prompt 编排增强）

**纯数据 / 纯函数层**
- 新增 `src/config/directorProfiles.js`（模式参照已有的 `src/config/characterExpressions.js`，不 import 任何 service，从根上避免循环依赖），内置 **5 位导演档案**，每位含：id/name/tagline/era/statement（导演阐述）、camera.style + moves（运镜偏好词库）、pacing.tempo + shotDurationBias + description（节奏）、performance.style + cues（表演指导）、colorLighting.palette + lighting + description（色调光影）、musicMood（配乐情绪）。

| ID | 名称 | 运镜偏好 | 节奏 | 色调光影 | 配乐情绪 |
|---|---|---|---|---|---|
| noir | 黑色电影·暗夜低语 | 荷兰角 / 缓慢推轨 | 舒缓、画外独白 | 黑白幽蓝、低照度高反差 | 萨克斯低回冷爵士 |
| wong | 都市迷离·王家卫式 | 手持 / 抽帧慢门 | 暧昧停顿、情绪先行 | 霓虹溢色、暖黄与品红 | 慵懒拉丁怀旧 |
| kubrick | 冷峻对称·库布里克式 | 单点透视对称 / 缓慢推镜定格 | 冷峻克制、机械精准 | 冷色调、均匀冷光 | 古典与电子极简 |
| bay | 爆裂商业·动作大片 | 环绕甩镜 / 低角度冲击 | 快切高能量 | 高饱和橙青 | 强鼓点 |
| ghibli | 治愈自然·吉卜力式 | 轻柔横移 / 固定长镜 | 舒缓田园 | 通透水彩暖绿 | 灵动管弦 |

- 纯函数：`getDirector` / `listDirectors` / `orchestrateShot(director, shot, index)` / `buildDirectorPrompt(director, shot)`。
  - `orchestrateShot` 依据 `shot.shotType` 与 `index` 在导演 moves 中**确定性轮选**具体运镜（多镜头有变化、非全部相同），时长 `clamp(3,8, round(5 + shotDurationBias))`，表演指导从 cues 轮换并拼入本镜台词 / 画面。
  - `buildDirectorPrompt` 生成该镜头导演指令片段（本镜运镜 / 节奏 / 表演指导 / 色调光影 / 配乐情绪建议）；无 shot 时退化为全局导演风格段。

**服务与路由**
- 新增 `src/services/directorService.js`：`listDirectors` / `getDirector`（未知抛 `Director not found`）/ `applyDirector(projectId, directorId)` / `disableDirector(projectId)`。
  - apply：校验导演与项目存在后，为每个 shot 写入 `cameraMovement / duration / directorGuidance`，置 `project.directorMode = { enabled:true, directorId, appliedAt }` 并持久化，返回 `{ director, project, guidance }`。
  - disable：仅置 `enabled=false`，**保留**导演选择与已生成指导（停止注入）。
- 新增 `src/routes/directors.js`，挂载 `/api/directors`：`GET /`、`GET /:id`、`POST /:id/apply`、`POST /disable`（静态路径 `/disable` 先于 `/:id` 注册）。

**真实注入视频生成 prompt（核心红线）**
- `src/services/videoService.js` 在 `generateShot()` 现有 `_enhanceWithStyling`（:53）**之后**、全局 visualStyle 锁定（:59）**之前**，新增 `_enhanceWithDirector`（:56 调用、方法 :368）。
- 仅当 `project.directorMode.enabled === true` 且 directorId 命中档案时，向**最终发给视频 provider 的 prompt** 拼入 `导演执导：<fragment>`；关闭导演模式、未知导演 id 时**原样返回、不污染 prompt**。
- videoService 只从纯模块 `directorProfiles.js` import，不 import directorService，无循环依赖。

**前端**
- 新增 `public/js/views/directors.js`（路由 `#/directors`）：导演卡片网格（可选中高亮、默认选中第一位）→ 展示导演阐述与 🎥运镜 / ⏱节奏 / 🎭表演 / 🎨色调光影 / 🎵配乐情绪 五个分维度区块；项目下拉（真实项目）+「✨ 启用该导演并编排分镜」（含「编排中…」禁用态）→ 渲染**逐镜指导表**（镜头# / 运镜 / 建议时长 / 表演与节奏指导）；「🛑 关闭导演模式」。
- 配乐情绪标题严格写成「🎵 配乐情绪（风格建议，需在配音轨自行添加 BGM）」。

### R30 剧场计划厂牌体系（对标 LibTV「剧场计划 / TV Show」，独立模型与服务）

**模型**
- 新增 `src/models/Studio.js`（参照 `src/models/Team.js`）：`id / name / description / logo / logoUrl / stylePositioning / curatorId / curatorName（主理人）/ members[]（签约创作者）/ shows[]（剧集，含 projectIds）/ projectIds[]（厂牌作品）`；`toJSON()` 派生 `memberCount / showCount / projectCount`；提供 getMember / getShow。

**服务与路由**
- 新增 `src/services/studioService.js`（持久化 key `studios`，参照 teamService `_load/_save`）：创建 / 查询 / 广场列表 / 更新、签约成员（重复抛 `创作者已签约`）/ 移除、创建剧集、作品归入厂牌（回写 `project.studioId`）、作品归入剧集（自动并入厂牌、双重判重）、厂牌详情聚合（成员 / 剧集 / 作品）。
- 新增 `src/routes/studios.js`，挂载 `/api/studios`：广场 / 创建（201）/ 详情 / 更新、成员签约与移除、剧集创建与列表 / 详情、作品归入厂牌 / 剧集、厂牌作品列表。
- `src/services/storageService.js` 启动加载时对 `studios` 键做规范化，保证重启正确加载。

**前端**
- 新增 `public/js/views/studios.js`（路由 `#/studios` 广场、`#/studio/:id` 详情）：
  - 广场：厂牌卡片网格（logo / 名称 / 风格定位 / 主理人 / 三项计数）+「+ 创建厂牌」**内联表单**（名称* / 简介 / logo / 风格定位 / 主理人，名称为空前端拦截）。
  - 详情：返回按钮、厂牌头、签约创作者列表 + 签约表单（可移除、带确认）、剧集 Shows（每剧含其作品）+ 新建剧集表单 + 下拉把厂牌作品选入剧集、厂牌全部作品网格 + 下拉把「我的作品」归入厂牌。
- `public/js/api.js` 新增导演 4 方法 + 厂牌 11 方法；`public/js/app.js` 注册三条路由；`public/index.html` 顶栏新增「🎬 导演」「🎭 剧场」；`public/css/style.css` 仅追加选中高亮与内联表单两个小规则。

**模型字段扩展（重启持久化）**
- Project（`src/models/project.js`）：新增 `directorMode`（默认 `{enabled:false, directorId:null, appliedAt:null}`）与 `studioId`（默认 null），进 toJSON。
- Shot（`src/models/shot.js`）：新增 `directorGuidance`（默认 ''），进 toJSON（cameraMovement 字段本就存在）。
- `projectService.hydrateProject` 透传以上新字段，`updateProject` 白名单含 directorMode / studioId；服务重启后导演编排、厂牌归属均不丢失（有专门测试）。

---

## 三、测试结果

| 指标 | Sprint 12 基线 | Sprint 13 交付 |
|---|---|---|
| 单元测试总数 | 332 | **365**（+33） |
| 通过 / 失败 | 332 / 0 | **365 / 0** |
| 测试命令 | `npm test`（node --test） | 同左 |

新增测试：
- `tests/directorMode.test.js`（**19 例**）：stub video provider 捕获**实际发给 provider 的 prompt**，断言 kubrick 含「对称 / 缓慢推镜 / 古典与电子极简」、wong 含「霓虹 / 抽帧慢门拖影」且二者逐字可区分；关闭 / 未知导演不注入且保留原描述；apply 后多镜运镜有变化、时长落在 3–8、guidance 含「表演:」；musicMood 以「配乐情绪建议（非自动生成配乐）」出现；重启 hydrate 后 directorMode / directorGuidance / cameraMovement 不丢；未知导演 / 项目的错误语义。
- `tests/studioSystem.test.js`（**14 例**）：创建返回真 id、广场列出、更新、签约 + 重复抛错、移除不存在成员抛错、建剧集 + 空 title 抛错、归入厂牌后 project.studioId 回写、归入剧集后同时出现在厂牌与剧集且重复归入去重、归入不存在 project 抛错、详情计数正确、未知厂牌 / 剧集 404、重启 studios 不丢。

上述断言均针对**具体文案与边界条件、有区分度，非空断言**；Sprint 1–12 用例全部仍通过，零回归。

**Lint**：本期新增文件 `npx eslint` **零错误**。全仓 `npx eslint src/ tests/` 实测 **42 个历史 error**（Sprint 12 上下文曾记 43，编排者与 PM 各自独立数得均为 42，差异为测量时点所致），全部位于未在本期新增的存量代码（如 baseVideoProvider、videoService 三处既有未用参、projectService、server.js 等）；未借本期顺手修复、也未引入新错误。

---

## 四、E2E 冒烟证据

编排者最终以 **PORT=3040、NODE_ENV=test** 独立复测（测后已 kill、端口确认关闭、临时文件清理）：

- `GET /health` → 200 `{"status":"ok"}`
- **R29**：`GET /api/directors` → total 5（noir/wong/kubrick/bay/ghibli）；建项目 + 3 镜头 → `POST kubrick/apply` → directorMode enabled，三镜分别编排为「绝对对称固定机位 / 几何对称横移 / 缓慢后拉」、均 6s、guidance 含表演与本镜台词；`GET` 回读字段落库；disable → enabled=false 且 directorId 保留；异常：空 body→400、未知导演→404、未知项目→404。
- **R30**：建广场 `GET` 命中演示厂牌；建厂牌→201、空名→400；签约→200、重复签约→400；建剧集→201、空 title→400；作品归入厂牌后 `project.studioId` 回写；归入剧集→200、二次归入去重（show.projectIds 仍为 1）；详情计数 memberCount=1 / showCount / projectCount 正确；未知厂牌 / 剧集 / 项目→404。
- **静态**：`/`、`/js/app.js`、`/js/api.js`、`/js/views/directors.js`、`/js/views/studios.js`、`/css/style.css` 均 200；SPA 深链 `/directors`、`/studios`、`/studio/:id` 均 200。
- 前端开发子代理另以真实 Chrome 浏览器（PORT=3022）走查：导演页 5 卡 + 分维度面板、apply 后逐镜指导表、disable 清表；厂牌广场与详情深链刷新、剧集归入作品即时出现；控制台无 error。

---

## 五、新增 / 修改文件清单

**新增（12）**
- `src/config/directorProfiles.js`
- `src/services/directorService.js`
- `src/routes/directors.js`
- `src/models/Studio.js`
- `src/services/studioService.js`
- `src/routes/studios.js`
- `tests/directorMode.test.js`
- `tests/studioSystem.test.js`
- `public/js/views/directors.js`
- `public/js/views/studios.js`
- `docs/sprint13-pm-review.md`
- `.workflow/context-sprint13.yaml`

**修改（11）**
- `src/services/videoService.js`（导演注入）
- `src/models/project.js`（directorMode / studioId）
- `src/models/shot.js`（directorGuidance）
- `src/services/projectService.js`（hydrate / update 白名单）
- `src/services/storageService.js`（studios 键规范化）
- `src/server.js`（两路由注册）
- `public/js/api.js`（导演 / 厂牌 API）
- `public/js/app.js`（三条路由）
- `public/index.html`（两个导航入口）
- `public/css/style.css`（选中 / 内联表单小规则）
- `README.md`（功能亮点、两个 API 小节、测试数、项目结构、路线图，含能力边界）

---

## 六、产品经理复核结论（摘要）

完整复核文档：`docs/sprint13-pm-review.md`。

- **唯一一轮总体结论：✅ 通过（PASS）**。PM 独立读源码、自跑 `npm test`（365/0）、自起 server（PORT=3030）从 HTTP 入口 curl 全链路复测，并自写 stub provider 捕获真实下发 prompt：
  - kubrick 启用后真实 prompt 含「导演执导…本镜运镜:缓慢推镜…配乐情绪建议（非自动生成配乐）」，wong 含「霓虹」不含「对称」，二者逐字不同；关闭 / 未知导演不注入；
  - R30 全链路（创建 / 签约 / 建剧集 / 归入 / studioId 回写 / 双重去重 / 详情计数 / 404）curl 实测通过；重启持久化不丢；
  - 边界干净（无 Sprint14 内容、CineAI 未动）。
- PM 提出 1 项 Major（README 未同步，已由编排者收口）与若干 Minor（测试卫生 / 演示数据，见下）。
- PM 首轮 PASS 后，仅改动测试文件钩子与数据清理（**未改任何生产业务逻辑**），故 PASS 结论持续有效，无需再开复核轮。

---

## 七、已知限制与后续路线

1. **导演模式是 prompt 编排增强，不生成配乐 / 视频**：musicMood 仅为 BGM 选曲情绪建议；后续可接 `audioService` / BGM 库按 mood 自动选曲混音（仓库已有 processBgm / mixAudioTracks 能力）。
2. **disable 后保留**导演选择与已生成的 cameraMovement / directorGuidance，仅停止注入；重新 apply（同 / 异导演）会重新编排全部镜头。
3. 剧集详情 `GET /api/studios/:id/shows/:showId` 返回剧集原始对象（含 projectIds、未内联 hydrate 作品）；作品 hydrate 在厂牌详情接口提供，前端按需取用。
4. **测试与开发共用同一存储文件**（NODE_ENV=test 未切换独立库）：全量 `npm test` 后部分**历史**测试文件仍会净增若干 project（本期两个新测试文件已修钩子、净增为 0；全仓历史泄漏约 +12，属既存问题）。后续宜让测试统一指向独立 STORAGE_PATH，并把 `public/js/` 纳入 eslint。
5. 仓库存量 42 个历史 lint error 未清理；`public/js` 尚未纳入静态检查。
6. **Sprint 14 建议**：画布五 tab 整合、图片生成 / 音频生成独立 tab、智能剪辑模块；并顺带收口测试存储隔离与前端 lint 覆盖。

---

## 八、结论

Sprint 13 两项需求（R29 / R30）端到端真实闭环：导演模式以 5 位差异鲜明的导演档案，为全部分镜真实编排运镜、时长节奏与表演指导，并把导演指令真实注入视频生成 prompt（关闭 / 未知导演不污染），配套导演阐述与逐镜指导、可随时开关；剧场计划厂牌体系提供独立厂牌模型，支持签约创作者、剧集聚合与作品归入（归属回写、自动去重），含厂牌广场与详情。365 个单元测试全部通过（较上期 +33、零回归），E2E 冒烟与真实浏览器验证证据充分，产品经理独立复核 **PASS**，流程状态 **GLOBAL_DONE**。
