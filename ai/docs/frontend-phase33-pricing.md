# 前端 Phase 33 交付报告 · 套餐与定价 React 化

> 日期：2026-10-20
> 前置：`120e72a`

## 完成

- `/pricing` 从 legacy 迁移为 React
- 真实接口：
  - `GET /subscription/plans`
  - `GET /subscription/current`（登录后）
  - `POST /subscription/subscribe`
  - `POST /subscription/cancel`
- 页面：
  - Pricing 头部、当前计划
  - 月付/年付切换
  - 4 个套餐卡（免费/基础/专业/企业），专业版高亮
  - 权益列表、水印/队列/协作标记
  - 当前计划禁用按钮
  - 未登录订阅跳转登录
  - 免费版降级调用取消订阅
  - 支付弹窗（演示卡号，说明不真实扣费）
- 删除 `public/js/views/pricing.js`

## 验证

- 4 个套餐渲染，当前计划「免费版」
- 切换年付：基础版 ¥29 → ¥290/年
- 未登录点专业版「立即订阅」→ `/login`
- 375px：单列 307px，无横向溢出
- 未执行真实订阅/扣费

## 命令

- lint 0 error
- typecheck 0 error
- test:web 95 passed
- npm test 750 passed
- build 成功（主包 421.1KB / gzip 132.0KB）

## 后续

- API 控制台 / 社区 / 商城等剩余 legacy 页面
- 支付接入 Stripe（当前演示）
