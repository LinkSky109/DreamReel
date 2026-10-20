# 前端 Phase 51 交付报告 · 键盘导航与弹层焦点归还

> 日期：2026-10-20
> 前置：`frontend-phase50-docs-endpoint-check.md`
> 目标：补齐跳转到主内容、弹层关闭后的焦点归还，并审计键盘可达性

---

## 1. 完成范围

### 1.1 Skip to content

- `AppShell` 顶部新增「跳到主内容 / Skip to content」链接。
- 链接默认移出视口，`:focus / :focus-visible` 时固定在左上角。
- 点击后聚焦 `#main-content`（`<main tabIndex={-1}>`），绕过多达 19 个侧栏链接。

### 1.2 弹层焦点归还

问题：`Modal` 使用受控 `Dialog.Content`（没有 `Dialog.Trigger`），Radix 无法自动把焦点还给打开它的按钮；关闭后焦点落在 `body`。

修复：

- `Modal` 在关闭状态监听 `focusin`，记录最后一个位于 dialog 之外的焦点元素。
- `open → false` 时通过 `requestAnimationFrame` 把焦点还给该元素。
- 关闭按钮 `aria-label` 改为中英双语（`关闭 / Close`）。
- 新增单测：打开 → Esc 关闭 → 焦点回到触发按钮。

### 1.3 快捷键语义

- 顶栏命令面板按钮增加 `aria-keyshortcuts="Meta+K Control+K"`。
- 保留全局 ⌘K / Ctrl+K 与 `?` 帮助快捷键。

---

## 2. 改动文件

```
web/src/components/Modal.tsx
web/src/components/Modal.test.tsx
web/src/app/AppShell.tsx
web/src/styles/app.css
ai/docs/frontend-phase51-keyboard-modal-focus.md
```

---

## 3. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run check` | 全部通过（含文档端点检查） |
| `npm test` | **752 passed / 0 failed** |
| `npm run test:web` | **133 passed / 37 files** |
| `npm run build:web` | 成功 |

### 真实浏览器

- 首屏 Tab 顺序第一个元素为 `Skip to content`。
- 打开「新建项目」弹层后，焦点自动落在关闭按钮，且位于 `[role="dialog"]` 内。
- Esc 可关闭弹层。
- 浏览器自动化宿主在会话中途断开，未能完成真实浏览器的「关闭后焦点归还」观测；该项由 `Modal.test.tsx` 覆盖（`document.activeElement === trigger`）。

---

## 4. 未完成 / 已知限制

1. 当前浏览器自动化窗口无法获得系统焦点，`matches(':focus-visible')` 恒为 false，未能实测焦点环对比度。
2. 未做屏幕阅读器（VoiceOver/NVDA）实测。
3. 弹层焦点归还依赖 `focusin` 记录；若弹层由纯程序调用打开且此前没有任何焦点元素，则回退到不归还。
4. `Gallery.test.tsx` 在高并发跑全量测试时出现过一次超时，单跑与复跑均通过；建议后续加测试级重试或减少共享 QueryClient 竞争。
5. 未实现焦点陷阱的自定义边界（依赖 Radix 默认行为）。

---

## 5. 下一步

1. 屏幕阅读器实测与焦点环截图复核。
2. 全站 Tab 顺序快照（每页前 20 个可聚焦元素）。
3. 1440 / 1024 / 768 截图级视觉回归。
4. 稳定化测试：排查 Gallery 测试的并发超时。
