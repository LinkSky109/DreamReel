# 前端 Phase 34 交付报告 · 创作挑战 React 化

> 日期：2026-10-20
> 前置：`61b66b9`

## 完成

- `/challenges` 从 legacy 迁移为 React（P-06）
- 真实接口：
  - `GET /challenges?status=`
  - `GET /challenges/:id`
  - `POST /challenges/:id/join`
- 列表接口补充 `entryCount`（按 gallery 投稿数聚合）
- 页面：
  - 页头 + 自由创作（跳转 `/projects?create=1`）
  - 全部 / 进行中 / 已结束 + 数量
  - 双列挑战卡：剧照封面、状态、周期进度、主题、奖励、投稿数
  - 详情弹层：规则、奖励、作品排行、参与按钮
  - 参与后跳转新建的投稿项目编辑器
  - 已结束挑战禁用参与
- 项目卡增加「挑战投稿」来源标签（`challengeId`）
- 删除 `public/js/views/challenges.js`

## 验证

- 接口：3 个挑战，`entryCount` 已返回；详情 `entryCount=0`
- 组件测试：
  - 列表渲染与投稿数
  - 已结束筛选空状态
  - 详情规则/排行
  - 参与调用与跳转编辑器
- 当前环境无浏览器自动化工具，未做截图/肉眼视觉验证

## 命令

- lint 0 error
- typecheck 0 error
- test:web 97 passed
- npm test 750 passed / 0 failed（开发数据隔离 OK）
- build 成功

## 后续

- 导演模式 P-07 / 创意片头 P-08
- 挑战投稿排行依赖 gallery 真实投稿数据，当前为空
