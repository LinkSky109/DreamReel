# 前端 Phase 37 交付报告 · 影评社区 React 化

> 日期：2026-10-20
> 前置：`ed0b281`

## 完成

- `/community` 从 legacy 迁移为 React（P-10）
- 真实接口（`/api/community`，`{ success, data }` 信封）：
  - `GET /leaderboard?period=&limit=`
  - `GET /reviews`
  - `GET /reviews/:id`
  - `POST /reviews`
  - `POST /reviews/:id/like`
  - `POST /reports`
- 页面：
  - 页头 + 写影评
  - 主列影评卡：标题、影片、作者、日期、正文、四维评分条、标签、点赞、举报
  - 右侧热评榜（日/周/月）与社区规范
  - 四维评分滑块（0–5）、实时数值、影片 datalist、标签
  - 影评详情弹层、点赞、举报原因弹层
  - 空社区引导、加载/错误/重试态
- **评分兼容**：后端/历史数据为 0–10 分；UI 统一显示为 0–5，新提交分数 ×2 写入，保持榜单/推荐排序兼容
- 删除 `public/js/views/community.js`

## 验证

- 前端测试：
  - 影评与四维评分渲染、榜单
  - 发布影评参数（0–5 UI → 0–10 存储）
  - 点赞与举报提交
- 后端 `communityReviews.test.js` + `communityRoutes.test.js`：16 passed
- 真实接口只读验证：榜单/影评返回 0–10 分历史数据；未创建真实影评或举报

## 命令

- lint 0 error
- typecheck 0 error
- test:web 104 passed
- community 后端测试 16 passed

## 未验证

- 当前会话无浏览器自动化工具，未做截图/肉眼视觉验收
- 未在真实 storage 发布影评/举报；写操作由测试与接口契约覆盖

## 仓库状态提示

- 工作区同时存在另一组未提交的部署/目录重构（`src/server.js`、`src/config/index.js`、`web/vite.config.ts`、`web/public/` 等）。本阶段只提交社区相关文件，未触碰该组改动。

## 后续

- P-09 剧场计划
- P-11 素材商城
