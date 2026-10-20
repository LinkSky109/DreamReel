# 前端 Phase 7 交付报告 · 死代码清理与路由拆包

> 日期：2026-10-20
> 前置：`c163b4b`（Phase 6 音频高级能力）
> 状态：旧编辑器代码已移除；React 路由与编辑器阶段按需加载

---

## 1. 死代码清理

删除以下不再被 React 路由使用的 legacy 模块：

| 文件 | 原因 |
|---|---|
| `public/js/app.js` | 旧 hash 路由与全局启动器；React 已接管 |
| `public/js/keyboard.js` | 仅被旧 app.js 引用 |
| `public/js/theme.js` | 仅被旧 app.js 引用；React 使用 ThemeProvider |
| `public/js/views/editor.js` | 旧编辑器（3648 行） |
| `public/js/views/editorTabs.js` | 旧编辑器阶段轨 |
| `public/js/views/images.js` | 仅旧编辑器使用 |
| `public/js/views/projectList.js` | 项目库已由 React 页面接管 |
| `public/js/views/templateMarket.js` | 模板库已由 React 页面接管 |

新增 `public/js/shared/ui.js`：

- 保留 legacy 视图仍需要的 `showToast()` 与 `refreshQuota()`；
- 更新 20 个 legacy 视图的导入；
- 移除 `stats.js` 的空导入。

其他：

- `public/sw.js`：缓存版本 `v2 → v3`，移除 `/js/app.js` 预缓存。

---

## 2. 路由级拆包

### 页面按需加载

`Dashboard`、`Projects`、`Templates`、`More`、`Docs`、`Moderation`、`SharedProject`、`EditorPage` 全部改为 `React.lazy` + `Suspense`。

### 编辑器阶段按需加载

保留核心阶段（剧本 / 分镜 / 生成）在主编辑器 chunk；以下阶段独立拆包：

- 配音、剪辑、图片、角色、场景、AI 影评、协作、版本、项目设置、AI 助手、命令面板。

### 构建结果

| 产物 | 大小 |
|---|---|
| 主包 `index-*.js` | **412.58 KB（gzip 129.95 KB）** |
| 编辑器 `EditorPage` | 34.38 KB（gzip 9.49 KB） |
| 项目库 | 19.53 KB（gzip 6.39 KB） |
| 配音阶段 | 21.05 KB（gzip 5.75 KB） |
| 其他阶段 / 页面 | 1.95–13.89 KB |

对比 Phase 6：主包 636 KB → **413 KB**；gzip 190 KB → **130 KB**。

---

## 3. 真实浏览器验证

| 检查 | 结果 |
|---|---|
| 工作台 / 项目库 / 模板 / 文档 / 审核 | 懒加载正常，无空白 |
| 编辑器首屏 | 直接打开 `?tab=script` 正常 |
| 懒加载阶段 | 配音（含 BGM/SFX/字幕）、AI 影评均按需加载并渲染 |
| 命令面板 | ⌘K 打开，21 项结果 |
| legacy 页面 | 小说剧场、作品广场正常（新 `shared/ui.js` 导入） |
| Service Worker | v3 激活，无 app.js 预缓存失败 |
| 控制台 | 无 error / warning |

命令结果：

- `npm run lint`：0 error
- `npm run typecheck`：0 error
- `npm run test:web`：**25 passed**
- `npm test`：**750 passed / 0 failed**
- `npm run build`：成功（主包 gzip 130 KB）

---

## 4. 未完成 / 已知限制

1. **legacy 页面仍为原生 ESM**：小说、挑战、导演、片头、剧场、社区、商城、团队、企业、API、广场、统计、定价、设置、回收站、登录等仍通过 `LegacyView` 挂载，未参与 Vite 打包与拆包。
2. **i18n 中残留 `editorTabs` 文案键**（旧编辑器使用），不影响运行。
3. **主包仍包含 Radix / Lucide 的公共依赖**（gzip 130 KB），可继续按组件拆包。
4. **匿名媒体访问**仍受保护，需产品与安全决策。
5. **工作台 / 项目库**已 React 化，但视觉与可访问性收尾未逐项核对。

---

## 5. 下一步

1. 逐步迁移剩余 legacy 页面（建议从小说剧场与设置开始），最终移除 `LegacyView`。
2. 进一步拆分 Radix/Lucide，评估首屏依赖。
3. 全局可访问性与响应式回归（375/768/1024/1440）。
4. 处理匿名媒体访问策略与分享页独立布局。
