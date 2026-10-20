# ADR-0002: 前后端部署分离

- 状态：已接受（2026-10-20）
- 相关：ADR-0001、ADR-0003

## 背景

源码层已经是 React 19 + Vite（`web/`），但部署层仍耦合在一个 Express 进程里：

- `src/server.js:160` 用 `express.static(PUBLIC_DIR)` 托管构建产物；
- SPA fallback 把非 API 请求全部返回 `index.html`；
- 9 个 legacy 页面通过 `LegacyView` 动态 import `/js/views/*.js`，依赖 Express 提供静态资源；
- 构建产物直接输出到 `../public`，与后端静态目录混用。

后果：前端无法独立发布/回滚、无法上 CDN、后端扩容会重复托管静态资源、API 与页面同源掩盖了 CORS 与鉴权边界问题。

## 决策

1. 后端拆为 `src/app.js`（Express app、中间件、路由）与 `src/server.js`（listen、优雅停机）。
2. 新增 `SERVE_STATIC` 开关：
   - 本地与过渡期默认 `true`，行为不变；
   - `Dockerfile.api` 与生产 API 设 `false`，后端只提供 `/api`、`/health*`、`/storage`、`/metrics`。
3. 前端独立构建到 `web/dist`（`npm run build:web`），由 Nginx/CDN 托管。
4. `BrowserRouter` 替代 `HashRouter`；Nginx `try_files $uri /index.html`；旧 `/#/path` 链接在入口做一次重定向兼容。
5. legacy 资源从 `public/js|css` 迁入 `web/public/legacy/js|css`，桥接路径改为 `${BASE_URL}legacy/js/views/*.js`，逐步迁移为 React 后删除。
6. API 统一 `/api` 前缀；未匹配的 `/api/*` 返回 JSON 404；页面 404 由前端路由处理。

## 备选方案

| 方案 | 结论 | 原因 |
|---|---|---|
| 继续单进程托管 | 未采用 | 无法独立发布/回滚，CDN 与多实例扩容受限 |
| 拆成微服务 | 未采用 | 当前团队规模与业务边界不支持，先做模块化单体 |
| Next.js/SSR | 未采用 | 现有 SPA 已成型，SSR 收益不抵改造成本 |

## 后果

正面：

- 前端可独立构建、灰度、回滚；静态资源可上 CDN。
- 后端只暴露 API 与媒体，攻击面更小。
- 强制显式 CORS 与鉴权边界，为多租户做准备。

负面：

- 需要维护 Nginx/部署配置。
- legacy 桥接在迁移完成前仍需双份静态资源。
- BrowserRouter 需要服务端 fallback，部署配置错误会导致刷新 404。

## 验收

- `SERVE_STATIC=false` 启动后 `/api/*`、`/health*`、`/storage/*` 正常，`/` 返回 404（非 HTML）。
- 前端在 `web/dist` 独立构建成功，Nginx 托管后核心路由可直达与刷新。
- 旧 `#/` 链接可正确落到对应页面。
- 9 个 legacy 页面在新路径下可加载。
