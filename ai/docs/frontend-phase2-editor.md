# 前端 Phase 2 交付报告 · 编辑器 React 化

> 日期：2026-10-20
> 前置：Phase 0–1（`c09f54a`）
> 状态：E-00 Shell / E-01 剧本 / E-02 分镜 / E-03 生成 已迁移；其余 9 个阶段保留 legacy 能力

---

## 1. 完成范围

| 规范项 | 现状 |
|---|---|
| E-00 编辑器 Shell | React：返回、项目名、保存状态、预览、分享、导出成片、更多菜单、12 阶段轨、状态栏 |
| E-01 剧本 | React：一句话生成、梗概、角色、场次编辑、添加/删除场次、800ms 防抖自动保存、手动保存、导出 TXT |
| E-02 分镜 | React：状态筛选、风格选择、批量生成、3/2/1 列故事板、镜头检查器、编辑描述/时长/对白/旁白、锁定、版本切换、←/→ 选镜 |
| E-03 生成 | React：四项统计、全镜头队列、单镜生成/重生成、批量生成、生成中自动轮询 |
| E-04…E-12 | 通过 `LegacyEditorStage` 复用旧编辑器能力；隐藏旧页头与标签栏，由 React Shell 统一承载 |
| 画幅 | 分镜卡片与检查器按项目画幅（16:9 / 9:16），实测竖屏为 9:16 |
| 响应式 | ≤1023px 检查器变底部面板 + 遮罩；375px 无横向溢出 |

---

## 2. 关键实现

### 数据与轮询

- `GET /api/projects/:id` 作为唯一数据源；TanStack Query `refetchInterval` 在存在 `status === 'generating'` 镜头时每 2s 轮询，进入终态自动停止。
- 剧本保存：`PUT /api/projects/:id` 的 `script` 字段（后端 `updateProject` 白名单允许）。
- 镜头字段保存：`PUT /api/video/shots/:shotId`（description / duration / dialogue / narration）。
- 锁定：`PUT /api/video/shots/:shotId/lock`。
- 版本切换：`POST /api/video/shots/:shotId/version/:index`。
- 生成：`POST /api/video/generate`、`POST /api/video/regenerate`、`POST /api/video/generate-all/:projectId`。
- 导出：`POST /api/export/project/:projectId`（后端 202 异步，前端如实提示“任务已提交”）。

### 交互细节

- 检查器字段：700ms 防抖自动保存 + 失焦立即保存；锁定镜头只读。
- 生成中没有伪造百分比：使用不确定进度条 + “完成后自动刷新”（后端队列不返回进度）。
- 未迁移阶段切换：legacy 编辑器只挂载一次，后续通过 `editor-tab-*` 事件切换，避免重复加载。
- 旧链接兼容：`?tab=video/audio/generation` 等别名统一映射到新阶段。

---

## 3. 真实浏览器验证

用 mock provider + 真实后端，创建竖屏项目并完成：

| 检查 | 结果 |
|---|---|
| 12 阶段可达、顺序正确 | 通过 |
| 一句话生成剧本 | 4 场、2 角色，梗概与场次渲染 |
| 剧本编辑自动保存 | 输入后 1.6s，`GET /projects/:id` 读到新文本，状态“已保存” |
| 分镜检查器 | 4 张卡、检查器默认选中 S01、9:16 比例 |
| 检查器编辑保存 | 自动保存后 API 读到新描述 |
| 锁定镜头 | API `locked=true`，描述输入框禁用，按钮变“已锁定” |
| 单镜生成 | 启动后轮询，卡片由“生成中”自动变“已完成” |
| 生成页 | 统计 3/0/1/0，队列 4 行，批量按钮显示可生成数 |
| legacy 阶段（配音） | 内容正常，旧页头/侧栏隐藏，仅一个挂载点 |
| legacy 阶段切换（设置） | 内容切换、`aria-current` 正确、无重复挂载 |
| 375px 检查器 | 底部面板可打开，有遮罩，无横向溢出 |
| 控制台 | 无 error / warning |

命令结果：

- `npm run lint`：0 error
- `npm run typecheck`：0 error
- `npm run test:web`：**15 passed**
- `npm test`：**750 passed / 0 failed**
- `npm run build`：成功（JS 552KB / gzip 171KB，CSS 29KB）

---

## 4. 未完成 / 已知限制

1. **AI 助手**：E-00 右下助手面板尚未迁移；legacy 编辑器中仍有，但被 Shell 隐藏。
2. **镜头结构编辑**：后端 `PUT /api/video/shots/:shotId` 只接受 description/duration/dialogue/narration；机位、运动、景别目前只读。需要后端扩展字段。
3. **添加 / 删除镜头**：没有对应 API；分镜页未提供该动作。
4. **版本**：仅支持切换历史版本，不支持保存版本 / 对比 / 回滚（legacy 版本页仍可用）。
5. **其余 9 个阶段仍是 legacy**：配音、剪辑、图片、角色、场景、AI 影评、协作、版本、项目设置；视觉与 emoji 尚未逐个对齐。
6. **生成进度**：后端队列不返回百分比，UI 使用不确定进度，不伪造数值。
7. **首屏体积**：单包 552KB（gzip 171KB），尚未按路由/编辑器拆包。

---

## 5. 下一步

1. 迁移 E-04 配音、E-05 剪辑（交互最重、legacy 依赖最多）。
2. 迁移 E-06…E-12，逐页清理 emoji 与旧间距。
3. 补 AI 助手面板（`/api/ai-assistant/*`）。
4. 与后端对齐：镜头增删、机位/景别编辑、生成进度、版本保存/回滚。
5. 路由级代码分割，降低首屏体积。
