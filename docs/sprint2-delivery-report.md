# DreamReel Sprint 2 交付报告

- **任务 ID**: TASK-20261002-002
- **Sprint 名称**: 角色与场景体系（P1）
- **交付日期**: 2026-10-03
- **最终状态**: GLOBAL_DONE

---

## 一、交付范围

| 需求 ID | 需求名称 | 优先级 | 状态 |
|---------|---------|--------|------|
| R05 | 场景库与场景复用 | P1 | ✅ 已完成 |
| R04 | 角色表情与动作库 | P1 | ✅ 已完成 |
| R07 | 字幕样式自定义 | P1 | ✅ 已完成 |

---

## 二、功能详情

### R05 场景库与场景复用
- 22 个内置场景，覆盖 5 大分类（科幻/自然/城市/室内/奇幻）
- 每个场景含名称、描述、标签、光线条件元数据
- 用户自定义场景完整 CRUD（创建/查询/更新/删除）
- 场景统计端点
- 镜头中通过高级面板快速选择场景，保存到 `shot.sceneId`
- 场景参考图存储目录 `storage/scenes/`

### R04 角色表情与动作库
- 12 种预设表情（开心/愤怒/悲伤/惊讶/恐惧/平静/思考/微笑/哭泣/紧张/坚定等）
- 10 种动作模板（行走/奔跑/坐下/转身/挥手/点头/拥抱/指向等）
- 5 种画面位置（中央/左侧/右侧/前景/背景）
- 每个镜头可逐角色配置表情/动作/位置
- `buildCharacterActionPrompt()` 自动组合并在视频生成时注入 prompt
- 配置存储于 `shot.characterActions`

### R07 字幕样式自定义
- 字体选择（8 种，含中英文）、字号（14-48px）
- 字体颜色、描边颜色、描边宽度（0-6px）
- 字幕位置（底部/顶部/居中）
- 粗体、斜体、阴影开关
- 双语字幕（中+英，支持英/中/日第二语言）
- 黑色预览框实时渲染样式效果
- 配置存储于 `project.subtitleStyle`

---

## 三、过程中发现并修复的问题

| 问题 | 根因 | 修复 |
|------|------|------|
| 镜头/按钮 ID 为 undefined，事件无法定位 | LLM 生成的 shots 经 normalize 时未生成 id；characters map 回调缺少 index 参数 | `scriptService.validateAndNormalize` 为 shots/characters 补充 uuid，并补全 status/locked/versions 等默认字段 |
| 项目创建后未持久化，重启丢失 | db.json 中 projects 为历史数组格式，加载后覆盖对象；数组字符串键不被序列化 | `storageService` 加载时通过 `_normalizeKeyed` 将数组/对象统一为以 id 为键的对象（projects/users/usage） |
| 模板创建项目时角色未同步 | create 端点只同步 shots，未处理 characters | 补充 characters 同步，并按角色名自动关联镜头 characterIds |
| 高级设置（场景/角色动作）保存不生效 | PUT `/video/shots/:id` 端点未处理 sceneId/characterActions 字段 | 端点补充两个字段的写入 |
| 字幕样式/音频配置保存不生效 | `updateProject` 字段白名单缺少 subtitleStyle/audioConfig | 白名单补充两个字段 |
| 前端开发时浏览器缓存旧 JS | 静态服务器未设置 no-cache | `frontend-server.js` 对所有响应设置 Cache-Control: no-cache |
| 旧数据 hydrate 时新字段丢失 | `_hydrateProject` 未传 locked/versions/characterActions | 补充字段映射 |

---

## 四、测试结果

- **单元测试**: 321 个全部通过（19 个测试套件，0 失败）
- **API 接口测试**:
  - 场景：列表/统计/CRUD 端点正常，返回 22 个内置场景
  - 镜头高级设置：sceneId + characterActions 保存并正确回读
  - 字幕样式：自定义配置保存并正确回读
- **前端页面测试（从页面出发）**:
  - 镜头高级面板展开，场景下拉 23 项、2 角色各 3 个控件
  - 选择火星场景 + 主角微笑挥手 + 配角思考指向，保存成功
  - 字幕样式编辑器控件齐全，实时预览正确响应（Georgia/36px/金色/红描边/顶部/粗斜体/双语）
  - 保存后 API 数据验证一致

---

## 五、新增/修改文件

**新增后端文件**
- `src/config/sceneLibrary.js`
- `src/config/characterExpressions.js`
- `src/services/sceneService.js`
- `src/routes/scenes.js`

**修改后端文件**
- `src/models/Shot.js`（characterActions 字段）
- `src/models/Project.js`（subtitleStyle 字段）
- `src/services/scriptService.js`（id 生成与规范化）
- `src/services/storageService.js`（数据格式规范化）
- `src/services/projectService.js`（白名单/hydrate 字段）
- `src/services/videoService.js`（角色动作 prompt 注入）
- `src/routes/video.js`（镜头端点字段）
- `src/routes/templates.js`（角色同步）
- `src/server.js`（注册场景路由）

**修改前端/工具**
- `public/js/api.js`（场景 API）
- `public/js/views/editor.js`（高级面板、字幕样式编辑器）
- `scripts/frontend-server.js`（no-cache）
- `README.md`

---

## 六、已知限制与后续建议

1. **字幕导出渲染**: 当前 ffmpeg（8.1）不含 libfreetype，subtitles/drawtext 滤镜不可用，自定义字幕样式暂在前端预览/配置保存，导出成片未实际烧录；建议后续更换含 libfreetype 的 ffmpeg 构建。
2. **场景参考图**: 内置场景暂无参考图，自定义场景参考图上传 UI 可进一步完善。
3. **BGM/音效实际音频文件**: 存储目录仍为空，条目显示⚠️，建议添加 CC0 素材。
4. **音效时间点**: 音效目前为全局叠加，不支持按镜头时间点精确放置。
5. **通知偏好持久化**: 仅在内存，重启重置。

---

## 七、Sprint 规划衔接

- Sprint 1（P0）：单镜头重生成、可视化故事板、BGM/音效库 — ✅ 已交付
- **Sprint 2（P1）：场景库、角色表情动作、字幕样式 — ✅ 本次交付**
- Sprint 3（P1）：多角色对话配音（R06）、镜头衔接与一致性控制（R08）
- Sprint 4+（P2/P3）：社区/企业/生态、AI 能力与多端
