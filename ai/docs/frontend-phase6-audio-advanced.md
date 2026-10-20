# 前端 Phase 6 交付报告 · 音频高级能力收尾

> 日期：2026-10-20
> 前置：`c543e52`（Phase 5 影评/协作/版本/设置）
> 状态：旧版音频工作台已迁移；编辑器不再有任何 legacy 阶段入口

---

## 1. 完成范围

### BGM / 音效库（React）

- BGM：情绪筛选、搜索、20 首内置曲目、可用性标记、试听、单选。
- SFX：分类筛选、搜索、30 个内置音效、可用性标记、试听、多选。
- **AI 推荐 BGM**：根据剧本梗概/项目名推荐情绪，自动切换筛选并选中首条推荐。

### 音频配置

- 三轨音量（配音 / BGM / 音效）、BGM 淡入淡出。
- 保存时一并写入 `bgmId`、`sfxIds`、音量与淡入淡出到 `project.audioConfig`。

### 混音预听

- 调用 `POST /api/audio/preview`，使用已保存音频配置生成真实混音文件。
- 展示音轨数、时长、占位音提示与播放器。

### 字幕样式

- 字体、字号、字体颜色、描边颜色/宽度、位置（上/中/下）。
- 粗体、斜体、阴影、双语与第二语言。
- 实时预览（与导出样式一致）；保存到 `project.subtitleStyle`。

### 移除 legacy

- 删除 `LegacyEditorStage` 与 `?tab=dubbing&legacy=1` 分支。
- 12 个编辑器阶段全部由 React 承载，不再回退旧编辑器。

---

## 2. 真实浏览器验证

30s 横屏项目 + 4 镜剧本：

| 检查 | 结果 |
|---|---|
| 音频素材 | `npm run seed:audio` 生成 20 BGM + 30 SFX |
| BGM 库 | 20 条、情绪筛选与搜索可用、试听按钮可用 |
| SFX 库 | 30 条、多选计数正确 |
| AI 推荐 | 推荐“温馨治愈”，自动选中「温暖午后」，情绪切到 warm |
| 保存音频配置 | API `audioConfig = { bgmId: "warm-01", sfxIds: ["ambient-rain"], ... }` |
| 字幕样式 | 字号 32、颜色 #ffcc00、双语开启 → API `subtitleStyle` 落库，预览同步 |
| 混音预听 | 真实生成 3 轨 / 20.0s 文件，标注包含占位音 |
| 旧版入口 | `?tab=dubbing&legacy=1` 仍渲染 React 音频页，无 `.ed-legacy-embed` |
| 375px | 无横向溢出，字幕控件单列 |
| 控制台 | 无 error / warning |

命令结果：

- `npm run lint`：0 error
- `npm run typecheck`：0 error
- `npm run test:web`：**25 passed**
- `npm test`：**750 passed / 0 failed**
- `npm run build`：成功（JS 636KB / gzip 190KB）

---

## 3. 未完成 / 已知限制

1. **预听与配音音频受保护**：`/storage/audio/previews` 需要登录凭证；匿名可生成但播放器可能 401。
2. **旧 `public/js/views/editor.js` 仍存在**：React 路由不再使用，但 legacy 页面经 `app.js` 仍会静态加载该模块，属待清理死代码。
3. **视觉风格锁 / 连续性检查**（旧版音频页附带）未纳入本轮；连续性检查有独立接口，可在后续补。
4. **首屏体积**：单包 636KB（gzip 190KB），尚未路由级拆包。
5. **AI 助手**：无流式输出；会话在服务端内存。

---

## 4. 下一步

1. 清理旧 `editor.js` / `editorTabs.js` 死代码与 `app.js` 中的编辑器导入。
2. 路由级代码分割与编辑器阶段懒加载。
3. 全局页面（工作台 / 项目库）视觉与可访问性收尾。
4. 处理匿名媒体访问策略（需产品与安全决策）。
