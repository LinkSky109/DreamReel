# 前端 Phase 46 交付报告 · 编辑器与小说链路响应式审计

> 日期：2026-10-20
> 前置：`frontend-phase45-responsive-a11y-audit.md`
> 目标：把 Phase 45 的审计范围扩展到编辑器 12 阶段与小说剧场链路，并修复触控目标问题

---

## 1. 审计范围

- 编辑器 12 阶段：`script / shots / generate / dubbing / edit / images / characters / scenes / analysis / collab / versions / settings`
- 小说剧场：`/novels`、`/novel/:id`（通过真实接口创建并摄取两章测试小说）
- 视口：375 / 768 / 1024 / 1440
- 检查项：横向溢出、`h1` 数量、未标注表单控件、缺失 `alt`、375px 下小于 32×32 的可点击元素

---

## 2. 审计结果

| 范围 | 横向溢出 | h1 | 未标注控件 | 缺失 alt |
|---|---|---|---|---|
| 编辑器 12 阶段 | 0 | 各 1 个 | 0 | 0 |
| `/novels` | 0 | 1 | 0 | 0 |
| `/novel/:id` | 0 | 1 | 0 | 0 |
| 768 / 1024 / 1440 回归 | 0 | — | — | — |

### 发现并修复的触控目标

| 位置 | 问题 | 数量 | 修复 |
|---|---|---:|---|
| 分镜阶段筛选 chips | `.dr-chip` 28px 高 | 5 | 375px 下 `min-height: 44px` |
| 配音阶段情绪/BGM 等 chips | `.dr-chip` 28px 高 | 50 | 同上 |
| 剪辑节奏 chips | `.dr-chip` 28px 高 | 4 | 同上 |
| 场景分类 chips | `.dr-chip` 28px 高 | 6 | 同上 |
| 小说列表状态 chips | `.nv-chip` 30px 高 | 4 | 375px 下 `min-height: 44px` |
| 小说标题链接 | 高度 22px | 1 | 375px 下 44px |

修复后编辑 12 阶段、小说列表与详情在 375px 下小目标均为 **0**。

---

## 3. 改动文件

```
web/src/styles/app.css  # .dr-chip / .nv-chip / .novel-title 移动端触控尺寸
ai/docs/frontend-phase46-editor-novel-audit.md
```

---

## 4. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **129 passed / 0 failed**（36 files） |
| `npm run build:web` | 成功；静态资源复制正常 |

真实浏览器：12 个编辑器阶段逐一切换验证；小说列表/详情使用真实摄取数据；所有页面在 4 档宽度下无横向滚动。

---

## 5. 未完成 / 已知限制

1. 编辑器各阶段只审了空项目/少镜头数据，未覆盖大量镜头、长剧本、复杂时间轴。
2. 未做键盘 Tab 顺序、焦点陷阱与屏幕阅读器实测。
3. 触控尺寸仅覆盖常见 chips 与按钮，表格行内操作仍偏桌面密度。
4. 未做截图级视觉回归。
5. 审计仍为一次性浏览器脚本，尚未固化为 `scripts/` 发布前检查。

---

## 6. 下一步

1. 固化审计脚本，接入 `npm run check` 或 CI。
2. 用大数据量项目回归编辑器（100+ 镜头、长章节）。
3. 全量 i18n 文案梳理。
4. 键盘 / 屏幕阅读器实测与截图级视觉回归。
