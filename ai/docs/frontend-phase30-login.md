# 前端 Phase 30 交付报告 · 登录页 React 化

> 日期：2026-10-20
> 前置：`82915c1`

## 完成

- `/login` 从 legacy 迁移为 React
- 登录 / 注册 Tab，真实调用：
  - `POST /api/auth/login`（email + password）
  - `POST /api/auth/register`（username + email + password）
- 登录成功保存 token/user，触发 `dreamreel:auth` 事件，AppShell 即时更新登录状态
- 失败显示内联错误
- 游客入口返回首页
- 修正 `api.login` 类型为 email（与服务端一致）
- 新增 `api.register`

## 验证

- `/login` React 渲染，无 legacy 容器
- 错误账号 → 内联「邮箱或密码错误」，停留在 `/login`
- 375px：卡片 305px，`scrollWidth=375`，无横向溢出
- 未创建测试账号，未修改真实数据

## 命令

- lint 0 error
- typecheck 0 error
- test:web 85 passed
- npm test 750 passed
- build 成功（主包 420.2KB / gzip 131.7KB）

## 后续

- 评测/挑战等剩余 legacy 页面
- 登录后重定向回原页面（当前回首页）
