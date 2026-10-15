# DreamReel Sprint 12 交付复核（PM 视角，只看不改）

- **复核人**：产品经理（独立复核，未采信子代理自报结论）
- **复核日期**：2026-10-04
- **复核对象**：R26 造型 prompt 自动注入视频生成 / R27 编辑器角色 tab 造型表单 / R28 创意片头模块
- **复核方式**：独立阅读源码 + 自跑 `npm test` + 启动 server（PORT=3014，NODE_ENV=test）从 HTTP 产品入口 curl 复测 + 抽帧肉眼核对 + ffprobe 流检查
- **纪律**：除本文档外未修改任何代码/配置；复测产物与进程结束后已清理（见末尾）。

---

## 一、复核范围与方法

| 需求 | 范围 | 复核入口 |
|---|---|---|
| R26 | 后端 `videoService` 生成单镜头时，按 `currentShot.characterIds` 收集关联角色 `buildStylingPrompt()` 片段拼入最终 prompt；修复重启后造型字段丢失 | 代码：`src/services/videoService.js`、`src/services/projectService.js`；测试：`tests/videoStylingPrompt.test.js` |
| R27 | 前端 `editor.js` 角色 tab 造型三字段表单 + 保存（PATCH `/api/characters/:id/styling`）+ 刷新回显 | 代码：`public/js/views/editor.js`、`public/js/api.js`；curl：POST 角色 → PATCH 造型 → GET 回读 |
| R28 | 后端 titleSequenceService（≥4 模板）+ 路由（GET 列表 / POST :id/generate）+ 前端 `titleSequences.js` 卡片网格/预览/插入镜头最前 + 导航入口 | 代码：`src/services/titleSequenceService.js`、`src/routes/titleSequences.js`、`public/js/views/titleSequences.js`、`public/js/app.js`、`public/index.html`；curl 全链路 + ffprobe + 抽帧 |

复测环境：`PORT=3014 NODE_ENV=test node src/server.js`，curl 实测命令见各节证据。

---

## 二、逐项结论

### R26 造型 prompt 自动注入视频生成 —— ✅ 闭环成立

**代码证据**
- 注入点：`src/services/videoService.js:52`，在角色动作注入（:48）之后、全局视觉风格（:55）之前调用 `_enhanceWithStyling(enhancedPrompt, currentShot, project)`。
- 注入逻辑：`videoService.js:328-355`——
  - 仅当 `shot.characterIds` 为非空数组时才收集（:329），**空镜/无关联角色不污染 prompt**；
  - 逐 id 在 `project.characters` 中找角色，找不到则跳过（:334-335）；
  - 双兼容：Character 实例走 `buildStylingPrompt()`（:337-338），普通 JSON 对象 fallback 拼装（:340-345）；
  - 角色三字段全空时 `fragment` 为空、不拼入（:347-353），返回原 prompt。
- 持久化修复：`src/services/projectService.js:43-46`，`hydrateProject` 重建 Character 时补传 `wardrobe/makeup/styling`，解决重启丢失（Sprint 11 报告「已知限制 #3」）。

**测试证据**（`tests/videoStylingPrompt.test.js`，独立复跑通过）
- stub provider 捕获**真正发给 provider 的 prompt**（:18-25），不是 mock 内部状态：
  - 有造型：prompt 同时含「角色造型」段落、服装「米色风衣」、妆容「素颜感」、风格「通勤干练」与原始描述（:42-70）；
  - 无造型：不含「角色造型」且保留原 prompt（:72-95）；
  - 裸 JSON 角色仍能拼（:97-123）；
  - `characterIds: []` 不注入（:125-143）；
  - 重启后造型字段不丢、还原后仍为 Character 实例可调用 `buildStylingPrompt`（:162-194）。
- 上述断言针对具体文案词与边界条件，**有区分度，不是空断言**。

**结论**：注入确实只作用于「该镜头关联角色」，无造型不污染；端到端闭环。

---

### R27 编辑器角色 tab 造型表单 —— ✅ 闭环成立

**代码证据**
- 表单：`public/js/views/editor.js:771-786`，角色卡片底部「🎨 角色造型」分区，三字段 `styling-wardrobe`（input）/`styling-makeup`（input）/`styling-styling`（textarea），`value` 直接绑定 `character.wardrobe/makeup/styling`（:775/:779/:783）——刷新后回显来自接口数据。
- 保存交互：`editor.js:710-733`——读取三字段 → 按钮置「保存中…」并 disabled → `api.updateCharacterStyling` PATCH → toast「造型已保存」→ `getProject` 拉最新并 `Object.assign(state.currentProject, updated)` → `renderCharactersTab` 重渲染；失败时 toast error 并恢复按钮。
- API 封装：`public/js/api.js:181-182` `PATCH /characters/:id/styling`。
- 后端接口：`src/routes/characters.js:97-118`，缺 projectId→400，角色不存在→404，成功返回 `stylingPrompt` 拼装结果。

**curl 复测（PORT=3014）**
1. `POST /api/projects` 建项目 → `POST /api/characters` 建角色，返回真 id；
2. `PATCH /api/characters/<id>/styling` body `{wardrobe:"月白汉服",makeup:"朱砂唇",styling:"古风仙侠"}` → 返回 `stylingPrompt:"造型风格:古风仙侠，服装:月白汉服，妆容:朱砂唇"`；
3. `GET /api/projects/<id>` 回读该角色：`wardrobe=月白汉服 | makeup=朱砂唇 | styling=古风仙侠`。

**结论**：表单、保存反馈、持久化、刷新回显均真实打通。

---

### R28 创意片头模块 —— ⚠️ 链路打通，但「片名上屏」与「配乐」为口径风险（见问题 #1、#2）

**已闭环部分（证据确凿）**
- 模板库：`src/services/titleSequenceService.js:14-79` 共 4 个模板 `classic-gold / glitch-cyber / ink-wash / neon-retro`，每个含 id/name/visualDescription/musicMood/ffmpeg 参数（duration 4/4/5/4 秒）。
- 路由：`src/routes/titleSequences.js:8` GET 列表；`:20` POST `:id/generate`；title 空白→400（:23-25）；模板不存在→404（:37-39）；`src/server.js:40,111` 注册，`:114` `/storage` 静态挂载。
- 前端：`public/js/views/titleSequences.js`——卡片网格（:137-166）、生成按钮「生成中…」态（:76-98）、`<video controls autoplay muted>` 预览（:86-90）、插入按钮把片头 `unshift` 到 `shots[0]` 并重排 index 后 `PUT /projects/:id`（:113-125）；`app.js:21,127-128` 注册 `#/title-sequences`；`index.html:69` 顶部导航「🎞️ 片头」。

**curl 复测（PORT=3014）**
- `GET /api/title-sequences` → `total=4`，4 模板 id/名称/musicMood/时长齐全；
- `POST /api/title-sequences/classic-gold/generate {projectId,title:"梦卷复核",subtitle:"Sprint12"}` → **201**，返回 `videoUrl:/storage/title-sequences/classic-gold_pm-review-probe_*.mp4`；
- 该 URL 经 HTTP 访问 **200，13892 字节**；
- `ffprobe` 该 mp4：**仅 1 条 h264 视频流，无音频流**；时长 4.083s；
- 抽帧 2s 处肉眼查看：**纯黑画面，无任何文字**（用户输入的片名「梦卷复核」并未出现在画面上）；
- 异常路径：title 空白→400；未知模板→404，均符合；
- 插入镜头：按前端逻辑 PUT shots 数组后 GET，确认 `index=0` 为片头镜头（带 videoUrl），原镜头顺延为 1、2，index 连续。

**代码层面的事实（复核重点核查项）**
- **片头并未烧录片名文字**：`titleSequenceService.js:152-175` `_renderTitleCard` 只用 `color` lavfi 两路底色 + `blend` 表达式（+可选 noise），**没有 drawtext / subtitles / 任何文字图层**；注释 :12 与 :150 明确「不依赖 drawtext」。`title/subtitle` 仅进入响应 JSON 与前端镜头描述（`titleSequences.js:117`），不进入画面。
- **配乐情绪只是标签**：`musicMood` 仅作为展示字符串返回与渲染（`titleSequences.js:144`「🎵 配乐情绪：…」），渲染参数里无任何音频输入，ffprobe 实测无音轨。

**结论**：模块从模板选择→生成→预览→插入项目镜头最前的产品链路真实可用，产出真实可播放 mp4；但「片名上屏」与「配乐」两点在当前产物中并不存在，属于必须如实表述的产品差距（详见问题 #1/#2）。

---

## 三、边界守护与一致性核查

| 核查项 | 结论 | 证据 |
|---|---|---|
| Sprint 11 后置：导演模式 | ✅ 未误做 | `grep -rn "导演模式\|directorMode\|director-mode" src/ public/` 无命中 |
| Sprint 11 后置：画布五 tab 整合 | ✅ 未误做 | 同上，无五 tab 相关新实现 |
| Sprint 11 后置：剧场/厂牌体系 | ✅ 未误做 | `grep` 「剧场厂牌/studio brand」无命中 |
| CineAI（/Users/link/myApp/CineAI） | ✅ 未被动过 | 该目录非 node_modules 文件无 2026-10-03 之后修改；目录 mtime 仍为 9-30 |
| 用户已有文件删除 | ✅ 未发现 | storage 下既有产物保留；本期仅新增 title-sequences 产物 |
| README/文档与代码一致 | ❌ 不一致 | 见问题 #3 |
| .workflow/context-sprint12.yaml | ⚠️ 滞后 | 仍 `GLOBAL_IN_DEV`、subagents `DISPATCHED`、`pm_review: PENDING`，与「已进入 PM 复核」不符（问题 #6） |

**测试与 lint 独立复核**
- 自跑 `npm test`：**tests 331 / pass 331 / fail 0**（duration ~18.2s），与自报一致。
- `npx eslint src/ tests/`：43 个错误，分布于 29 个文件。逐一核对：新增 Sprint 12 文件 `titleSequenceService.js`、`routes/titleSequences.js` **零错误**；`videoService.js` 的 3 个错误在 :289/:443/:508（均为 Sprint 11 前既有未用参），`projectService.js` 仅 :1 `PROJECT_STATUS` 未用（既有）。**「lint 仅有存量旧错误」的表述诚实**。注意：`eslint` 只覆盖 `src/ tests/`，前端 `public/js` 未纳入静态检查（问题 #7）。

---

## 四、问题清单

### 阻断（Blocker）
无。三个需求的端到端链路均真实打通，测试可信，边界干净。

### 重要（Major）

**#1 片头未把片名烧录进画面 —— 与模板描述/用户预期不符，必须如实口径**
- 位置：`src/services/titleSequenceService.js:152-175`（渲染仅 color+blend，无文字图层）；`tests/titleSequence.test.js:58-59` 只断言响应里回显 title，不断言画面文字。
- 事实：用户填写「片头标题」后生成的 mp4 实测为**纯动画底色**（抽帧 2s 纯黑，无「梦卷复核」四字）。但模板 visualDescription 写着「居中呈现烫金片名」（:18-19）、「书法片名配套朱砂印章」（:51），前端副标题也写「一键生成电影感开场动画」（`titleSequences.js:46`）——用户会合理以为片名会上屏。
- 修复方向（二选一）：
  1. **补真**：用 `drawtext` 或仓库已有的 `subtitles` 滤镜先例（`src/utils/ffmpeg.js:101 burnSubtitles`）把 title/subtitle 烧录进画面，并补一条「画面含片名文字」的区分性测试；或
  2. **改口径**：把所有 visualDescription / 前端文案改为「氛围背景动画（不含片名文字）」，明确「标题仅用于镜头记录」，避免误导。

**#2 片头无音轨，musicMood 只是文案标签**
- 位置：`titleSequenceService.js:158-171`（ffmpeg args 无音频输入）；实测 ffprobe 仅视频流。
- 事实：前端卡片展示「🎵 配乐情绪：低沉弦乐…」（`titleSequences.js:144`），但产出是静音 mp4，用户可能误以为自带配乐。
- 修复方向：UI 与文档标注「当前为无声片段，配乐情绪为风格建议」；后续可接 `audioService`/bgm 库按 mood 选曲混音（仓库已有 `processBgm`/`mixAudioTracks` 能力）。

**#3 README / API 文档未同步本期变更**
- 位置：`README.md`。
- 事实：
  - 角色 API 表（README.md:169-175）**缺 `PATCH /api/characters/:id/styling`**；
  - 全文无「创意片头 / title-sequences」端点章节（GET/POST 两个新接口未收录）；
  - 功能总览未提「角色造型室」与「创意片头」；顶部导航新增的「🎞️ 片头」入口（`index.html:69`）未在文档体现。
- 修复方向：在 README 角色表补 styling 一行、新增「创意片头」端点小节，并在功能总览补两句（同时如实注明 #1/#2 的当前能力边界）。

### 建议（Minor）

**#4 插入片头镜头 duration 硬编码 3s，与实际片长不一致**
- `public/js/views/titleSequences.js:118` 写死 `duration: 3`，但生成视频实际 4–5s（模板 4/4/5）。建议取 generate 响应里的 `result.duration` 写入，避免导出拼接时长错位。

**#5 片头产物无清理策略**
- `storage/title-sequences/` 已积累 6 个历史 mp4（含本次复测 1 个，已清理），重复生成会无限堆积。建议后续加 TTL 或按 projectId 去重。

**#6 工作流状态机未流转**
- `.workflow/context-sprint12.yaml` 仍 `GLOBAL_IN_DEV`、两子代理 `DISPATCHED`、`pm_review: PENDING`，与实际已进入 PM 复核不符。流程侧需由编排者更新。

**#7 前端代码未纳入 eslint**
- `npm run lint` 只扫 `src/ tests/`，新增的 `public/js/views/titleSequences.js`、editor.js 改动无静态检查。建议后续把 `public/js` 加入 lint 范围。

**#8 PUT /projects 接受裸 characters 时不补 id（既有行为，非本期引入）**
- 复测中观察到以裸对象 PUT characters 时不生成 id；R27 前端走 PATCH 真角色 id 不受影响，仅记录。

---

## 五、产品价值判断

- **R26/R27** 实质补齐了 Sprint 11 留下的「造型室只存字段、不进生成」缺口：造型描述现在真实进入发给视频模型的 prompt，且只作用于本镜角色，无造型不污染——这是对标 LibTV「角色造型室」的关键一步，闭环质量高。
- **R28** 搭好了片头模块的骨架（模板库/生成/预览/插入镜头最前），交互反馈完整（生成中态、预览、插入 toast、插入位置正确），但当前产物是「4–5 秒动画底色」，离 LibTV「创意片头」用户预期的「带片名+配乐的开场仪式感」还有两步（烧字、配乐）。本期宜如实定位为「片头氛围背景 MVP」。

---

## 六、总体结论

# 带条件通过（Conditional Pass）

**理由**：R26、R27 端到端闭环、证据可信、边界（导演模式/五 tab/剧场厂牌/CineAI）干净、331 测试独立复跑全过、lint 存量债务表述诚实；R28 的模块链路真实可用。但 R28 存在两处必须收口的口径问题——**片名未上屏、无音轨而文案暗示二者皆有**（问题 #1、#2），叠加 README 未同步（#3）。

**放行条件（完成其一组合即可转正式通过）**：
1. 要么补「片名烧录 + 按 mood 配乐」到可演示程度；
2. 要么把模板描述、前端文案、README 全部改为如实表述「无声氛围背景、标题仅记录」，并补一句用户可感知的提示；
3. 同步 README（问题 #3）。

上述均为低风险、可逆的收口项，不要求打回重做本期骨架。

---

## 七、复测清理说明

- 已停止 PORT=3014 测试进程；
- 已删除本次 curl 探测创建的项目（id `bcc6e11b-…`）与探测产物 `storage/title-sequences/classic-gold_pm-review-probe_*.mp4`；
- 临时文件 `/tmp/ts-frame.png`、`/tmp/gen-resp.json`、`/tmp/lint-out.txt`、`/tmp/dreamreel-3014.log` 已清理；
- 仓库代码与配置除本文档外零改动。

---

# 八、修复后闭环复核（2026-10-04 二轮）

子代理按「带条件通过」问题清单完成修复后，本次仍只看不改，独立复测（PORT=3016）。

## 8.1 三项重要问题逐项核实

### 问题 #1 片头片名上屏 —— ✅ 已真实收口

**修复方式**：`scripts/render_title_card.py`（Pillow 12.3.0，macOS Songti/STHeiti 字体）真实绘制 title/subtitle 到 1280×720 PNG → `src/utils/titleCard.js` 调起 → ffmpeg `-loop 1` 成片（`titleSequenceService.js:124-149`）。渲染失败时回退纯色背景并**如实标记 `titleRendered:false`**，不假装上屏。

**独立复测证据（PORT=3016，POST 4 个模板，title="梦卷复核"）**：
- 响应体均返回 `titleRendered:true, audioTrack:true, audio:"silent"`；
- 抽帧 2s 肉眼核对（/tmp/rk-*.png，已清理）：
  - `classic-gold`：近黑底居中金色宋体「梦卷复核」+ 浅金副标题「RECHECK」+ 暗角；
  - `glitch-cyber`：深青黑底满屏扫描线，标题带青/品红 RGB 错位；
  - `ink-wash`：宣纸暖灰底墨色晕染，墨黑宋体标题，右下角朱砂方印「印」；
  - `neon-retro`：深紫渐变 + 粉色发光标题 + 底部青色网格线。
  四模板视觉差异明显，与各自 visualDescription 一致。
- 独立像素扫描（Python，#d9b45a 容差 45，2s 帧）：**金色像素 6955 个**（远高于测试阈值 200）；金色像素包围盒 x[494,788] 中心 x=641 ≈ 画幅中心 640，**片名确实居中上屏**。
- 新增测试 `tests/titleSequence.test.js:123-134` 即为此像素断言，有区分度。

### 问题 #2 音轨与配乐口径 —— ✅ 已真实收口

- 修复方式：`_muxCardToVideo`（titleSequenceService.js:172-191）以 `anullsrc` 立体声 AAC 128k 与视频混流，含 0.6s 淡入淡出；回退路径同样带静音音轨。
- 独立 ffprobe 实测 4 个模板：**均为 `h264,video + aac,audio` 双流**；时长 4.08/4.08/5.08/4.08s，与模板定义一致。
- 前端文案 `public/js/views/titleSequences.js:145` 已改为「🎵 推荐配乐情绪：…（片头为静音，可在配音轨按此情绪添加 BGM）」，不再暗示自带配乐；响应体 `musicMood` 字段标注「BGM 选曲建议」。

### 问题 #3 README 同步 —— ✅ 已收口且口径诚实

- README:177 补 `PATCH /api/characters/:id/styling`；
- README:179-184 新增「创意片头」API 小节，写明返回 `titleRendered/audioTrack/audio`，并明确「musicMood 是 BGM 选曲情绪建议而非自带配乐」；
- README:32 功能亮点描述 4 模板 + Pillow 渲染上屏 + 静音音轨；
- README:293/298 项目结构补 `titleCard.js` 与 `render_title_card.py`。
- 与代码实际行为一致，未夸大。

## 8.2 顺带确认项

| 项 | 结果 | 证据 |
|---|---|---|
| 插入片头 duration 取返回值 | ✅ | `titleSequences.js:85` 存 `result.duration`，`:119` 插入镜头 `duration: Number(card.dataset.duration)\|\|4`；classic-gold 实际插入 duration=4 |
| npm test 复跑 | ✅ | **332 passed / 0 failed**（331 基线 +1 像素断言），R26/R27 用例无回归 |
| 400/404 语义 | ✅ | 空 title→400，未知模板→404 |
| Sprint 11 后置项（导演模式/画布五 tab/剧场厂牌） | ✅ 未误动 | grep 无新增实现 |
| CineAI | ✅ 未被动 | 19:00 后无任何源码文件变更 |
| R26/R27 代码 | ✅ 无改动迹象 | 上一轮已闭环，本轮回归测试覆盖 |

## 8.3 遗留小问题（不阻断）

- 片头产物仍无 TTL 清理（建议项 #5 保留）；storage 内现积累若干测试 mp4，后续可加生命周期。
- 新渲染管线依赖本机 `python3 + Pillow + macOS 字体`，README/Docker 未声明该依赖；容器化部署时 Pillow 需预装（建议项，不影响本机通过）。
- workflow context 状态仍未由编排者流转（建议项 #6 保留）。

## 8.4 最终总体结论

# ✅ 通过（PASS）

首轮提出的 3 项重要问题（片名上屏、音轨/配乐口径、README 同步）均已真实收口，且证据可独立复现（像素扫描 6955、ffprobe 双流、四模板抽帧肉眼可区分、文案如实）；332 测试独立复跑全过，边界与 CineAI 干净，无回归。遗留项均为低风险建议，不构成阻断。Sprint 12 可视为 GLOBAL_DONE。

（本轮复测产生的 pm-recheck 产物与临时帧已清理，server 已停止；子代理自测留下的产物未动。）
