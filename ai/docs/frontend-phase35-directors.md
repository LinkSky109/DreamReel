# 前端 Phase 35 交付报告 · 导演模式 React 化

> 日期：2026-10-20
> 前置：`8463b1b`

## 完成

- `/directors` 从 legacy 迁移为 React（P-07）
- 真实接口：
  - `GET /directors`
  - `POST /directors/:id/apply`
  - `POST /directors/disable`
  - `GET /projects` 选择目标项目
- 页面：
  - 双列导演档案卡：年代、阐述摘要、运镜/节奏/表演、常用运镜
  - 详情弹层：完整阐述、运镜、节奏、表演提示、光影、配乐情绪
  - 目标项目选择，显示镜头数与锁定数
  - 应用后展示逐镜运镜/时长/指导与跳过数
  - 可关闭导演模式（保留已生成指导）
- **后端保护**：`applyDirector` 跳过 `shot.locked` 镜头，返回 `appliedCount / skippedCount / skipped`，不覆盖锁定镜头的运镜、时长、指导
- 删除 `public/js/views/directors.js`

## 验证

- 新增后端测试：锁定镜头不被覆盖，持久化后仍保持用户值；后端 751 passed
- 前端测试：
  - 档案渲染
  - 选择项目后应用
  - 锁定镜头数量提示与结果展示
- `GET /directors` 数据为 5 位导演；未对真实项目执行 apply

## 命令

- lint 0 error
- typecheck 0 error
- test:web 99 passed
- npm test 751 passed / 0 failed
- build 成功

## 未验证

- 当前会话无浏览器自动化工具，未做截图/肉眼视觉验收
- 未对真实项目执行导演编排（避免改写真实镜头）

## 后续

- P-08 创意片头
- P-10 影评社区
