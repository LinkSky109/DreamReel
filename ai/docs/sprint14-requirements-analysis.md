# DreamReel Sprint 14 需求分析（五合一画布 / 图片生成 / 音频生成 / 智能剪辑）

- 版本：v1.0
- 日期：2026-10-05
- 分析人：AI Agent（产品 / 架构视角）
- 输入依据：`docs/sprint11-gap-analysis.md` 第五节、`docs/sprint13-delivery-report.md` 第七节、当前 `/Users/link/work/DreamReel` 代码基线
- 关联上下文：`.workflow/context-sprint14.yaml`
- 实施规划：`docs/sprint14-workflow-plan.md`

---

## 一、背景与结论先行

### 1.1 为什么是现在

Sprint 11 对标 LibTV 时列出了四项主要差距：国产视频模型矩阵、剧本改编、角色造型室、画布五合一。前三项已在 Sprint 11–13 闭环，剩余缺口集中在信息架构与生成能力两侧：

| LibTV 能力 | DreamReel 现状 | 差距性质 |
|---|---|---|
| 视频 / 图片 / 音频 / 剧本 / 剪辑 五合一画布 | 编辑器为 8 个同级 tab：剧本 / 角色 / 镜头 / 配音 / 分析 / 协作 / 版本 / 设置 | 信息架构差距，非能力缺失 |
| 图片生成 | 无独立图片生成，仅有海报渲染与参考图字段 | 真实能力缺口 |
| 音频生成 | 有 TTS 播放入口与 BGM/SFX 元数据库，但素材目录为空；Mock TTS 只返回远程占位 URL | 真实能力缺口 + 口径风险 |
| 智能剪辑 | 有 ffmpeg 拼接、三轨混音、字幕烧录，但没有剪辑决策层 | 能力缺口，可由规则引擎补齐 |

### 1.2 本期核心判断

1. **画布五 tab 只做信息架构与导航收口，不推翻现有编辑器深度**。现有 8 个 tab 的页面逻辑保留，重新映射为 5 个一级入口 + “更多工具”二级入口；不改业务语义，先降低回归面。
2. **图片生成必须落成真实文件产物**。Mock provider 用 Pillow 产出可打开的 PNG；真实后端接 OpenAI Images 兼容接口；生成结果可回填到分镜 / 角色 / 场景参考图，真正进入既有视频生成链路。
3. **音频生成必须区分“真实语音”和“占位音”**。ElevenLabs 配置存在时产真实语音；Mock 模式只能产可试听的占位音，UI 与接口必须明示，不能暗示“AI 已配音”。BGM/SFX 首期采用 ffmpeg 程序化生成最小可用素材包，明确标注“程序化音频，非 AI 作曲”。
4. **智能剪辑首期是规则引擎，不是 AI 视频理解**。基于导演模式、镜头时长、BGM BPM 与转场偏好的 EDL 生成器，输出可预览、可回滚、可真实渲染的剪辑方案；不做内容识别、不做自动挑高光、不做 ML 打分。
5. **建议拆成两波交付**。Wave 1 做画布 IA + 图片生成 + 工程收口；Wave 2 做音频生成 + 智能剪辑。原因是三个功能都会改 `public/js/views/editor.js`（当前 3361 行），并行开发会产生高风险合并冲突；同时音频真实化与剪辑渲染都需要新增 ffmpeg 能力验证，混在外层 IA 重构里会把验证面拉得过大。

---

## 二、现状基线（2026-10-05 实测）

### 2.1 代码与仓库

| 项 | 值 |
|---|---|
| 项目根 | `/Users/link/work/DreamReel` |
| Git 仓库 | 是，`main` 分支，远端 `origin/main` |
| 最近提交 | `d28a368 feat: Phase 1 — 各阶段模型可自定义` |
| 工作区状态 | 有 10 个既存未提交修改（Dockerfile / README / arch_report / title card / provider / server / videoService / 2 tests），非本次任务产物，不得回退 |
| 编辑器规模 | `public/js/views/editor.js` 3361 行；`style.css` 5359 行 |
| 测试基线 | `npm test`：439 pass / 0 fail，197 个顶层测试，53 个 suite |
| Lint 基线 | `npx eslint src/ tests/`：47 errors / 0 warnings，全部为存量 |
| 前端 Lint | `public/js/**` 尚未纳入 eslint |
| Provider 现状 | video：mock/runway/pika/seedance/minimax/wan；LLM：mock/openai；TTS：mock/elevenlabs；**无 image provider** |
| 音频素材现状 | `storage/audio/bgm`、`storage/audio/sfx` 存在但文件数为 0；库中元数据可用，实际可播放素材缺失 |
| Mock TTS 现状 | 返回 `https://mock-tts.example.com/...` 远程占位 URL，无本地文件；导出时会被过滤并回退静音 |

### 2.2 可复用能力

| 能力 | 现有实现 | 本期用法 |
|---|---|---|
| 视频生成并发队列 | `videoService` + worker 池，默认 3 并发 | 图片生成参考同一套并发/落盘约定 |
| 参考图注入 | `shot.referenceImages` / 角色参考图 / 场景参考图，`videoService.collectReferenceImages` 最多取 3 张 | 图片生成资产回填后直接进入视频生成 prompt |
| 内容审核 | `contentModerationService.moderate` | 图片 / 音频生成 prompt 共用 |
| 额度系统 | `quotaService` 视频额度、订阅计划 | 新增图片额度；音频复用配音额度 |
| ffmpeg 工具层 | concat / amix / afade / burnSubtitles / 静音生成 | 程序化音频、剪辑渲染、最终混音 |
| 导演模式 | `directorMode` + `directorProfiles`，已写回镜头运镜 / 时长 / 指导 | 智能剪辑的节奏与转场偏好来源 |
| 故事板时间轴 | 镜头排序、时长、缩略图、拖拽 | 智能剪辑的镜头输入源 |
| 版本历史 | `versionService` 快照 / 回滚 | 智能剪辑方案与图片资产变更可跟踪 |

---

## 三、需求范围

### 3.1 完整需求清单

| 编号 | 需求 | 优先级 | 交付波次 | 真实能力边界 |
|---|---|---|---|---|
| R31 | 五合一创作画布整合 | P0 | Wave 1 | 信息架构与导航重构，不改底层业务语义 |
| R32 | 图片生成独立 Tab | P0 | Wave 1 | Mock 产真实 PNG；真实模型走 OpenAI Images 兼容；生成图可作参考图 |
| R35 | 工程健康收口（测试存储隔离 + 前端 lint） | P0 | Wave 1 | 测试不再污染开发库；`public/js` 纳入静态检查 |
| R33 | 音频生成独立 Tab | P1 | Wave 2 | TTS 真实/占位双口径；程序化 BGM/SFX；不做 AI 作曲；不做声音克隆 |
| R34 | 智能剪辑模块 | P1 | Wave 2 | 规则驱动 EDL + 真实渲染；不做 ML 内容理解与自动高光识别 |

### 3.2 明确不做（Non-Goals）

- 不做画布式无限自由拖拽节点编辑器；五 tab 是导航整合，不是节点图谱。
- 不做文生图模型训练 / LoRA / 风格微调。
- 不做 AI 音乐生成、声音克隆、音色定制训练。
- 不做视频内容理解、场景识别、自动高光检测。
- 不引入前端框架（保持原生 JS + HTML + CSS）。
- 不新增运行时 npm 依赖；图片 Mock 复用现有 Python/Pillow 能力。
- 不修复全部 47 个存量 lint error；只保证本期新增/修改文件零新增 error。
- 不修改 `/Users/link/myApp/CineAI`。

---

## 四、R31 五合一创作画布

### 4.1 问题与机会

当前编辑器有 8 个同级 tab，新用户进入项目后面对密集导航，难以建立“先写剧本、再生成素材、最后剪辑成片”的心智模型。同时，新增图片与音频生成后如果继续同级堆 tab，会变成 10 个以上入口，信息架构会失控。

### 4.2 目标信息架构

一级入口固定为 5 个：

| 一级 Tab | 承载内容 | 映射来源 |
|---|---|---|
| 剧本 | 一句话生成、分镜脚本、台词 / 旁白 | `script` |
| 图片 | 图片生成与素材库（R32） | 新增 |
| 视频 | 分镜卡片、故事板时间轴、批量生成 | `shots` |
| 音频 | 配音、BGM、音效、混音（R33） | `dubbing` + 音频 |
| 剪辑 | 智能剪辑方案与渲染（R34） | 新增 |

二级入口收纳在“更多工具”中：角色、场景、镜头分析、协作、版本、项目设置。角色与场景虽与创作强相关，但属于配置型工作，不占一级生成入口。

### 4.3 用户故事

- 作为新用户，我希望进入项目后看到清晰的五步创作路径，以便知道下一步做什么。
- 作为老用户，我希望原来的角色 / 协作 / 版本入口仍然可达，以便不破坏既有习惯。
- 作为需要分享进度的用户，我希望刷新页面后仍停留在当前 tab（例如音频），以便减少重复点击。
- 作为键盘用户，我希望 `?` 帮助与快捷键仍能切换到对应 tab。

### 4.4 功能范围

**包含**

- 5 个一级 tab + “更多工具”抽屉 / 分组。
- Tab 与 URL 同步：`#/project/:id?tab=images` 形式可深链；刷新后恢复上次 tab。
- 旧 tab 标识兼容映射：`shots -> video`、`dubbing -> audio`、`characters/scenes/analysis/collab/versions/settings -> more/*`。
- 移动端：一级 tab 可横向滚动；二级入口收纳在底部 / 抽屉。
- 现有键盘事件（`editor-tab-*`）保留并补齐新别名。

**不包含**

- 不新增后端字段。
- 不做 tab 间拖拽、分屏、浮动窗口。
- 不改变现有各 tab 内部业务逻辑。

### 4.5 验收标准

```
GIVEN 用户打开任意项目
WHEN 编辑器渲染完成
THEN 一级导航只显示 剧本 / 图片 / 视频 / 音频 / 剪辑 五个入口
AND 角色 / 场景 / 分析 / 协作 / 版本 / 设置 均可从“更多工具”到达

GIVEN 当前处于音频 tab
WHEN 用户刷新浏览器
THEN 仍停留在音频 tab，且 URL 含 tab=audio

GIVEN 旧链接 #/project/:id 直接进入
WHEN 页面加载
THEN 默认进入剧本 tab，不出现空白或报错

GIVEN 宽度 < 768px
WHEN 用户查看一级导航
THEN 导航可横向滚动，不换行、不遮挡内容
```

### 4.6 技术方案

- 新增 `public/js/views/editorTabs.js`：集中定义一级 tab、二级工具、旧标识映射。
- `editor.js` 只保留挂载、切换与视图委托；各 tab 内容渲染拆到独立模块，避免继续膨胀。
- Tab 状态写入 URL query 与 `localStorage` 兜底，不写后端。
- 旧事件名与新事件名双向兼容。

### 4.7 工作量估算

| 项 | 估算 |
|---|---|
| 前端 IA 重构与样式 | 10h |
| Tab 模块拆分与兼容层 | 6h |
| 移动端适配与深链 | 4h |
| 测试与回归 | 4h |
| 合计 | 约 24h |

---

## 五、R32 图片生成独立 Tab

### 5.1 问题与机会

DreamReel 的创作链目前只有“文字 / 剧本 -> 视频”，缺少中间视觉资产层。用户无法先生成角色定妆、场景概念图、分镜首帧，再进入视频生成。LibTV 与同类产品的共同路径是：先产图，再图生视频。补齐图片生成后，既有 `referenceImages` 注入链路可以立即获得更高价值的输入。

### 5.2 用户故事

- 作为创作者，我希望输入一句画面描述生成图片，以便快速预览视觉方向。
- 作为创作者，我希望一次生成多张候选并选择，以便对比构图和风格。
- 作为创作者，我希望把满意的图片设为某个镜头的参考图，以便后续视频保持一致性。
- 作为创作者，我希望把生成图设为角色参考图或场景参考图，以便全局复用。
- 作为创作者，我希望查看项目内所有图片资产，以便复用与清理。

### 5.3 功能范围

**包含**

- Provider 抽象：`BaseImageProvider` + `MockImageProvider` + `OpenAI 兼容 ImageProvider`（有 Key 才启用）。
- Mock 产出真实 PNG 文件：Python + Pillow 绘制渐变背景、比例框与 prompt 文本；字体缺失时降级为无文字图形，接口返回 `textRendered:false`。
- 生成参数：prompt、比例（16:9 / 9:16 / 1:1 / 4:3）、风格（写实 / 电影感 / 动漫 / 水彩 / 极简）、数量 1–4。
- 资产库：按项目筛选、状态（generating/completed/failed）、删除、预览、下载。
- 回填：设为镜头参考图、角色参考图、场景参考图；回填后必须持久化并可重启恢复。
- 内容审核：生成前走 `contentModerationService`。
- 额度：新增图片生成额度，按订阅计划配置每日次数。

**不包含**

- 不做图片编辑、局部重绘、扩图、抠图。
- 不做图片转视频的独立入口；通过既有参考图注入实现。
- 不内置开源文生图模型与本地权重。

### 5.4 验收标准

```
GIVEN 项目存在且图片额度充足
WHEN 用户提交 prompt 生成 2 张图
THEN 返回 2 条 imageAsset，状态从 generating 变为 completed
AND 每条资产对应一个真实存在的 PNG 文件，且可被 HTTP 访问

GIVEN 图片资产已生成
WHEN 用户点击“设为镜头 1 参考图”
THEN 项目镜头 1 的 referenceImages 包含该图片 URL
AND 服务重启后该引用仍存在
AND 后续视频生成会把该图片作为 referenceImage 传给 provider

GIVEN prompt 为空或数量不在 1-4
WHEN 调用生成接口
THEN 返回 400

GIVEN 图片额度已用尽
WHEN 再次生成
THEN 返回 403，且不创建 imageAsset

GIVEN Mock Provider 运行且系统无可用中文字体
WHEN 生成图片
THEN 仍产出可打开的 PNG，并返回 textRendered=false
```

### 5.5 接口契约（建议）

| 方法 | 路径 | 语义 | 成功 | 失败 |
|---|---|---|---|---|
| POST | `/api/images/generate` | 生成 1–4 张图 | 202/200 + assets | 400 参数、403 审核/额度 |
| GET | `/api/images/assets?projectId=` | 列图片资产 | 200 items | 400 |
| GET | `/api/images/assets/:id` | 资产详情 | 200 | 404 |
| DELETE | `/api/images/assets/:id` | 删除资产与文件 | 200 | 404 |
| POST | `/api/images/assets/:id/apply` | 回填镜头/角色/场景 | 200 + 目标对象 | 400、404 |
| GET | `/api/images/providers` | provider 与模型状态 | 200 | 500 |

`apply` 请求体：

```json
{
  "targetType": "shot|character|scene",
  "targetId": "shot-or-char-or-scene-id",
  "projectId": "project-id"
}
```

### 5.6 数据模型

新增 `ImageAsset`：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `img_<ts>_<rand>` |
| projectId | string | 所属项目 |
| userId | string | 创建者 |
| prompt | string | 原始 prompt |
| enhancedPrompt | string | 风格 / 比例增强后 prompt |
| provider | string | mock / openai |
| model | string | 模型名 |
| size | string | 1024x576 等 |
| aspectRatio | string | 16:9 等 |
| style | string | 风格 id |
| status | string | generating / completed / failed |
| filePath | string | 本地路径 |
| url | string | `/storage/images/...` |
| textRendered | boolean | Mock 是否成功渲染文字 |
| errorMessage | string | 失败原因 |
| createdAt / completedAt | string | 时间 |

项目侧不新增图片数组，图片资产单独持久化到 storage key `imageAssets`，避免项目对象继续膨胀。

### 5.7 技术方案

- `src/providers/imageProviderFactory.js`：参照 video/tts factory，支持按项目 / 用户解析 provider。
- `src/providers/mockImageProvider.js`：调用 `scripts/render_image_asset.py` 产出 PNG；测试断言 PNG magic bytes 与文件大小。
- `src/providers/openaiImageProvider.js`：OpenAI Images API 兼容，Key 缺失时该 provider 显示为未配置，不被静默选择。
- `src/services/imageService.js`：生成、落盘、资产 CRUD、回填参考图。
- `src/routes/images.js`：路由挂载 `/api/images`。
- `src/services/storageService.js`：启动加载 `imageAssets` 并规范化。
- `src/services/quotaService.js` + `config/index.js` + 订阅计划：新增图片额度字段。
- 前端 `public/js/views/images.js`：生成表单、候选网格、资产库、回填操作。

### 5.8 工作量估算

| 项 | 估算 |
|---|---|
| Provider 抽象 + Mock PNG 渲染 | 10h |
| imageService / 路由 / 持久化 / 额度 / 审核 | 12h |
| 前端图片 tab 与资产库 | 12h |
| 测试与 E2E | 8h |
| 合计 | 约 42h |

---

## 六、R33 音频生成独立 Tab（Wave 2）

### 6.1 问题与机会

现有配音页可以触发 TTS 并生成 SRT，但 Mock 模式返回不可播放的远程占位地址，BGM/SFX 素材目录为空，用户无法在站内完成真实音频制作。音频 tab 要解决的是“音频资产真实可用”，而不是再放一个入口。

### 6.2 用户故事

- 作为创作者，我希望逐句生成语音并试听，以便确认台词节奏。
- 作为创作者，我希望为不同角色分配不同音色，以便对话可区分。
- 作为创作者，我希望使用程序化生成的 BGM 与音效，以便成片不缺声音层。
- 作为创作者，我希望调节配音 / BGM / 音效三轨音量并试听混音效果。
- 作为创作者，我希望知道当前音色是真实语音还是占位音，以便不误判交付质量。

### 6.3 功能范围

**包含**

- Mock TTS 改造：用 ffmpeg 生成本地 WAV 占位音（按文本长度生成不同频率 / 节奏的提示音），返回本地 `/storage/audio/voices/...`。
- 真实 TTS：ElevenLabs 配置时产真实语音，前端展示真实 provider 状态。
- 程序化音频素材包：用 ffmpeg lavfi（sine / anoisesrc / aevalsrc）生成最小可用 BGM 与 SFX 文件，补齐现有元数据中的 `available`。
- 音频资产库：语音 / BGM / SFX 三类，支持试听、时长、来源标注。
- 三轨混音配置与试听：复用 `ffmpeg.mixAudioTracks`，新增预听接口。
- 应用结果写回 `project.audioConfig` 与 `dialogueAssignments`。

**不包含**

- 不做 AI 作曲、旋律生成、人声克隆、方言克隆。
- 不做音频降噪、分离、修音。
- 不接第三方音乐版权库。

### 6.4 验收标准

```
GIVEN Mock TTS 模式
WHEN 用户生成旁白
THEN 产出一个本地可播放的音频文件
AND 接口返回 provider=mock 与 placeholder=true
AND 前端显示“占位音，非真实语音合成”

GIVEN ElevenLabs 已配置
WHEN 用户生成旁白
THEN 返回 provider=elevenlabs 与 placeholder=false

GIVEN BGM 素材包已生成
WHEN 用户打开音频 tab
THEN 至少 4 条 BGM 与 12 条 SFX 显示 available=true 且可试听

GIVEN 用户设置配音 80%、BGM 30%、SFX 50%
WHEN 调用混音预听
THEN 返回真实混音音频文件，且三轨音量参数进入 ffmpeg filter
```

### 6.5 工作量估算

| 项 | 估算 |
|---|---|
| Mock TTS 本地真实化 | 8h |
| 程序化 BGM / SFX 素材生成 | 10h |
| 音频资产服务与预听接口 | 10h |
| 前端音频 tab | 12h |
| 测试与音视频流验证 | 8h |
| 合计 | 约 48h |

---

## 七、R34 智能剪辑模块（Wave 2）

### 7.1 问题与机会

现有导出只做“按镜头顺序拼接 + 混音 + 字幕”，没有剪辑决策层。创作者仍要自己想节奏、转场和时长分配。需要补一层可解释、可预览、可回滚的规则剪辑引擎。

### 7.2 用户故事

- 作为创作者，我希望选择“快节奏 / 叙事 / 抒情”等剪辑风格，一键生成剪辑方案。
- 作为创作者，我希望看到每个镜头的入点、出点、时长和转场，以便确认方案。
- 作为创作者，我希望按目标总时长自动压缩或扩展节奏，以便适配发布平台。
- 作为创作者，我希望 BGM 的 BPM 影响切点，以便画面节奏更贴合音乐。
- 作为创作者，我希望先预览方案再渲染，以便不破坏原项目。

### 7.3 功能范围

**包含**

- 规则剪辑引擎：输入镜头、导演模式、BGM、目标时长、风格预设；输出 `editPlan`。
- 风格预设：快节奏 / 叙事 / 抒情 / 商业广告。
- 转场：硬切 / 淡入淡出；ffmpeg 支持 xfade 时启用交叉溶解，否则自动降级并如实返回 `transitionFallback=true`。
- 时长策略：按目标总时长计算每镜时长，支持锁定镜头不参与压缩。
- BPM 对齐：读取 BGM 元数据 BPM，生成切点建议；无 BPM 时退化为等分节奏。
- 方案预览：表格 + 时间轴条形预览；不改原镜头。
- 渲染：`videoCompositingService.renderEditPlan` 输出真实 MP4。
- 方案持久化：`project.editPlan`，支持重新生成与清除。

**不包含**

- 不做 AI 内容理解、自动高光识别、镜头美感打分。
- 不做多轨视频叠加、画中画、蒙版、关键帧。
- 不做真实 NLE 级逐帧编辑。

### 7.4 验收标准

```
GIVEN 项目有 4 个已完成镜头
WHEN 用户选择“快节奏”并设置目标 15 秒
THEN 生成 editPlan，每个镜头含 in/out/duration/transition
AND 总时长误差 <= 1 秒
AND 输出为确定性结果，同一输入重复生成完全一致

GIVEN 镜头 2 已锁定
WHEN 生成剪辑方案
THEN 镜头 2 时长不被压缩

GIVEN BGM 时长 30 秒、BPM 120、目标 15 秒
WHEN 生成方案
THEN 切点对齐 0.5 秒网格，且方案说明标明 BPM 来源

GIVEN 当前 ffmpeg 不支持 xfade
WHEN 选择淡入淡出并渲染
THEN 自动降级硬切，返回 transitionFallback=true，不静默假装有转场

GIVEN 用户对方案不满意
WHEN 点击清除
THEN editPlan 清空，原镜头时长与视频文件不变
```

### 7.5 工作量估算

| 项 | 估算 |
|---|---|
| editPlan 规则引擎与预设 | 10h |
| ffmpeg 渲染与转场能力探测 | 12h |
| 方案持久化与接口 | 8h |
| 前端剪辑 tab | 12h |
| 测试与成片验证 | 8h |
| 合计 | 约 50h |

---

## 八、R35 工程健康收口

### 8.1 问题

Sprint 13 PM 复核确认两个既存工程问题：

1. 测试与开发共用 `storage/data/db.json`，全量测试会污染开发数据。
2. `public/js/**` 未纳入 eslint，前端新增模块没有静态检查。

### 8.2 目标

- `npm test` 使用独立测试存储目录，跑完不改变开发库。
- 增加可重复的“测试前后项目数 / 厂牌数不变”断言。
- `npm run lint` 覆盖 `public/js/**/*.js`，并记录存量 error 基线，不要求一次清零。

### 8.3 验收标准

```
GIVEN 开发库当前有 N 个项目
WHEN 执行 npm test
THEN 测试结束后开发库项目数仍为 N

GIVEN 执行 npm run lint
THEN 命令同时检查 src/、tests/、public/js/
AND 输出中区分本期新增文件错误与存量错误
```

### 8.4 工作量估算

约 8h。

---

## 九、总工作量与波次建议

| 波次 | 需求 | 估算 | 建议理由 |
|---|---|---|---|
| Wave 1（Sprint 14） | R31 + R32 + R35 | 约 74h | 先完成信息架构与真实生成能力入口，图片可直接反哺现有视频链路；工程收口同期完成 |
| Wave 2（Sprint 15） | R33 + R34 | 约 98h | 音频真实化与剪辑渲染都需要 ffmpeg 能力探测和音视频验证，独立成期更稳 |

若强行一期做 R31–R35，估算约 172h，且所有功能都触达 `editor.js` 与 `videoCompositingService`，冲突与回归风险显著上升，不建议。

---

## 十、风险与应对

| 风险 | 影响 | 概率 | 应对 |
|---|---|---|---|
| `editor.js` 过大，重构引发回归 | Wave 1 主风险 | 高 | 先抽 `editorTabs.js` 与 tab 模块，保持现有渲染逻辑不变；每步跑 `node --check` + 测试 + 浏览器冒烟 |
| ffmpeg 无 xfade 或 drawtext | 转场 / 文字能力降级 | 中 | 启动时探测能力；降级硬切 / 无文字图形，并在接口如实返回 |
| Mock TTS 无法产出真实语音 | 用户误判配音能力 | 高 | 强制 `placeholder=true` 与 UI 明示；真实语音仅由真实 provider 提供 |
| 无 BGM/SFX 文件 | 音频 tab 无真实素材 | 高 | 程序化生成最小素材包；标注“程序化音频，非 AI 作曲” |
| 图片生成额度被绕过 | 成本 / 公平性风险 | 中 | 生成前审核 + 额度校验，失败不创建资产 |
| 参考图回填后重启丢失 | 一致性风险 | 中 | 走 `projectService.updateProject` 白名单并加 hydrate 测试 |
| 测试库隔离不彻底 | 开发数据继续被污染 | 中 | 在 npm script 层注入独立 `STORAGE_PATH`，并加前后计数断言 |
| 无 Jenkins / Jira / GitLab Webhook | 无法全自动流转 | 高 | 采用技能许可的半自动化模式：本地命令 + 分支 + 独立 PM 复核对证据 |
| 工作区已有未提交修改 | 误覆盖用户改动 | 中 | 所有子代理文件所有权写入上下文；共享文件由编排者串行修改；提交前逐文件核对 diff |

---

## 十一、一致性校验口径

| 维度 | 本期校验点 |
|---|---|
| 代码一致性 | 新增文件 lint 0 error；既有 47 error 只记录不扩大；`node --check` 全过；无新依赖 |
| 环境一致性 | `npm test` 使用独立 STORAGE_PATH；Dockerfile 不影响；ffmpeg / python3 / Pillow 能力探测结果入报告 |
| 数据一致性 | `ImageAsset`、`project.editPlan`、`referenceImages`、`audioConfig` 重启不丢；测试库隔离前后开发库计数不变 |
| 文档一致性 | README 功能总览、API 小节、测试数、路线图与实现同步；需求 / 规划 / 交付报告互相可追溯 |

---

## 十二、结论

Sprint 14 的正确范围不是“把 LibTV 首页五个词照搬一遍”，而是补齐两条真实链路：

1. **信息架构链路**：五 tab 让用户从剧本走到成片的路径清晰。
2. **视觉资产链路**：图片生成 -> 参考图 -> 视频生成，首次把“先图后视频”打通。

音频生成与智能剪辑价值明确，但都需要独立的能力建设与更重的 ffmpeg 验证，建议按 Wave 2 排入 Sprint 15。这样每一期交付都能被独立验证，也符合工作流“闭环自治、边界清晰”的原则。

