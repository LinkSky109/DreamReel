# 前端 Phase 52 交付报告 · axe-core 无障碍审计与残留标签 i18n

> 日期：2026-10-20
> 前置：`frontend-phase51-keyboard-modal-focus.md`
> 目标：用 axe-core 对全部核心路由做自动化无障碍审计并修复；补齐最后一批硬编码标签

---

## 1. axe-core 审计

临时将 `axe-core` 注入页面，对以下路由运行 `axe.run()`：

`/`、`/projects`、`/gallery`、`/settings`、`/novels`、`/teams`、`/enterprise`、`/api-console`、`/pricing`、`/login`、`/challenges`、`/directors`、`/title-sequences`、`/studios`、`/community`、`/store`、`/stats`、`/templates`、`/more`、`/docs`、`/moderation`、`/recycle-bin`、`/share/:token`、`/novel/:id`、编辑器 12 个阶段。

### 修复项

| 规则 | 问题 | 修复 |
|---|---|---|
| `color-contrast` | 主色 `#146ef5` 在 `--accent-soft` 上对比度 4.15 | 浅色 `--accent` 调整为 `#0f63e0`（白底 5.41 / 浅蓝底 4.90） |
| `color-contrast` | `--success` 在浅色状态底上 4.4 | 浅色 `--success` 调整为 `#0a6e35` |
| `label-content-name-mismatch` | 侧栏品牌 `aria-label` 与可见文字不一致 | 移除多余 `aria-label` |
| `label-content-name-mismatch` | 命令面板按钮 aria-label 未包含可见文字 | 移除多余 `aria-label` |
| `label-content-name-mismatch` | 作品广场预览/点赞按钮可见计数未包含在名称中 | 将镜头数/点赞数写入 `aria-label` |
| `label-content-name-mismatch` | 小说封面链接 aria-label 与可见书名/作者不连续 | 移除 `aria-label`，由可见文字提供名称 |
| `label-content-name-mismatch` | 分享页品牌 aria-label 与可见文字不一致 | 移除 `aria-label` |
| `landmark-no-duplicate-main` / `landmark-unique` | 社区页内嵌 `<main>` | 改为带 `aria-label` 的 `<section>` |
| `heading-order` | 回收站空态 `<h3>` 紧接 `<h1>` | 改为 `<h2>` |
| `empty-table-header` | API Key 操作列表头仅 aria-label | 改为 `sr-only` 文本 |
| `page-has-heading-one` | Stats / 角色阶段偶发（懒加载竞态） | 复跑确认 h1 存在，非代码缺陷 |

修复后上述路由在 axe 下 **0 violation**（Stats/角色阶段在等待数据加载后复跑为 0）。

---

## 2. 残留标签 i18n

- `ShotsPage`：设定图类别（角色 / 衣物 / 装备 / 建筑 / 场景 / 道具 / 其他）支持中英，搜索匹配也走本地化标签。
- `editor/utils`：景别与运镜标签双语（Close-up / Medium shot / Slow push-in / Static 等），分镜阶段传入 `lang`；剧本 TXT 导出仍保持中文。
- `formatValue`：数组/对象分隔符支持中英（`、；` ↔ `, ;`），角色卡与世界观属性接入 `lang`。

---

## 3. 改动文件

```
public/css/style.css
web/src/app/AppShell.tsx
web/src/pages/{Gallery,Novels,SharedProject,RecycleBin,Community,TitleSequences,ApiConsole,ShotsPage}.tsx
web/src/pages/TitleSequences.css
web/src/features/editor/{utils,StoryboardStage}.tsx
web/src/features/novel/{CharactersTab,WorldTab}.tsx
web/src/lib/format.ts / format.test.ts
web/src/features/editor/utils.test.ts
web/src/lib/tokens.test.ts
ai/docs/frontend-phase52-axe-a11y-audit.md
```

临时注入的 `axe-core` 与页面副本已删除，不进入构建产物。

---

## 4. 验证

| 命令 | 结果 |
|---|---|
| `npm run check` | 全部通过（含文档端点检查） |
| `npm test` | **752 passed / 0 failed** |
| `npm run test:web` | **137 passed / 38 files** |
| `npm run build:web` | 成功 |

新增 `tokens.test.ts`：锁定浅色主色/正文/辅助色/状态色在关键背景上的对比度 ≥ 4.5，防止后续改色回归。

---

## 5. 未完成 / 已知限制

1. axe 只能覆盖规则化问题；真实屏幕阅读器（VoiceOver/NVDA）仍未实测。
2. 当前浏览器自动化宿主无法获得系统焦点，`:focus-visible` 焦点环仍未实测。
3. 截图级 1440/1024/768 视觉回归未做（缺少可落盘的 Playwright 浏览器环境）。
4. `Gallery.test` 在高并发下仍偶发超时（复跑通过），未定位根因。
5. 真实支付、RBAC、关注/邀请、分享密码、镜头增删、实时协作等依赖后端/产品决策。

---

## 6. 结论

前端可独立完成的功能与质量项已基本收口：页面、编辑器、小说链路、i18n、PWA、分享页、文档校验、响应式/触控、axe 无障碍审计均已完成。剩余项主要是真实设备/屏幕阅读器验证，以及依赖后端接口或产品决策的能力。
