# 前端 Phase 48 交付报告 · 领域标签与 API 文档 i18n

> 日期：2026-10-20
> 前置：`frontend-phase47-i18n-utilities.md`
> 目标：补齐静态领域标签表与 API 文档的中英切换

---

## 1. 完成范围

### 1.1 世界观类型（`WorldTab`）

14 个世界模块兜底标签支持中英：

世界规则 / 力量体系 / 律法与禁忌 / 种族物种 / 势力组织 / 重大事件 / 装备宝物 / 地域风貌 / 文化风俗 / 预言传说 / 冲突体系 / 文明体系 / 叙事特色 / 其他。

后端 schema 返回的 `label` 仍优先；没有 schema 时使用本地双语兜底。

### 1.2 创作数据（`Stats`）

- 12 种风格名：无风格 / 诺兰 / 韦斯·安德森 / 昆汀 / 王家卫 / 吉卜力 / 赛博朋克 / 极简主义 / 纪录片 / 黑色电影 / 电影感 / 干净。
- 3 种画幅：横屏 16:9 / 竖屏 9:16 / 方形 1:1。
- 未知值兜底为 `Unknown`（英文）/ `未知`（中文）。

### 1.3 API 文档（`Docs`）

- 3 个分组标题双语：项目与分镜 / 生成链路 / 小说剧场。
- 20 个端点的说明双语。
- 8 个错误码含义双语。
- 表格、鉴权说明与标题同步切换。

### 1.4 小说同步（`SyncTab`）

同步范围下拉使用双语映射（产物+文档 / 仅产物 / 全部）；后端返回的 label 作为兜底。

---

## 2. 改动文件

```
web/src/features/novel/WorldTab.tsx
web/src/features/novel/SyncTab.tsx
web/src/pages/Stats.tsx
web/src/pages/Docs.tsx
web/src/pages/Docs.test.tsx      # 新增中文 + 英文 2 条
ai/docs/frontend-phase48-domain-labels-i18n.md
```

---

## 3. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **132 passed / 0 failed**（37 files） |
| `npm run build:web` | 成功 |

### 真实浏览器验证（英文模式）

- `/docs`：标题 `API docs`；分组 `Authentication / Projects & shots / Generation pipeline / Novel theater / Error codes`；端点说明 `Create project`、`List / filter projects`；错误码 `Validation failed`。
- `/stats`：`Analytics`、`Style distribution`、`Quota` 等页面文案为英文；风格/画幅标签走双语映射。
- 中文模式保持原中文文案。

---

## 4. 未完成 / 已知限制

1. 后端返回的领域数据（世界实体名、项目风格 ID 之外的显示名）仍按原值展示。
2. `Docs` 端点清单是静态维护，后端新增端点需手动同步。
3. 数字/日期 locale 仅日期做了中英切换；`toLocaleString()` 仍跟随浏览器语言。
4. 复数形式未统一（如 `1 files`）。
5. 未做键盘与屏幕阅读器实测。

---

## 5. 下一步

1. 复数与数字/日期格式统一。
2. 静态端点清单与后端路由清单做一致性检查。
3. 键盘 / 屏幕阅读器实测。
4. 1440 / 1024 / 768 截图级视觉回归。
