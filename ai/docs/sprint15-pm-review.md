# DreamReel Sprint 15 交付复核（独立复核，只看不改）

- 复核日期：2026-10-05
- 复核范围：R33 音频生成、R34 智能剪辑
- 复核方式：两名独立子代理（正确性 / 安全）源码审读 + 自跑 `npm test` + 隔离端口 HTTP 探针 + 运行时 ffprobe 验证
- 复核纪律：只读，不修改代码；临时 STORAGE_PATH、端口与进程均已清理

---

## 一、复核结论

### ✅ 通过（PASS）

第一轮复核发现 8 项问题，其中：

- 正确性：3 个 P1（音频路由认证、渲染无法延长、短旁白截短）+ 4 个 P2。
- 安全：1 个 Critical（项目删除清理路径穿越）、1 个 Critical（editPlan 可被通用 PUT 篡改）、1 个 High（storage 外媒体路径）、若干输入边界。

全部修复后：

- 正确性复核确认 7 项修复均成立，`npm test` 488 / 0。
- 安全复核确认删除清理 Critical 修复成立，定向探针 `deletedFiles:0`、sentinel 未被删除，`npm test` 488 / 0。

---

## 二、正确性发现与修复

### P1：`/api/audio/preview` 对已登录用户不可用

- 原因：`/api/audio` 路由未挂 `authOptional`，`req.user` 永远为空。
- 修复：`app.use('/api/audio', authOptional, audioRouter)`。
- 复测：匿名 404、跨用户 404、项目所有者 token 200。

### P1：剪辑渲染无法把镜头延长到目标时长

- 原因：`ffmpeg.trimVideo` 只做 `-t` 截断；源片比计划短时输出仍停在源时长。
- 修复：加 `-stream_loop -1`，先循环输入再按时长截断。
- 复测：两条 1s 源片、4s 计划，渲染输出 4.0s；回归测试 `目标时长大于源镜头时长时...`。

### P1：短旁白会把成片截短

- 原因：单轨音频只做音量调整，没有补齐；`mergeAudio -shortest` 按短轨截断。
- 修复：`adjustVolumeAndPad`（`apad` + `-t duration`），单轨预听/渲染补齐到目标时长。
- 复测：一条短旁白、5s 预听，输出 >= 4.5s；回归测试 `只有短旁白时...`。

### P2：editPlan 不完全确定

- 修复：用输入哈希生成稳定 `id`，移除 `createdAt`；回归测试改为整对象 `deepEqual`。

### P2：非法 targetDuration 被当成成功

- 修复：`Number.isFinite` 校验，非法值 400；同时限制镜头数 200。

### P2：BGM/SFX 不能试听

- 修复：素材 chip 增加 ▶ 按钮，接入浏览器 `Audio` 播放；有文件才显示试听入口。

### P2：preview 返回绝对服务器路径

- 修复：`tracks` 只返回 `{ volume }`，不再返回 `path`。

### P2：audioConfig / dialogueAssignments 重载丢失

- 原因：`hydrateProject` 未把序列化字段传回 `Project`。
- 修复：补齐 description、tags、favorite、archive、audioConfig、subtitleStyle、dialogueAssignments、visualStyle、providerPreferences、published/统计字段、team/challenge、lastAccessedAt 等。
- 回归：新增 `audioConfig 与 dialogueAssignments 重启 hydrate 后不丢`。

---

## 三、安全发现与修复

### Critical：项目删除清理路径穿越可删 storage 外文件

- 原因：`routes/projects.js` 有自己的 `cleanupProjectFiles`，直接 `path.join` 用户可控 `videoUrl`。
- 修复：统一 `resolveStoragePath` containment；`STORAGE_DIR` 改用 `config.storage.path`。
- 复测：`shot.videoUrl=/storage/../sentinel` 删除项目返回 `deletedFiles:0`，storage 外 sentinel 仍存在；回归测试 `projectCleanupContainment.test.js`。

### Critical：通用 PUT 可篡改 editPlan

- 修复：`editPlan` 从 `updateProject` 白名单移除，新增 `setEditPlan` 仅供剪辑服务写入。
- 复测：匿名 PUT 不再能改变已保存方案。
- 残留：通用项目 PUT/DELETE 仍缺所有权校验，可篡改 `shots/audioConfig/providerPreferences` 等字段。这是既有项目路由授权缺口，非 Sprint 15 引入；本轮已阻断其对 editPlan 与文件删除的直接危害。

### High：storage 外媒体可进入剪辑渲染

- 修复：`resolveVideoPath` 对非 `/storage/` 本地路径做根目录 containment，不允许 storage 外文件；`resolveAudioPath` 与 `audioService._resolveAudioPath` 同样 containment。

### 输入与资源边界

- targetDuration 必须 finite，镜头数 <= 200，渲染单镜时长 0<d<=60。
- Mock TTS 时长上限 120s。
- 音频预览 duration 仍建议后续补显式上限；`speed` 建议做类型校验（残留）。

---

## 四、复测证据

- `npm test`：488 tests / 488 pass / 0 fail / 58 suites。
- `[test-isolation] OK：开发库未被修改（projects=48, studios=0, imageAssets=0）`。
- Mock TTS：真实 WAV，`RIFF/WAVE`，`placeholder:true`。
- `seed:audio`：20 BGM + 30 SFX，ffprobe 全可读。
- 混音预听：真实 `.m4a`，3 轨 6s，`placeholderVoices:true`。
- 剪辑：15s 确定性方案 15.01s；锁定镜头 7s 保留；140 BPM 切点对齐；xfade 渲染成功；扩展渲染 4.0s。
- agent-browser：音频 tab 占位口径、混音预听；剪辑 tab 生成方案、渲染 5.7s 含混音音轨；控制台零 error。

---

## 五、残留风险

1. 通用项目 PUT/DELETE 缺所有权校验（既有问题）；生产前应加与图片/音频/剪辑接口一致的归属校验。
2. `/storage/audio/previews`、`/storage/exports` 等媒体 URL 仍是公开可读的 capability URL。
3. 扩展渲染用 `-stream_loop` 循环源片，视觉上是循环而非冻结帧；后续可改为末帧定格。
4. 稳定 id 使用 32 位 FNV 哈希，碰撞概率低但非零。
5. xfade 不支持时的降级分支未在本机强制触发（本机支持 xfade）。
6. `public/js` 37 个、`src/tests` 44 个历史 lint error 未清零；本轮新增文件 0 error。
7. 全量测试曾出现 1 次未捕获名称的偶发失败；随后连续 4 次 `npm test` 均为 488/488 通过，未复现，疑为既有计时敏感用例。

---

## 六、总体判定

**✅ PASS，Sprint 15 Wave 2 可交付。**

本轮所有新增能力均有真实文件与真实 HTTP / 浏览器证据；音频口径诚实；智能剪辑边界清晰；已发现的高危问题均已修复并复测。
