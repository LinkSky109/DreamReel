# 前端 Phase 3 交付报告 · 配音与剪辑

> 日期：2026-10-20
> 前置：`c78c2eb`（Phase 2 编辑器）
> 状态：E-05 剪辑完整迁移；E-04 配音核心迁移，旧版音频工作台保留为高级入口

---

## 1. 完成范围

### E-04 配音（React）

- 语言（中 / 英 / 日）、默认音色、语速、句间停顿、字幕烧录开关。
- 角色音色映射：每个角色独立音色，支持示例试听；保存到 `dialogueAssignments`。
- 生成配音：调用 `/api/dubbing/generate`，渲染：
  - 三轨时间轴块（对白 / 旁白 / BGM），按真实 `startTime`、`duration` 比例定位；
  - 逐句音频播放器、时间范围、对白/旁白类型、占位音标记；
  - 字幕 SRT 下载；
  - Provider 与总时长摘要。
- 三轨音量（配音 / BGM / 音效）与 BGM 淡入淡出，保存到 `audioConfig`。
- 旧版音频工作台入口：`?tab=dubbing&legacy=1`，保留 BGM / 音效库、字幕样式、混音预听等高级能力；点击阶段栏“配音”可返回新版。

### E-05 剪辑（React）

- 四种剪辑预设（快节奏 / 叙事 / 抒情 / 商业广告）、目标时长、BGM（BPM 切点）。
- 生成方案：显示摘要、BPM/beat、转场、总时长。
- 时间轴：视频块按方案累计时长定位；配音块只在有台词/旁白的镜头出现；BGM 全宽块。
- 方案表：镜头、入/出、时长、转场、分配原因（锁定镜头保留原时长）。
- 渲染成片：真实 ffmpeg 输出，展示视频、镜头数、时长、转场降级与音轨信息、下载链接。
- 清除方案；xfade 能力探测与降级提示。

---

## 2. 关键实现

| 能力 | 接口 |
|---|---|
| 音色列表 | `GET /api/dubbing/voices` |
| 单句试听 | `POST /api/dubbing/preview` |
| 生成配音 | `POST /api/dubbing/generate` |
| 保存角色音色 | `PUT /api/projects/:id`（`dialogueAssignments`） |
| 保存音量 | `PUT /api/projects/:id`（`audioConfig`） |
| 剪辑预设 | `GET /api/edit-plans/profiles` |
| 生成方案 | `POST /api/edit-plans/generate` |
| 读取 / 清除 | `GET/DELETE /api/edit-plans/:projectId` |
| 渲染 | `POST /api/edit-plans/:projectId/render` |
| 转场能力 | `GET /api/edit-plans/:projectId/transition-support` |
| BGM 列表 | `GET /api/audio/bgm` |

**不伪造数据**：后端不提供音频波形与生成进度百分比，因此时间轴只展示真实时间块，不绘制假波形；渲染与配音均为真实接口结果。

---

## 3. 真实浏览器验证

用 mock provider + 真实 ffmpeg 后端，创建 30s 横屏项目并生成 4 镜剧本，完成 2 镜：

| 检查 | 结果 |
|---|---|
| 配音页加载 | 5 个音色、2 个角色、检测到 4 句台词/旁白 |
| 生成配音 | 4 条音轨、11.5s、3 条轨道、SRT 可下载、标注“包含占位音” |
| 角色音色保存 | API `dialogueAssignments` 落库 |
| 音量保存 | 配音 70% 落库 `audioConfig.voiceVolume = 0.7` |
| 旧版音频入口 | 正常渲染旧版音频工作台；点击阶段栏“配音”返回新版 |
| 剪辑页加载 | 4 个预设、20 个 BGM 选项、xfade 可用 |
| 生成方案 | 2 镜、目标 30s、计划 30s、3 轨道、2 视频块、2 配音块 |
| 渲染成片 | 真实输出 `edit_*.mp4`：2 镜、30.0s、硬切、含音轨、可下载 |
| 375px | 配音/剪辑均无横向溢出，控制区单列 |
| 控制台 | 无 error / warning |

命令结果：

- `npm run lint`：0 error
- `npm run typecheck`：0 error
- `npm run test:web`：**20 passed**
- `npm test`：**750 passed / 0 failed**
- `npm run build`：成功（JS 572KB / gzip 176KB，CSS 33KB）

---

## 4. 未完成 / 已知限制

1. **配音高级能力仍在旧版**：BGM / 音效素材库、混音预听、字幕样式（字体/描边/位置/双语）、角色声音复刻与音色设计。
2. **配音结果不持久化**：生成结果保存在页面内存；切换阶段后需重新生成（与 legacy 行为一致）。
3. **波形**：无服务端波形数据，时间轴为真实时间块，不是波形。
4. **剪辑时间轴**：只读，不支持拖拽/裁剪/撤销（规范已标注原型差距）。
5. **渲染为同步接口**：ffmpeg 渲染期间按钮 loading，无独立进度；大项目可能等待较久。
6. **其余 7 个阶段仍为 legacy**：图片、角色、场景、AI 影评、协作、版本、项目设置。

---

## 5. 下一步

1. 迁移 E-06 图片、E-07 角色、E-08 场景。
2. 迁移 E-09 影评、E-10 协作、E-11 版本、E-12 设置，彻底移除编辑器 legacy 桥接。
3. 补配音结果持久化与波形接口（需后端支持）。
4. 路由级代码分割，降低首屏体积。
