# 前端 Phase 45 交付报告 · 响应式与可访问性审计

> 日期：2026-10-20
> 前置：`frontend-phase44-pwa-cache.md`
> 目标：对核心路由做 375 / 768 / 1024 / 1440 的自动化检查，修复发现的问题

---

## 1. 审计方法

在真实浏览器中创建与目标宽度一致的 iframe，逐路由加载后检查：

- `documentElement.scrollWidth - innerWidth`（横向溢出）
- `h1` 数量（每页一个）
- `img:not([alt])`（缺失 alt）
- `input / select / textarea` 是否有 `label` / `aria-label` / `aria-labelledby` / 包裹 label
- `button / a[href]` 的可访问名称
- 375px 下可点击元素尺寸是否小于 32×32
- 浅色 / 深色下关键文字与背景的对比度

审计路由：`/`、`/projects`、`/novels`、`/gallery`、`/settings`、`/teams`、`/api-console`、`/pricing`、`/login`、`/project/:id`。

---

## 2. 审计结果

### 2.1 已通过

- 10 个核心路由在 375 / 768 / 1024 / 1440 下 **无横向溢出**。
- 每个页面 **恰好 1 个 h1**。
- 无缺失 `alt` 的图片。
- 无未命名按钮 / 链接。
- 深色主题关键文字对比度 6.87–17.62；浅色 6.90–20.03，均高于 4.5:1。

### 2.2 发现并修复

| 问题 | 位置 | 修复 |
|---|---|---|
| 导入 JSON 的隐藏 file input 无标签 | `Projects.tsx` | 增加 `aria-label="导入项目 JSON"` |
| 项目标题按钮命中区仅 18px 高 | `Projects.tsx` | 新增 `.dr-project-open`，移动端 44px |
| 收藏星 26×26 | `Projects.css/app.css` | 375px 下 44×44 |
| 状态 chips 30px 高 | `app.css` | 375px 下 44px |
| 项目库小目标 10 个 | `/projects` | 修复后 0 |
| 画廊分类 chips 30px、作者链接 22px、点赞 27×22 | `Gallery` | 移动端 ≥44px；修复后 0 |
| 设置页 Webhook 操作按钮 28px、分区导航 31px | `Settings` | 移动端 40/44px；修复后 0 |
| API Key 吊销按钮 28px | `ApiConsole` | 移动端 40px；修复后 0 |
| 定价月付/年付切换 30px | `Pricing` | 移动端 44px；修复后 0 |
| 登录/注册分段 30px | `Login` | 移动端 44px；修复后 0 |
| 「去登录」文字链接 36×14 | `Settings` | 新增 `.dr-inline-link`，移动端 44px |

### 2.3 修复后小目标统计（375px）

| 路由 | 修复前 | 修复后 |
|---|---:|---:|
| `/projects` | 10 | 0 |
| `/gallery` | 10 | 0 |
| `/settings` | 12 | 0 |
| `/api-console` | 1 | 0 |
| `/pricing` | 2 | 0 |
| `/login` | 2 | 0 |
| `/teams` | 0 | 0 |
| `/project/:id` | 0 | 0 |

---

## 3. 改动文件

```
web/src/pages/Projects.tsx    # 导入 input aria-label、标题按钮 class
web/src/pages/Settings.tsx    # 去登录链接 class
web/src/styles/app.css        # 移动端触控尺寸、项目标题按钮
ai/docs/frontend-phase45-responsive-a11y-audit.md
```

---

## 4. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **129 passed / 0 failed**（36 files） |
| `npm run build:web` | 成功；主包 gzip 约 133 KB |

---

## 5. 未完成 / 已知限制

1. 只审计了 10 个核心路由，未覆盖小说详情、编辑器全部 12 个阶段、回收站、社区、剧场、商城。
2. 图标按钮在移动端统一为 40px（非严格 44px），以保留顶栏与密集工具栏布局；文字按钮与 chips 为 44px。
3. 未做完整键盘 Tab 顺序与屏幕阅读器实测；仅覆盖可访问名称与尺寸。
4. 未加入触控尺寸的自动化回归测试（当前依赖审计脚本）。
5. 未做 768 / 1024 的截图级视觉对照。

---

## 6. 下一步

1. 把审计脚本固化到 `scripts/`，作为发布前检查。
2. 扩展审计到小说详情、编辑器阶段与剩余列表页。
3. 全量 i18n 文案梳理（含后端返回状态码）。
4. 键盘与屏幕阅读器实测。
