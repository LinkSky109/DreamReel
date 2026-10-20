# 前端 Phase 47 交付报告 · 共享格式化函数 i18n

> 日期：2026-10-20
> 前置：`frontend-phase46-editor-novel-audit.md`
> 目标：让状态、相对时间、日期与画幅文案跟随中英切换，而不是只在页面标题层生效

---

## 1. 完成范围

### 1.1 `lib/format.ts` 双语化

| 函数 | 变更 |
|---|---|
| `relativeTime(iso, lang)` | 刚刚 / 分钟 / 小时 / 天 / 日期，支持 `Just now`、`2 min ago`、`1 h ago`、`3 d ago` |
| `statusLabel(status, lang)` | 7 种状态中英映射：未开始 / 草稿 / 制作中 / 已完成 / 待生成 / 生成中 / 需重试 |
| `platformLabel(platform, lang)` | `9:16 竖屏` / `9:16 Portrait`、`16:9 横屏` / `16:9 Landscape` |
| `formatDate(value, lang)` | 中文长日期 / 英文短日期（含 weekday） |

默认参数为 `'zh'`，未改造的调用方行为不变。

### 1.2 调用方接入 `lang`

以下 14 个文件在已有 `useLang()` 基础上传入 `lang`：

`AppShell`、`EditorPage`（`ShotStatus`）、`CollaborationStage`、`StoryboardStage`、`AnalysisStage`、`VersionsStage`、`GenerateStage`、`Projects`、`Dashboard`、`Moderation`、`Community`、`RecycleBin`、`SharedProject`、`Stats`。

---

## 2. 改动文件

```
web/src/lib/format.ts          # 双语状态/时间/日期/画幅
web/src/lib/format.test.ts     # 新增英文断言
web/src/app/AppShell.tsx
web/src/features/editor/{EditorPage,CollaborationStage,StoryboardStage,AnalysisStage,VersionsStage,GenerateStage}.tsx
web/src/pages/{Projects,Dashboard,Moderation,Community,RecycleBin,SharedProject,Stats}.tsx
ai/docs/frontend-phase47-i18n-utilities.md
```

---

## 3. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **130 passed / 0 failed**（36 files） |
| `npm run build:web` | 成功 |

### 真实浏览器验证（英文模式）

设置 `dreamreel_lang=en` 后：

- `/projects`：标题 `Projects`；状态 `Not started`；相对时间 `1 h ago`；页面内不再出现「制作中 / 未开始 / 已完成」。
- `/settings`：`Settings`、`Workspace / Defaults / Notifications / Models & system / Runtime / Webhooks / Plan & quota`。
- 编辑器分镜：阶段轨 `Script / Storyboard / Generate / Dubbing / Edit …`，顶栏 `Saved / Preview / Share / Export`。
- `/novels`：`Novel Theater`。
- 中文模式（默认）仍显示原中文文案。

---

## 4. 未完成 / 已知限制

1. 后端返回的状态码/动作码（如审计 `enterprise.config.update`）按原值展示。
2. 部分领域数据表仍只有中文标签：`WorldTab` 世界类型、`Stats` 风格名、`Docs` 端点说明、`SyncTab` 同步提示。
3. 用户内容（项目名、小说名、角色名）不翻译，属于预期行为。
4. 日期/数字格式未按浏览器 locale 全面本地化，仅日期做了中英切换。
5. 未做复数形式（如 `1 shot` / `2 shots`）统一处理。

---

## 5. 下一步

1. 领域标签表双语化（世界类型、风格名、同步提示）。
2. `Docs` 端点说明与错误码文案。
3. 复数与数字格式统一。
4. 键盘 / 屏幕阅读器实测与截图级视觉回归。
