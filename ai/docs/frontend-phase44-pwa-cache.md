# 前端 Phase 44 交付报告 · PWA 与缓存策略

> 日期：2026-10-20
> 前置：`frontend-phase43-share-layout.md`
> 目标：修复渐进迁移后失效的 Service Worker，建立可验证的缓存与离线策略

---

## 1. 问题

- `public/sw.js` 的 `APP_SHELL` 仍引用已删除的 `/js/api.js`、`/js/i18n.js`，`cache.addAll` 失败。
- 旧 `public/js/app.js` 被删除后，**没有任何代码注册 Service Worker**。
- Manifest 的 `theme_color / background_color` 仍是紫色渐变方案（`#7c3aed` / `#0f0b1e`），与规范 §5.2（Webflow Blue / 白色画布）冲突。
- `web/index.html` 仍注释「legacy 组件样式仍在使用」，且缺少 description / mobile-web-app 元信息。

---

## 2. 完成范围

### 2.1 Service Worker（`public/sw.js`）

- `CACHE_VERSION = dreamreel-v6`，激活时清理同前缀旧缓存。
- APP_SHELL 改为真实存在的资源：`/`、`/index.html`、`/manifest.webmanifest`、3 个图标、`/css/style.css`。
- 安装使用 `Promise.allSettled`，单个资源失败不会让整个安装失败。
- 请求策略：
  - 导航请求：网络优先，离线回退缓存的 `index.html`
  - `/assets/` 哈希产物：缓存优先（文件名含内容哈希，可长期缓存）
  - 其他同源静态资源：网络优先，成功写入缓存，离线回退
  - `/api/`、`/storage/`、`/sw.js`、非 GET、跨域：不拦截
- `skipWaiting` + `clients.claim`，新版本接管后无需手动刷新两次。

### 2.2 注册与元信息

- `web/src/main.tsx` 仅在生产环境注册 `/sw.js`；兼容 `load` 已触发的情况（`readyState === 'complete'` 时立即注册）。
- `manifest.webmanifest`：
  - `theme_color` → `#146ef5`
  - `background_color` → `#ffffff`
  - 增加 `id: "/"`、`display_override: ["standalone", "minimal-ui"]`
- `web/index.html`：增加 description、mobile-web-app-capable、apple 状态栏样式；修正 legacy 注释。

---

## 3. 改动文件

```
public/sw.js                    # 重写缓存策略
public/manifest.webmanifest     # 颜色与 PWA 字段
web/src/main.tsx                # 生产环境注册 SW
web/index.html                  # PWA 元信息
ai/docs/frontend-phase44-pwa-cache.md
```

---

## 4. 验证

| 命令 | 结果 |
|---|---|
| `node --check public/sw.js` | 通过 |
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **129 passed / 0 failed**（36 files） |
| `npm run build:web` | 成功；主包 425.10 KB（gzip 133.12 KB）；复制 6 项静态资源到 `web/dist` |

### 真实浏览器验证（`vite preview` + 生产构建）

- `/sw.js`、`/manifest.webmanifest` 返回 200。
- 首次加载后 `navigator.serviceWorker.getRegistration()` 返回注册，`active = true`，scope `/`。
- 缓存 `dreamreel-v6` 存在；二次加载后包含 **8 个 `/assets/` 哈希文件**、index、manifest、图标、CSS 与页面封面图，共 20 条。
- `navigator.serviceWorker.controller = true`。
- 停止静态服务器后刷新：应用外壳仍可加载（`controller = true`），API 失败显示「工作台加载失败 / 重试」，未白屏。

---

## 5. 未完成 / 已知限制

1. 没有「新版本可用，是否刷新」提示；当前 `skipWaiting` 直接接管，刷新后生效。
2. 未实现 Push / Notification / Background Sync。
3. 开发环境不注册 SW（避免缓存 Vite 模块）；离线验证需生产构建。
4. 缓存上限未做容量管理；哈希产物会随版本累积，依赖 `CACHE_VERSION` 清理。
5. 图标仍为现有 PNG/SVG，未生成新的 maskable 安全区版本。

---

## 6. 下一步

1. Phase 5：全量 i18n 与深色主题逐页对比度。
2. 1440 / 1024 / 768 截图级视觉回归。
3. 可选：SW 更新提示与缓存容量统计。
