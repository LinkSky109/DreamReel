# DreamReel Sprint 15 交付报告（Wave 2）

- 任务 ID：`TASK-20261005-015`
- 主题：音频生成 + 智能剪辑
- 交付日期：2026-10-05
- 分支：`sprint-15-audio-smart-edit`
- 工作流上下文：`.workflow/context-sprint15.yaml`
- 独立复核：`docs/sprint15-pm-review.md`
- 最终状态：✅ `GLOBAL_DONE`（正确性复核 + 安全复核 PASS）

---

## 一、范围

| 需求 | 名称 | 状态 |
|---|---|---|
| R33 | 音频生成独立 Tab | ✅ 交付 |
| R34 | 智能剪辑模块 | ✅ 交付 |

---

## 二、R33 音频生成

### 后端

- Mock TTS 改为产本地真实 WAV 占位音，返回 `placeholder:true` / `provider:'mock'`；ffmpeg 失败时回退手写静音 WAV。
- ElevenLabs 真实语音路径返回 `placeholder:false`。
- 新增程序化素材：`npm run seed:audio` 用 ffmpeg 生成 20 首 BGM（9 情绪）与 30 个 SFX（6 类）。
- `audioService` 修复硬编码 storage，改用 `config.storage.path`，测试隔离生效。
- 新增 `POST /api/audio/preview`：真实三轨混音预听，返回 URL、轨道数、`placeholderVoices`，不泄露绝对路径。
- 单轨音频用 `apad + -t` 补齐到目标时长，避免短旁白截短。
- 音频预览与项目归属校验，匿名/跨用户 404。

### 前端

- 音频 tab 增加 TTS provider 提示：Mock = 「本地占位音（非真实语音）」，真实 provider = 「真实语音合成」。
- 配音结果逐条标记占位音。
- BGM/SFX 素材 chip 增加 ▶ 试听按钮。
- 新增「预听混音」按钮与 `<audio>` 结果。

### 验证

- Mock TTS 文件为真实 RIFF/WAVE。
- `seed:audio` 后 BGM/SFX `available=true`，ffprobe 全部可读。
- 混音预听：3 轨、6.0s、真实 `.m4a`、placeholderVoices=true。
- 浏览器实测音频 tab 与预听成功，控制台 0 error。

---

## 三、R34 智能剪辑

### 规则引擎

- 4 种预设：快节奏 / 叙事 / 抒情 / 商业广告。
- 目标时长自适应；锁定镜头保留原时长；非锁定镜头按权重缩放。
- BGM 存在时读取 BPM，切点对齐 1/8 拍网格。
- 稳定输入哈希生成 `editPlan.id`，同输入生成完全一致的方案。
- 镜头数上限 200，targetDuration 必须 finite，渲染单镜时长 0<d<=60。
- `project.editPlan` 持久化；`editPlan` 不允许通过通用 PUT 篡改，仅 `setEditPlan` 写入。

### 渲染

- `videoCompositingService.renderEditPlan`：
  - 逐镜循环裁剪/延长到计划时长（`-stream_loop -1`）；
  - xfade 支持时交叉溶解，不支持时硬切并返回 `transitionFallback:true`；
  - 通过 `audioService.previewMix` 生成混音并 mux，返回 `hasAudio`；
  - 输出真实 MP4 到 `/storage/exports/`；
  - 存储路径 containment，拒绝 storage 外媒体。

### 前端

- 剪辑 tab：预设、目标时长、BGM 选择、生成方案、清除方案、渲染成片、方案表格、视频预览。
- 明确标注「规则驱动，不做 ML 内容理解或自动高光识别」。

### 验证

- 4 镜头 15s 方案确定性一致，总时长 15.01s。
- 锁定镜头 7s 不被压缩。
- 140 BPM 切点全部对齐 beat grid。
- clearPlan 不修改原镜头。
- xfade 渲染成功；扩展目标渲染 4.0s；硬切分支测试通过。
- agent-browser 实测生成方案并渲染 5.7s MP4，含混音音轨，控制台 0 error。

---

## 四、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test` | 488 tests / 488 pass / 0 fail / 58 suites |
| 测试隔离 | `projects=48, studios=0, imageAssets=0` 未变 |
| R33 新增测试 | 9 例 |
| R34 新增测试 | 13 例 |
| 清理 containment | 1 例 |
| 新增文件 lint | 0 error |
| `src/tests` 存量 lint | 44 error（较 Sprint 14 的 47 减少 3） |
| `public/js` 存量 lint | 37 error |

---

## 五、安全修复

| 问题 | 处理 |
|---|---|
| DELETE 项目清理路径穿越可删 storage 外文件 | `resolveStoragePath` containment + 回归测试；`deletedFiles:0`，sentinel 保留 |
| editPlan 可被通用 PUT 篡改 | 从白名单移除，改 `setEditPlan` 专用写入 |
| storage 外媒体进入剪辑 | `resolveVideoPath` / `resolveAudioPath` containment |
| targetDuration NaN / 镜头数无上限 | finite 校验 + 200 镜头上限 + 单镜 0-60s |
| Mock TTS 超长文本 | 时长上限 120s |
| preview 泄露绝对路径 | 只返回轨道 volume |
| 音频预览跨用户 | authOptional + 项目归属校验，404 |

**残留（既有，非本轮引入）**：通用项目 PUT/DELETE 仍缺所有权校验，可篡改 shots/audioConfig 等字段；生产前应补全项目路由授权。

---

## 六、新增 / 修改文件

**新增**

- `src/services/audioAssetService.js`
- `src/services/editPlanService.js`
- `src/routes/editPlans.js`
- `scripts/seed_audio_pack.js`
- `tests/audioGeneration.test.js`
- `tests/editPlan.test.js`
- `tests/projectCleanupContainment.test.js`
- `.workflow/context-sprint15.yaml`
- `docs/sprint15-pm-review.md`
- `docs/sprint15-delivery-report.md`

**修改（主要）**

- `src/providers/mockTTSProvider.js`、`src/providers/elevenLabsTTSProvider.js`
- `src/services/audioService.js`、`src/services/dubbingService.js`、`src/services/videoCompositingService.js`、`src/services/projectService.js`
- `src/routes/audio.js`、`src/routes/projects.js`、`src/server.js`
- `src/utils/ffmpeg.js`、`src/config/sfxLibrary.js`、`src/models/project.js`
- `public/js/api.js`、`public/js/views/editor.js`、`public/css/style.css`
- `package.json`、`README.md`

> 工作区中原有 10 个未提交修改全部保留；本轮未提交 commit。

---

## 七、已知限制

1. 通用项目路由授权缺口（既有）；生产前需补。
2. `/storage/audio/previews` / `/storage/exports` 仍是公开可读媒体 URL。
3. 扩展渲染用循环源片，不是冻结帧。
4. xfade 降级分支未在本机强制触发。
5. 全仓 lint 仍有 81 个历史 error（44 + 37），本轮新增文件 0 error。
6. 全量测试曾出现 1 次未捕获名称的偶发失败；随后连续 4 次 488/488 通过，未复现。

---

## 八、结论

Sprint 15 完成 R33 音频生成与 R34 智能剪辑：音频从不可播放的远程占位 URL 升级为本地真实文件 + 程序化素材 + 混音预听；剪辑从纯拼接升级为规则 EDL、BPM 对齐、xfade 探测与真实渲染。488 个测试全通过，HTTP 与真实浏览器证据完整，两组独立复核 PASS。

**最终状态：`GLOBAL_DONE`。**
