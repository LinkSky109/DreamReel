# 前端 Phase 41 交付报告 · 移除最后一个 legacy 桥接

> 日期：2026-10-20
> 前置：`frontend-phase40-business-gallery.md`
> 目标：把 `/system-settings` 的性能监控与 Webhook 能力并入 React 设置页，删除 `LegacyView` 与 legacy 静态资源，完成渐进迁移收口

---

## 1. 完成范围

### 1.1 设置页新增「运行与性能」

- 接 `GET /api/system/performance`：
  - CPU 使用率 + 核心数 + 1 分钟负载
  - 内存使用率 + 已用/总量
  - 总请求数、错误数、错误率
  - 平均响应时间、运行时长
- 最慢端点 Top 5、最频繁端点 Top 5 表格。
- 指标按 50% / 80% 阈值使用 warning / danger 语义色，并保留数值文本。
- 手动刷新按钮，刷新期间禁用并显示「刷新中…」。

### 1.2 设置页新增 Webhook 管理

- `GET /api/webhooks` 列表：名称、启用状态、URL、事件、成功/失败次数、最近触发时间。
- `POST /api/webhooks` 创建、`PUT /api/webhooks/:id` 编辑/启停、`DELETE` 删除（二次确认）、`POST /:id/test` 测试。
- 事件类型来自 `GET /api/webhooks/events`，并映射中文/英文标签。
- 签名密钥可选；编辑时留空不修改。
- 空状态、加载、错误、操作 Toast 齐全。

### 1.3 移除 legacy 桥接

- 删除路由 `/system-settings`。
- 删除 `web/src/features/legacy/LegacyView.tsx`。
- 删除 `web/public/legacy/` 全部静态资源（9 个 legacy 视图、api.js、i18n.js、providerSelector、shared/ui、legacy CSS）。
- `web/vite.config.ts` 移除 `/legacy` 开发代理。
- 设置页「旧版系统设置（性能 / Webhook）」入口随之下线。

至此，仓库前端不再有 `LegacyView` 或 `web/public/legacy` 依赖，页面全部由 React 路由承载。

---

## 2. 改动文件

**新增**

```
ai/docs/frontend-phase41-remove-legacy-bridge.md
web/src/pages/Settings.test.tsx
```

**修改**

```
web/src/pages/Settings.tsx        # 运行与性能、Webhook 两个分区 + 表单/确认弹层
web/src/pages/Settings.css        # 性能卡片、端点表、Webhook 列表与表单
web/src/lib/api.ts                # performance 类型化 + webhooks CRUD/test
web/src/domain/types.ts           # PerformanceReport / WebhookEndpoint
web/src/app/App.tsx               # 删除 /system-settings 与 LegacyView import
web/vite.config.ts                # 删除 /legacy 代理
```

**删除**

```
web/src/features/legacy/LegacyView.tsx
web/public/legacy/**（css/style.css、js/api.js、i18n.js、components、shared、views/*）
```

---

## 3. 实际运行与验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **126 passed / 0 failed**（35 files；设置页新增 3 条） |
| `WEB_OUT_DIR=dist npx vite build` | 成功；主包 424.73 KB（gzip 132.96 KB），Settings chunk 25.09 KB（gzip 6.76 KB） |

### 真实浏览器验证（后端 3010 + Vite 5173）

- `/settings` 正常渲染 7 个分区：工作区 / 创作默认值 / 通知 / 模型与系统 / 运行与性能 / Webhook / 套餐与额度。
- 性能区显示真实 CPU、内存、请求数、平均响应时间与两张 Top 5 表。
- `创建 Webhook` 后列表出现「通知服务」，事件显示「视频生成完成」。
- 点击「停用」后状态即时变为「已停用」，再次显示「启用」按钮。
- 375 / 1440 视口下 `scrollWidth = innerWidth`，无横向溢出。
- `/system-settings` 现在落到前端 404 页面（不再有 legacy 页面）。
- 页面不再出现「旧版系统设置」入口。

---

## 4. 未完成 / 已知限制

1. **Webhook 投递日志未做 UI**：后端已有 `GET /webhooks/:id/deliveries`，本轮未加入抽屉/表格。
2. **性能监控未提供重置**：后端 `POST /system/performance/reset` 未暴露，避免误清统计。
3. **Webhook secret 不回显**：符合后端安全策略；编辑时只能覆盖，无法查看原值。
4. **工作区/创作默认值仍存本机**：后端暂无对应设置接口。
5. **未做像素级截图比对**：已完成真实浏览器功能与 375/1440 溢出检查。

---

## 5. 协作说明（前后端分离会话）

- 未修改后端、部署与构建产物；`web/public/legacy` 删除只影响前端静态资源。
- 唯一工程配置改动：`web/vite.config.ts` 删除已无用的 `/legacy` 代理。
- `Settings.tsx` 为追加式扩展；`App.tsx` 删除最后一个 legacy 路由。
- 建议合并后执行一次 `npm run build:web` 重新生成独立前端产物。

---

## 6. 下一步

1. Webhook 投递日志抽屉（复用 `GET /webhooks/:id/deliveries`）。
2. 分享页 `/share/:token` 独立无导航布局。
3. Phase 5 收尾：全量 i18n、深色主题逐页对比度、PWA 缓存版本化。
4. 全局 1440 / 1024 / 768 截图级视觉回归。
