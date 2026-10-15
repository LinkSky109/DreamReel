# DreamReel Sprint 13 交付复核（PM 视角，只看不改）

- **复核人**：产品经理（独立复核，未采信子代理自报结论）
- **复核日期**：2026-10-04
- **复核对象**：R29 导演模式 / R30 剧场计划厂牌体系
- **复核方式**：独立阅读源码 + 自跑 `npm test` + 自跑 `npx eslint` + 自起 server（**PORT=3030、NODE_ENV=test**）从 HTTP 产品入口 curl 复测 + 自写 stub provider 捕获真实下发 prompt
- **纪律**：除本文档外未修改任何代码/配置；本轮 curl 创建的厂牌/项目、server 进程、临时文件结束后已清理（见末尾）。

---

## 一、复核环境与方法

| 项 | 值 |
|---|---|
| 项目根 | `/Users/link/myApp/DreamReel` |
| 启动命令 | `PORT=3030 NODE_ENV=test node src/server.js`（env 日志确认 `Environment: test`） |
| 健康检查 | `GET http://localhost:3030/health` → 200 `{"status":"ok"}` |
| 持久化库 | `storage/data/db.json`（NODE_ENV=test 未切换独立库，与开发库同文件；已先快照、复测后清理） |
| 证据原则 | 所有关键结论以本人亲自跑出的 curl/命令输出为准；stub provider 捕获「真正发给 provider 的 prompt」而非读服务内部状态 |

---

## 二、R29 导演模式 —— ✅ 端到端成立

### 2.1 代码结构（独立读源码）

- **档案库** `src/config/directorProfiles.js:20-156`：5 位导演 `noir/wong/kubrick/bay/ghibli`，字段齐全（tagline/era/statement/camera.style+moves/pacing.tempo+shotDurationBias+description/performance.style+cues/colorLighting.palette+lighting+description/musicMood）。
  - 纯函数：`getDirector`(:161)、`listDirectors`(:169)、`orchestrateShot`(:198)、`buildDirectorPrompt`(:234)。
  - `orchestrateShot`：运镜按 `index+shotTypeOffset` 确定性轮取（:206），时长 `clamp(3,8, round(5+bias))`（:210），表演指导从 cues 轮换并拼接本镜台词/画面（:216-222）。
  - `buildDirectorPrompt`：无 shot 退化为全局风格段（:242）；有 shot 拼本镜运镜/节奏/表演指导；musicMood 硬编码为 `配乐情绪建议(BGM选曲参考，非自动生成配乐)`（:256）——口径诚实。
- **服务** `src/services/directorService.js`：`listDirectors`(:22)/`getDirector`(:30，未知抛错)/`applyDirector`(:45)/`disableDirector`(:88)。apply 遍历 shots 调 `orchestrateShot` 回写 `cameraMovement/duration/directorGuidance` 并置 `project.directorMode={enabled:true,directorId,appliedAt}`；disable 仅置 `enabled:false`，保留 directorId 与已生成指导。
- **注入点** `src/services/videoService.js:56`：`_enhanceWithDirector` 在 `_enhanceWithStyling`(:53) **之后**、全局 visualStyle 锁定(:59-61) **之前**调用；注入逻辑 :368-382——`directorMode.enabled!==true` 或无 directorId 或 `getDirector` 取不到档案时**原样返回**（:370-376），不污染 prompt；否则拼 `${prompt}. 导演执导：<fragment>.`。
- **路由** `src/routes/directors.js` 挂载于 `/api/directors`（server.js:114）：`GET /`(:9)、`POST /disable`(:21，**静态路径在 `/:id` 之前**)、`GET /:id`(:39)、`POST /:id/apply`(:50)。
- **模型扩展**：`project.js:41` `directorMode`、:43 `studioId`；`shot.js:60` `directorGuidance` 且 :96 进 toJSON；`projectService.js:30-31` hydrateProject 透传 directorMode/studioId，:94 透传 shot.directorGuidance，:220-221 updateProject 白名单含二者。

### 2.2 红线 #1：导演指令是否真进「发给 provider 的最终 prompt」——✅ 独立复现

本人自写 stub provider（替换 `videoService.provider.generateVideo` 捕获 `params.prompt`，脚本用后即删），实测 kubrick 启用后**真实下发 prompt 全文**：

```
一个人走在雨夜街头. 导演执导：冷峻对称导演风格（作者电影·冷峻对称）：冷峻对称·库布里克式；
整体摄影:单点透视绝对对称构图；本镜运镜:缓慢推镜；本镜节奏:冷峻克制，机械般精准的节奏；
表演指导:表演:面无表情直视镜头；色调:冷色调；光影:均匀冷光，无死角；
配乐情绪建议(BGM选曲参考，非自动生成配乐):古典与电子极简配乐.
```

断言（本人跑）：
- kubrick：含「导演执导」「对称」「古典与电子极简」「非自动生成配乐」，且保留原始描述「一个人走在雨夜街头」；
- wong：含「霓虹」且**不含**「对称」，与 kubrick prompt **逐字不同**（不同导演可区分）；
- `directorMode.enabled=false`：prompt **不含**「导演执导」，保留原描述；
- `directorId='not-a-real-director'`：prompt **不含**「导演执导」，保留原描述。

### 2.3 curl 复测（PORT=3030）

| 用例 | 结果 | 证据 |
|---|---|---|
| `GET /api/directors` | 200，total=5，ids=`noir,wong,kubrick,bay,ghibli` | curl |
| `GET /api/directors/noir` | 200，name=暗夜低语，musicMood=萨克斯低回的冷爵士，4 moves | curl |
| `GET /api/directors/nope` | **404** `Director not found: nope` | curl |
| POST 建项目 + PUT 3 shots + `POST /api/directors/kubrick/apply` | 200，guidanceLen=3；shot#0 运镜=绝对对称固定机位、dur=6、指导含「表演:面无表情直视镜头…本镜台词『你来了』」 | curl |
| apply 后 `GET /api/projects/:id` | directorMode={enabled:true,directorId:kubrick}，shot.cameraMovement/directorGuidance 已落库 | curl |
| `POST /api/directors/disable` | 200，enabled=false 但 directorId 保留为 kubrick | curl |
| `POST /api/directors/ghost/apply` | **404** `Director not found: ghost` | curl |
| `POST /api/directors/kubrick/apply {projectId:'no-such-project'}` | **404** `Project not found` | curl |
| `POST /api/directors/kubrick/apply {}`（空 body） | **400** `projectId 不能为空` | curl |
| `POST /api/directors/disable {}` | **400** `projectId 不能为空` | curl |
| `POST /api/directors/disable {projectId:'nope'}` | **404** | curl |

运镜编排确定性已核对：kubrick moves=[缓慢推镜,绝对对称固定机位,缓慢后拉,几何对称横移]，close-up offset=1 → 镜头0 命中「绝对对称固定机位」；wide offset=2 → 镜头1 命中「几何对称横移」；medium offset=0 → 镜头2 命中「缓慢后拉」；时长 5+bias(1)=6，全部落在 3-8。

### 2.4 口径诚实（Sprint12 曾因此打回，重点核查）——✅ 诚实

- prompt 注入文案硬编码 `配乐情绪建议(BGM选曲参考，非自动生成配乐)`（directorProfiles.js:256）；
- 前端 `public/js/views/directors.js:137` 卡片标题写「🎵 配乐情绪（风格建议，需在配音轨自行添加 BGM）」，**未**暗示自动配乐/自动出片；
- 全站 grep `自动配乐|自动生成配乐|自动出片|一键.*成片` 在 directors/studios 视图**零命中**。

---

## 三、R30 剧场计划厂牌体系 —— ✅ 端到端成立

### 3.1 代码结构

- **模型** `src/models/Studio.js`：字段 name/description/logo/logoUrl/stylePositioning/curatorId/curatorName/members[]/shows[]/projectIds[]，toJSON 派生 memberCount/showCount/projectCount（:59-61）。
- **服务** `src/services/studioService.js`：`_load/_save` 走 storage key `studios`(:6)；`createStudio`(:31，空名抛错)、`getStudio`(:53)、`listStudios`(:62)、`updateStudio`(:70，白名单字段)、`signMember`(:86，重复签约抛错)、`removeMember`(:106)、`createShow`(:120)、`getShow`(:144)、`addProject`(:154，回写 project.studioId)、`addProjectToShow`(:172，同时确保入厂牌+剧集，**双重 includes 判重** :160/:185)、`getStudioDetail`(:210，聚合作品与剧集作品)。
- **路由** `src/routes/studios.js` 挂载 `/api/studios`（server.js:115）：GET /、POST /(201)、GET /:id、PUT /:id、POST/DELETE members、POST/GET shows、GET shows/:showId、POST /:id/projects/:projectId、GET /:id/projects、POST /:id/shows/:showId/projects/:projectId。
- **存储** `storageService.js:49` `this.data.studios = this._normalizeKeyed(...)` 启动时处理 studios 键。

### 3.2 curl 全链路复测（PORT=3030）

| 用例 | 结果 | 证据 |
|---|---|---|
| `POST /api/studios {name,description,logo,stylePositioning,curatorName}` | **201**，返回真 uuid | curl |
| `POST /api/studios {name:'  '}` | **400** `厂牌名称不能为空` | curl |
| `POST /:id/members {userId,name,role}` | 200，memberCount=1 | curl |
| 重复签约同 userId | **400** `创作者已签约` | curl |
| `POST /:id/shows {title,synopsis,coverIcon}` | **201**，返回 show_<ts>_<rand> | curl |
| `POST /:id/shows {title:'  '}` | **400** `剧集标题不能为空` | curl |
| `POST /:id/projects/:pid`（PID1 归入厂牌） | 200；`GET /projects/PID1` 回读 **studioId=本厂牌** | curl |
| `POST /:id/shows/:sid/projects/:pid`（PIDB 归入剧集） | 200；PIDB.studioId 同样回写；PIDB 同时出现在厂牌 projectIds | curl |
| 再次 `POST /:id/shows/:sid/projects/:pid` 同 pid | 200，但 `show.projectIds` 内该 pid 仍为 **1 份（去重生效）** | curl |
| `GET /:id` 详情聚合 | memberCount=1、showCount=1、projectCount=2；works 含 PID1+PIDB；show[0].works 仅含 PIDB | curl |
| `GET /studios/no-such` | **404** | curl |
| `POST /studios/nosuch/projects/pid` | **404** | curl |
| `POST /studios/:id/projects/nosuch` | **404** `Project not found` | curl |
| `POST /studios/:id/shows/nosuch/projects/pid` | **404** | curl |

无骨架/mock：所有聚合均来自真实 storage 落盘数据，project.studioId 回写经 `GET /projects` 独立回读确认。

---

## 四、重启持久化 —— ✅

复测手法：apply kubrick + 归入厂牌后 kill 3030 进程 → 重新 `PORT=3030 NODE_ENV=test node src/server.js` → 重新 curl。

- 项目 `directorMode={enabled:true,directorId:kubrick,appliedAt:...}` 保留；
- `shot.cameraMovement=绝对对称固定机位`、`shot.directorGuidance` 非空保留；
- 两个项目 `studioId` 均保留为本厂牌；
- 厂牌 detail：memberCount=1（pm_u1/PM创作者/director）、showCount=1（PM复核剧集）、projectCount=2、show.works=[PM复核作品B]。

结论：hydrateProject 对 directorMode/studioId/directorGuidance 透传正确，storageService 对 studios 键正常 load/save。

---

## 五、测试与 lint 独立结果

### 5.1 `npm test`（本人跑）

- 命令：`NODE_ENV=test node --test tests/*.test.js`
- 结果：**tests 365 / pass 365 / fail 0 / skipped 0**，duration ~18.5s。
- 与开发自报 365 一致；较 Sprint12 终态 332 净增 33（directorMode.test.js + studioSystem.test.js）。
- 区分度核查：
  - `tests/directorMode.test.js`：stub provider 捕获真实 prompt（:88-95），断言具体文案「对称」「古典与电子极简」「非自动生成配乐」、关闭/未知导演不注入、kubrick vs wong 逐字不同、重启 hydrate 不丢——**非空断言**。
  - `tests/studioSystem.test.js`：覆盖创建/空名校验/重复签约/去重（:130-132 断言二次添加后 show.projectIds 仍为 1）/project.studioId 回写/重启 studios 不丢——边界齐全。
- 回归：Sprint12 的 videoStylingPrompt/titleSequence 等用例仍在 365 内全过。

### 5.2 `npx eslint src/ tests/`（本人跑）

- 结果：**42 problems（42 errors, 0 warnings）**，分布 30 个文件。
- 独立核对：本期新增文件 `directorProfiles.js / directorService.js / directors.js / Studio.js / studioService.js / studios.js / directorMode.test.js / studioSystem.test.js` **全部 0 error**。
- 被改动的既有文件无新增错误：
  - `videoService.js` 3 个错误（:293 `referenceImages`、:470 `videoUrl`、:535 `workerId` 未用参）——均为 Sprint12 前既有未用参，本期新增的 :56/:368-382 不在错误行；
  - `projectService.js` 1 个（:1 `PROJECT_STATUS` 未用导入，既有）；
  - `server.js` 1 个（:133 `next` 未用参，性能监控中间件，既有）。
- 开发自报 42、Sprint12 上下文曾写 43；本人独立数得 **42**，且全部位于未在本期新增的存量代码，未见借本期顺手修、也未见新增。前端 `public/js/` 仍未纳入 lint（既有限制）。

---

## 六、边界守护与一致性核查

| 核查项 | 结论 | 证据 |
|---|---|---|
| Sprint14 内容（画布五 tab 整合 / 图片·音频独立 tab / 智能剪辑） | ✅ 未误做 | `grep -rnE "画布五tab\|独立图片tab\|独立音频tab\|智能剪辑\|smart.?edit" src/ public/js/` 零命中 |
| CineAI（/Users/link/myApp/CineAI） | ✅ 未被动 | 目录 mtime 仍 9-30；`find -newermt 2026-10-03` 零文件 |
| 用户既有文件删除 | ✅ 未发现 | storage 产物保留；本轮仅新增并随后删除本人 curl 数据 |
| 静态路径 `/disable` 先于 `/:id` | ✅ | directors.js:21 在 :39 之前；curl POST /disable 返回业务 400 而非 404 |
| 已知测试厂牌「雨夜影像厂」 | ✅ 存在（id 349eebd1…，1 成员/1 剧集/1 作品） | curl GET /api/studios 命中 |
| 前端深链可渲染 | ✅ curl 级 | `/directors` `/studios` `/studio/:id` 均 200（SPA fallback）；`/js/views/directors.js` `/js/views/studios.js` 200；4 个前端 JS `node --check` 语法 OK；所调用 API 均已 curl 实测 |

> 注：本机无 headless 浏览器（playwright/puppeteer 均未安装），控制台「无 error」以 curl 可达 + JS 语法检查 + API 实测代替，未做真实浏览器控制台录制。

---

## 七、问题清单

### 阻断（Blocker）
无。R29/R30 端到端链路均真实打通，prompt 注入真实可区分，口径诚实，测试全过，边界干净。

### 重要（Major）

**#1 README 未同步本期两个新模块的端点与导航**
- 位置：`README.md`。
- 事实：全文 grep `director|studio|导演|厂牌|剧场` 仅命中 :26 与 :136 的「风格迁移工坊/导演风格预设」（属 R08 visualStyle，非 R29）；**无** `/api/directors`、`/api/studios` 端点章节，顶部导航新增的「🎬 导演」「🎭 剧场」入口（index.html:70-71）未在功能总览体现。
- 修复方向：补两个端点小节（含 apply/disable、studio 成员/剧集/归入作品的语义与 201/400/404），并在功能总览加两句；同时如实注明「导演模式为 prompt 编排增强，musicMood 为 BGM 选曲建议、不自动生成配乐」。

### 建议（Minor）

**#2 测试用例泄漏厂牌数据**
- `tests/studioSystem.test.js` 的 `after` 钩子只 `deleteProject`，未删 studios，导致 db.json 积累 5 条同名「暗夜制片厂」（本轮复测前已存在）。建议 after 钩子补 `delete d.studios[studioId]` 并 flush，或用独立测试库。

**#3 npm test 后 projects 净增 ~12 条**
- 本人快照：跑 npm test 前 237 个 project，跑完 249。directorMode/studioSystem 测试 after 钩子未完全清理。建议补清理或隔离测试存储路径（`STORAGE_PATH` 已有环境变量支持，测试可指向独立 db）。

**#4 「雨夜影像厂」演示数据处置**
- 现状：description 仍为「测试厂牌」，是前端联调遗留。作为演示数据保留**可接受**，但建议要么改写成正经 demo（名称保留、描述改为真实定位），要么在发布脚本里显式 seed，避免「测试厂牌」字样出现在交付物中。本轮按要求**未删除**。

**#5 PUT /projects 用裸 shots 不落 shot.id（既有行为，非本期引入）**
- 复测中观察到以裸对象 PUT shots 时不生成 id，会影响 `generateShot` 内按 shotId 查找 currentShot；R29 走 apply 不依赖 shot.id，前端建镜头走正常路径，仅记录。

**#6 前端代码未纳入 eslint**
- `npm run lint` 仍只扫 `src/ tests/`，新增 directors.js/studios.js 无静态检查（既有限制，沿 Sprint12 #7）。

---

## 八、产品价值判断

- **R29** 是对标 LibTV「导演执导」的正确实现：本质是 prompt 编排增强，5 位导演档案有差异度，`buildDirectorPrompt` 把运镜/节奏/表演/色调光影/配乐情绪真实拼进下发 prompt，关闭/未知导演不污染，且 musicMood 全程标注为「BGM 选曲建议、非自动生成配乐」——没有重蹈 Sprint12「能力不存在却暗示存在」的覆辙。
- **R30** 把厂牌（签约成员/剧集/作品聚合）从骨架做到了真实可用：创建→签约→建剧集→作品归入→project.studioId 回写→剧集与厂牌作品聚合去重，全链路 HTTP 可测，400/404/201 语义正确，重启不丢。
- 两个需求都没有「假能力」，交互反馈完整（toast、逐镜指导表、详情聚合）。

---

## 九、总体结论

# ✅ 通过（PASS）

**理由**：R29 导演指令经本人 stub provider 实证进入下发 prompt 且不同导演可区分、关闭/未知导演不污染；musicMood 口径诚实；R30 厂牌全链路 curl 实测真实打通、去重与回写正确、重启持久化；365 测试本人复跑全过；42 lint 错误全部为存量、新文件零错误；Sprint14 边界与 CineAI 干净。

唯一遗留为 **#1 README 未同步端点**（Major，低风险文档收口），以及 #2-#6 测试卫生/演示数据类 Minor。均不构成打回重做骨架的理由；建议在交付前补 README 端点小节（#1），其余 Minor 排入后续。

---

## 十、复测清理说明

- 已 kill PORT=3030 测试进程，`lsof -ti:3030` 确认端口关闭；
- 已从 `storage/data/db.json` 删除本轮 curl 创建的厂牌 `74a6e717…`（PM复核厂牌）与两个项目 `b3f0c133…`（PM复核导演模式）、`e87a4bc7…`（PM复核作品B）；
- 「雨夜影像厂」等既有数据按要求未动；
- 临时脚本 `pm-probe-director.mjs` 用完即删；`/tmp/*`（curl 响应、eslint 输出、server 日志）已清理；
- 仓库源码与配置除本文档外零改动。
