# 前端 Phase 38 交付报告 · 剧场计划 React 化

> 日期：2026-10-20
> 前置：`f972a1e`

## 完成

- `/studios` 与 `/studio/:id` 从 legacy 迁移为 React（P-09）
- 真实接口：
  - `GET /studios`、`POST /studios`
  - `GET /studios/:id`
  - `POST /studios/:id/members`
  - `DELETE /studios/:id/members/:userId`
  - `POST /studios/:id/shows`
  - `POST /studios/:id/projects/:projectId`
- 广场：
  - 页头 + 创建厂牌弹层
  - 双列厂牌卡：名称首字标识、风格、简介、成员/剧集/作品数、主理人
  - 空状态可直接创建
- 详情：
  - 厂牌头、主理人、成员/剧集/作品指标
  - 加入厂牌（签约当前社区身份）
  - 成员列表与角色；仅主理人显示移除
  - 剧集列表与新建（仅主理人）
  - 作品网格，可跳转项目；主理人可归入作品
- **所有权**：创建时优先使用登录用户 `req.user.id`，避免请求体伪造 ownerId
- 删除 `public/js/views/studios.js`

## 验证

- 前端测试：
  - 广场渲染
  - 创建厂牌并携带当前用户 ownerId
  - 详情剧集/作品与加入厂牌
- 后端 `studioSystem.test.js`：14 passed
- 真实接口只读验证：当前 storage 返回 `{"total":0,"items":[]}`

## 命令

- lint 0 error
- typecheck 0 error
- test:web 107 passed
- studio 后端测试 14 passed
- build 成功

## 未验证

- 无浏览器自动化工具，未截图/肉眼验收
- 未创建真实厂牌、成员或归入真实作品

## 仓库状态提示

- 工作区仍有另一组未提交的部署/目录重构；本阶段只提交剧场计划相关文件。

## 后续

- P-11 素材商城
- P-12 团队协作
