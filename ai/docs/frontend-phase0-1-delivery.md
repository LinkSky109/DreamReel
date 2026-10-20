# 前端 Phase 0–1 交付报告

> 日期：2026-10-20
> 基线：`ceffb99`
> 规范：`FRONTEND-DEVELOPMENT.md` v1.1 + `AGENT-HANDOFF.md`
> 状态：Phase 0 完成；Phase 1 完成可运行闭环，编辑器仍为 legacy 桥接

---

## 1. 技术决策

| 项 | 选择 | 原因 |
|---|---|---|
| 框架 | React 19 + TypeScript + Vite 8 | 规范 §3.2 推荐；现代构建与类型约束 |
| 路由 | React Router 7（HashRouter） | 保持 `#/` 链接、legacy 跳转与现有 deep link 兼容 |
| 数据层 | TanStack Query 5 | 缓存、重试、失效与 loading/error 状态统一 |
| UI 组件 | Radix UI（Dialog / Dropdown / Tooltip / Tabs / Select / Checkbox / Switch / Separator） | 无障碍与交互交给成熟无头组件，视觉仍走规范令牌 |
| 命令面板 | cmdk | 键盘导航、过滤、分组开箱可用 |
| Toast | Sonner | 统一反馈、自动消失 |
| 图标 | Lucide React（strokeWidth 1.75） | 满足 §5.5 的 24×24 / 1.75px 线性规范，避免 emoji |
| 迁移策略 | Strangler（新外壳 + legacy 视图桥接） | 不一次性重写 18k 行前端，保证现有功能不断档 |

**没有引入第二套设计系统**：`public/css/style.css` 的令牌层被改写为规范值（浅色默认、深色覆盖），React 与 legacy 共用同一组 CSS 变量。

---

## 2. 完成范围

### Phase 0 — 基础层

- **设计令牌**：规范 §5.2–5.4 的颜色、字体、圆角、阴影、动效、焦点环、`prefers-reduced-motion`；浅色为默认，深色为 `body:not(.light-theme)` 覆盖。
- **App Shell**：240px 侧栏 + 60px 顶栏；四组导航（创作 / 创作工具 / 商业与团队 / 发现与账户）；小说剧场带“核心”标记；移动端 5 项底部导航。
- **顶栏**：面包屑、⌘K 搜索入口、额度、帮助、通知（真实接口）、主题、语言、新建项目、登录/用户。
- **图标**：新增 `public/icons/sprite.svg`；React 侧使用 Lucide（1.75px）。Shell 与编辑器阶段轨已无 emoji。
- **路由**：
  - 新增 `/projects`、`/more`、`/docs`、`/moderation`；
  - 别名 `#/editor/:id → #/project/:id`、`/developer → /api-console`、`/marketplace → /store`；
  - 同一路径重复点击强制重渲染；
  - 路由级错误边界 + 404 页（重试 / 返回工作台）；
  - 路由切换滚动复位、关闭移动抽屉与通知面板。
- **弹层 / Toast / 命令面板**：Radix Dialog（焦点陷阱、Esc、焦点归还）、Sonner、cmdk（页面 / 项目 / 动作分组）。

### Phase 1 — 核心闭环

- **P-01 工作台**：继续创作主卡（唯一主 CTA）、制作队列、三项统计、最近项目、模板横条；空 / 加载 / 错误态齐全。
- **P-04 项目库**：搜索、状态、收藏、归档、排序写入 URL；批量收藏 / 归档 / 删除（二次确认）；导入 JSON；导出 JSON；复制；卡片菜单。
- **P-05 模板库**：分类 + 搜索；使用模板 → 预填新建弹层。
- **新建项目**：名称 / 一句话创意 / 时长 / 画幅；必填校验；创建后进入 `#/project/:id`；刷新后仍在。
- **E-00/E-03**：编辑器阶段固定为 **5 + 7 = 12**（剧本 / 分镜 / 生成 / 配音 / 剪辑 + 图片 / 角色 / 场景 / AI 影评 / 协作 / 版本 / 项目设置）；新增“生成”队列，状态与分镜同源，生成中每 2s 轮询到终态。
- **E-02 比例**：镜头预览按项目画幅渲染，实测 9:16 = 320×569；16:9 默认。
- **P-19 / P-20 / P-24**：API 文档、内容审核（真实审核接口 + 留痕）、全部功能索引。
- **剩余页面**：通过 `LegacyView` 桥接，全部路由可达。

---

## 3. 改动文件

**新增（React 应用）**

```
web/index.html
web/vite.config.ts
web/tsconfig.json
web/src/main.tsx
web/src/app/{App,AppShell,ErrorBoundary,nav}.tsx|ts
web/src/components/{Icon,Modal,CommandPalette}.tsx
web/src/domain/types.ts
web/src/features/legacy/LegacyView.tsx
web/src/lib/{api,format,i18n,theme,toast}.ts(x)
web/src/pages/{Dashboard,Projects,Templates,More,Docs,Moderation,NotFound,Logout}.tsx
web/src/styles/app.css
web/src/test/setup.ts
web/src/**/*.test.{ts,tsx}
public/icons/sprite.svg
scripts/clean-web-build.js
ai/docs/frontend-phase0-1-audit.md
```

**修改**

- `public/index.html`：由 Vite 构建生成（React 入口 + 共享令牌样式）。
- `public/css/style.css`：令牌层改为规范值；新增间距 / 字号 / 焦点 / reduced-motion；镜头预览比例变量。
- `public/js/app.js`：legacy 启动逻辑收口到 `bootLegacy()`，导入不再产生路由副作用。
- `public/js/theme.js`：浅色默认。
- `public/js/views/editorTabs.js`：12 阶段 + SVG 图标。
- `public/js/views/editor.js`：新增“生成”队列与轮询；画幅比例；`aspectRatioOf`。
- `public/js/keyboard.js`：数字键与 12 阶段对齐。
- `package.json` / `package-lock.json` / `README.md` / `.gitignore`。

---

## 4. 实际运行与验证

| 命令 | 结果 |
|---|---|
| `npm run lint` | 0 error |
| `npm run typecheck` | 0 error |
| `npm test` | **750 passed / 0 failed**（105 suites） |
| `npm run test:web` | **9 passed / 0 failed**（3 files） |
| `npm run build` | 成功：`index-*.js` 517KB（gzip 162KB）+ CSS 19KB |

**真实浏览器验证**（`npm start` + 内置 mock provider，非 mock 断言）：

- 23 条路由逐条打开：全部渲染，无横向滚动；未知路由显示 404。
- 核心闭环：新建项目 → 生成剧本（4 镜）→ 分镜 → 生成第 1 镜 → 队列自动从“生成中”变为“已完成” → 刷新后项目与镜头仍在。
- 内容审核：真实调用 `/api/moderation/check`，返回“通过 / 未命中违禁分类”，留痕表更新。
- 命令面板：⌘K 打开、输入“小说”过滤到 2 项、Esc 关闭。
- 主题：浅色 `#ffffff` ↔ 深色 `#0b0c0f`；语言：中文 ↔ English（导航 / 顶栏）。
- 视口：375 / 768 / 1200 / 1440 无横向溢出；375 底部导航可用，抽屉可开合。
- 控制台：无 error / warning。

---

## 5. 未完成项（如实）

1. **编辑器仍是 legacy 桥接**：E-00 的规范 Shell（顶栏阶段轨、右侧检查器、状态栏）与 E-01/E-02 的 React 重写未完成；当前保留现有 12 阶段能力与数据链路。这是 Phase 2 的第一优先级。
2. **小说工作台 P-03**：章节阅读、八类角色卡、14 世界观模块、字段级审校、段落标记、转为分镜仍未实现（仓库现为“生产流水线”形态）。属 Phase 3。
3. **legacy 页面仍有 emoji 与旧间距**：挑战、导演、片头、剧场、社区、商城、团队、企业、API、广场、统计、定价、设置、回收站、登录等页面尚未逐个视觉对齐；Shell 与新页面已对齐。
4. **i18n 覆盖范围**：仅 Shell 导航 / 顶栏 / 新页面标题与按钮；legacy 页面正文仍为中文。
5. **字号**：规范正文 16px，legacy 仍 14px、React 为 15px；未做全站放大（避免破坏既有密集布局）。
6. **P-20 处置动作**：后端只有 `check` 与 `logs`，没有“通过 / 隐藏”接口，页面明确说明并只提供真实审核动作。
7. **PWA**：仍沿用 legacy manifest / service worker；未做版本化缓存策略升级。
8. **首屏体积**：单包 517KB（gzip 162KB），尚未按路由拆分。

---

## 6. 风险与缓解

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| legacy 桥接的 document 级监听器重复 | 同一路径反复重渲染 / 多次进入编辑器 | 编辑器状态以服务端为准；Phase 2 迁移时移除监听器 |
| 构建产物与源码不一致 | 修改 `web/` 后未重新 `npm run build` | `npm run build` 有 `prebuild` 清理；README 已写明 |
| 桥接页面依赖 `#app` 容器 | legacy 内部按 id 查找 | `LegacyView` 固定提供 `id="app"` |
| 路由兼容 | 旧链接 `#/editor/:id` | 已做重定向，通知与模板跳转不再死链 |

---

## 7. 下一步

1. **Phase 2**：React 重写编辑器 Shell + 剧本 + 分镜（检查器、比例、锁定、版本），移除 editor legacy 桥接。
2. **Phase 2 续**：生成 / 配音 / 剪辑 / 图片 / 角色 / 场景迁移。
3. **Phase 3**：小说工作台审校与“转为分镜”。
4. **Phase 4–5**：剩余页面视觉与 emoji 清理、全量 i18n、可访问性审计、PWA 与代码分割。
