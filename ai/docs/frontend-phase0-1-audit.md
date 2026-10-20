# 前端 Phase 0–1 开工审计

> 依据：`AGENT-HANDOFF.md`、`FRONTEND-DEVELOPMENT.md` v1.1
> 方式：只读审计 + 基线实测（未改业务代码前完成）
> 基线提交：`ceffb99`

---

## 1. 技术栈与命令（实测）

| 项 | 现状 |
|---|---|
| 运行时 | Node.js v22.23.3 |
| 后端 | Express 4（`src/server.js`），REST `/api/*` |
| 前端 | 零构建 Vanilla ES Modules + hash 路由（`public/`），无框架、无类型系统 |
| 包管理器 | npm（`package-lock.json`） |
| 启动 | `npm start`（:3000）；前端独立：`npm run dev:frontend`（:5173） |
| 构建 | 无构建步骤 |
| 测试 | `npm test` → `node:test`，隔离 storage + 强制 mock provider |
| 类型检查 | 无（项目无 TypeScript） |
| Lint | `npm run lint`（eslint 9） |

基线结果（2026-10-20 实测）：

- `npm run lint`：0 error
- `npm test`：**750 passed / 0 failed**（105 suites，57.4s），测试隔离校验通过
- `npm start`：需 `JWT_SECRET`（≥32 字符），缺省直接退出；补齐后 :3000 正常

> 说明：后端接口是 `/api/projects` 等真实路由，与规范第 11 节的建议契约 `/api/v1` 不一致。按交接单边界，**以后端为准**，前端不另造 `/api/v1` 层。

---

## 2. 路由差距矩阵

状态：已有 / 部分 / 缺失。“目标”均指规范冻结的页面形态，不是新增一级导航。

| ID | 规范路由 | 仓库现状 | 目标 | 依赖接口 | 风险 |
|---|---|---|---|---|---|
| P-01 | `#/` | **部分**：默认分支渲染项目库（带 Hero），无工作台 | 新增工作台视图（继续创作/队列/统计/最近项目/模板） | `GET /projects`, `/projects/recent`, `/templates`, `/quota` | 与项目库共用默认路由，需拆 `#/projects` |
| P-02 | `#/novels` | 已有：书目列表 + 生产流水线 | 保留能力，视觉对齐规范 | `GET /novels` | 现有页面语义是“生产流水线”，与规范“改编工作台”不同，需 Phase 3 收敛 |
| P-03 | `#/novel/:id` | **部分**：阶段式生产页（来源/角色/世界观/分集/资产/成片/同步） | 章节阅读 + 八类角色卡 + 14 世界观模块 + 审校 + 转分镜 | `/novels/:id`, `/extract`, `/review`, `/adapt` | 缺审校状态机与“转为分镜”，无法在 Phase 1 完成 |
| P-04 | `#/projects` | **缺失**（仅默认路由） | 独立项目库路由，保留筛选/收藏/归档/批量/导入 | `/projects*` | 与 P-01 拆分后需改所有“返回列表”链接 |
| P-05 | `#/templates` | 已有（模板市场） | 保留，入口对齐 | `/templates` | `#/editor/:id` 跳转是死链（见 E-00） |
| P-06 | `#/challenges` | 已有 | 保留 | `/challenges` | — |
| P-07 | `#/directors` | 已有 | 保留 | `/directors` | — |
| P-08 | `#/title-sequences` | 已有 | 保留 | 前端/项目接口 | — |
| P-09 | `#/studios` | 已有（含 `/studio/:id`） | 保留 | `/studios` | — |
| P-10 | `#/community` | 已有 | 保留 | `/community/*` | — |
| P-11 | `#/store` | 已有 | 保留 | `/store/*` | — |
| P-12 | `#/teams` | 已有（含 `/team/:id`） | 保留 | `/teams` | — |
| P-13 | `#/enterprise` | 已有 | 保留 | `/enterprise/*` | — |
| P-14 | `#/api-console` | 已有（含 `/developer` 别名） | 保留 | `/api-keys*` | — |
| P-15 | `#/gallery` | 已有 | 保留 | `/gallery` | — |
| P-16 | `#/creator/:name` | 已有 | 保留 | `/creators/:name` | — |
| P-17 | `#/stats` | 已有 | 保留 | `/stats` | — |
| P-18 | `#/pricing` | 已有（顶栏入口） | 保留；不新增侧栏一级 | `/plans` | — |
| P-19 | `#/docs` | **缺失** | 新增文档页（与 API 开发者一致） | 静态 + `/api-keys` | 需新视图 |
| P-20 | `#/moderation` | **缺失** | 新增审核队列页 | `/moderation*` | 后端是否存在待确认，缺失时明确 mock |
| P-21 | `#/settings` | 已有 | 保留，补 Provider/主题/语言 | `/settings` | — |
| P-22 | `#/recycle-bin` | 已有 | 保留 | `/projects/recycle-bin*` | — |
| P-23 | `#/login` | 已有 | 保留 | `/auth/*` | — |
| P-24 | `#/more` | **缺失** | 新增全部功能索引（移动端） | 无 | 需与侧栏路由一致 |
| E-00 | `#/project/:id` | 已有（`#/project/:id` 进入编辑器） | 12 阶段 Shell + 检查器 + AI 助手 | `/projects/:id` | `#/editor/:id` 有 2 处死链 |

### 路由层缺陷（规范 4.3 硬要求）

| 规则 | 现状 | 影响 |
|---|---|---|
| 站内链接统一 `navigate()` | 不存在；各处直接 `location.hash =` | 无法统一关闭弹层/缓存状态 |
| 同 hash 重渲染 | 只监听 `hashchange`，同 hash 不触发 | 重复点击当前入口无反应 |
| 渲染错误边界 | 无；同步异常会中断 router | 可能残留上一页 |
| 资源缓存失效 | `index.html` 无 `?v=` / 内容哈希 | 可能加载旧脚本 |
| `#/editor/:id` | router 无此分支 → 落到项目库 | **现有死链**：通知跳转、模板创建后跳转 |

---

## 3. 核心链路差距

### 3.1 编辑器 12 阶段

现状：5 个一级 tab 为 剧本 / 图片 / 分镜 / 配音 / 剪辑；6 个扩展为 角色 / 场景 / 影评 / 协作 / 版本 / 设置。共 **11** 个。

| 规范阶段 | 现状 | 差距 |
|---|---|---|
| E-00 Shell | 有页面头 + 左侧 tab + 内容区 | 非规范 Shell：无顶栏阶段轨、无状态栏、无右侧检查器；AI 助手已有 |
| E-01 剧本 | 已有（生成/编辑/导出） | 无场次大纲栏、无“来源：小说”标注 |
| E-02 分镜 | 已有（时间轴 + 镜头列表 + 生成/锁定/版本） | 无右侧检查器；预览比例固定 16:9（`style.css:5468/5556`，`editor.js:1323` 仅两态） |
| E-03 生成 | **缺失独立阶段**（能力在分镜内） | 需新增队列视图并复用生成 API |
| E-04 配音 | 已有（三轨/音色/试听） | 波形为占位 |
| E-05 剪辑 | 已有（方案/渲染） | 无拖拽时间轴 |
| E-06 图片 | 已有 | — |
| E-07 角色 | 已有（锁定/一致性） | — |
| E-08 场景 | 已有 | — |
| E-09 影评 | 已有 | — |
| E-10 协作 | 已有 | — |
| E-11 版本 | 已有 | 项目级，非镜头级 |
| E-12 设置 | 已有 | — |

### 3.2 小说剧场链路

| 能力 | 现状 |
|---|---|
| 导入/切章 | 有（导入后自动切章） |
| 角色/世界观抽取 | 有（备选/选定/锁定、置信度、时间线） |
| 审校（待审/已确认/需修订 + 字段级） | **缺失**（只有选定/锁定，无审校状态机） |
| 段落素材标记 | **缺失** |
| 转为分镜（选章/角色/镜头数 → 创建项目 → 跳编辑器） | **缺失**（现为“分集 → 剧本 → 资产 → 成片”流水线） |
| 编辑器标注来源 | **缺失** |

结论：小说“生产流水线”已成型，但规范 P-03 的“改编审校工作台”是另一套交互，属 Phase 3，不能在 Phase 1 冒进替换。

### 3.3 项目库

| 能力 | 现状 |
|---|---|
| 搜索/状态/风格/排序 | 有 |
| 收藏/归档 | 有（API + UI） |
| 批量收藏/归档/删除 | 有 |
| 导入 JSON | 有；导出走 `GET /projects/:id/export` |
| 标签编辑 | 有（编辑器内） |
| 版本历史 | 无（仅编辑器版本 tab） |
| 首帧封面 | 有生成入口（`/thumbnail`） |
| 筛选写入 URL | **缺失**（刷新丢失） |

---

## 4. Phase 0–1 任务拆分

### Phase 0（基础层）

| 任务 | 涉及文件 | 验收 |
|---|---|---|
| 设计令牌：颜色/字体/圆角/阴影/动效/焦点，浅色默认 | `public/css/style.css`、`public/index.html`、`public/js/theme.js` | 无紫色/玻璃拟态；主色每屏 ≤2 处；浅深切换正常 |
| App Shell：4 组侧栏 + 顶栏（面包屑/搜索/主题/语言/通知/帮助/新建/头像）+ 移动 5 项 | `public/index.html`、`public/css/style.css` | 分组与规范 4.1 一致；375px 底部导航可点 |
| 图标：24×24 / 1.75px SVG 精灵，替换 Shell emoji | `public/icons/sprite.svg`、`public/index.html` | Shell 无 emoji 图标；`<use>` 正常渲染 |
| 路由：`navigate()`、同 hash 重渲染、错误边界、别名、新路由 | `public/js/app.js` | 直接打开/重复点击/异常页均符合 4.3 |
| 弹层/Toast：焦点陷阱、Esc、焦点归还、aria-live | `public/js/components/modal.js`、`public/js/app.js`、`public/js/keyboard.js` | 键盘可完整操作弹层 |
| 命令面板 ⌘K | `public/js/components/commandPalette.js` | ↑↓/Enter/Esc 可用，分组正确 |

### Phase 1（核心闭环）

| 任务 | 涉及文件 | 验收 |
|---|---|---|
| P-01 工作台 | `public/js/views/dashboard.js`（新） | 继续创作唯一且最突出；空/加载/错误态齐全；375 单列 |
| P-04 项目库独立路由 | `public/js/app.js`、`public/js/views/projectList.js` | `#/projects` 可达；原能力不回归 |
| P-05 模板库入口 | `public/js/views/templateMarket.js` | 使用模板 → 创建 → 进编辑器（修复死链） |
| 新建项目闭环 | `public/js/views/projectList.js`、`dashboard.js` | 创建→`#/project/:id`→刷新仍在 |
| E-00 12 阶段 | `public/js/views/editorTabs.js`、`public/js/views/editor.js` | 5+7 全部可达；顺序固定 |
| E-03 生成阶段 | `public/js/views/editor.js` | 队列与分镜状态一致；锁定镜头不可生成 |
| E-02 比例 | `public/js/views/editor.js`、`public/css/style.css` | 16:9 / 9:16 / 1:1 按项目画幅 |

### 明确不在本轮

- 小说审校/转分镜（Phase 3）
- 全站 emoji → SVG 全量替换（先 Shell + 新页面，其余按 Phase 2–5 逐步）
- 真实视频/音频/支付/审核后端联调（后端已有部分，按现有接口使用，不伪造）
- 拖拽时间轴、镜头级版本

---

## 5. 验收方式

1. `npm run lint` 0 error；`npm test` 全绿。
2. `npm start` 后真实浏览器逐路由访问，记录 1440 / 375 两个视口的截图与控制台错误。
3. 核心闭环：新建项目 → 编辑器 12 阶段 → 生成（mock provider）→ 刷新后仍在。
4. 路由回归：`#/novels` 从工作台/编辑器重复点击；`#/editor/:id` 别名重定向；未知路由错误页可重试。
