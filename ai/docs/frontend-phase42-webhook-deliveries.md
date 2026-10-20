# 前端 Phase 42 交付报告 · Webhook 投递日志

> 日期：2026-10-20
> 前置：`frontend-phase41-remove-legacy-bridge.md`
> 目标：补齐 Phase 41 遗留的 Webhook 投递日志 UI

---

## 1. 完成范围

- 每个 Webhook 卡片新增「投递日志」入口。
- 弹层展示最近 50 条投递记录：
  - 时间（ISO → `YYYY-MM-DD HH:mm:ss`）
  - 事件类型
  - 成功 / 失败（文字 + 语义色）
  - HTTP 状态码
  - 尝试次数
- 支持手动刷新；加载 / 错误 / 空状态齐全。
- 接真实接口 `GET /api/webhooks/:id/deliveries?limit=50`。
- 窄屏表格横向滚动，弹层宽度不超出视口。

---

## 2. 改动文件

```
web/src/domain/types.ts       # WebhookDelivery
web/src/lib/api.ts            # getWebhookDeliveries
web/src/pages/Settings.tsx    # 投递日志按钮、查询、弹层
web/src/pages/Settings.css    # 投递状态、空态、表格
web/src/pages/Settings.test.tsx # 新增投递日志用例
ai/docs/frontend-phase42-webhook-deliveries.md
```

---

## 3. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **127 passed / 0 failed**（35 files） |
| `WEB_OUT_DIR=dist npx vite build` | 成功；主包 424.82 KB（gzip 132.98 KB） |

### 真实浏览器验证

1. 启动本地回显服务 `:3011`（返回 200）。
2. 注册 Webhook `本地回显 → http://localhost:3011/hook`。
3. 调用 `POST /api/webhooks/:id/test`，返回 `{ success: true, statusCode: 200 }`。
4. 设置页打开「投递日志」，显示 `test / 成功 / 200 / 1` 与时间。
5. 375px 下页面 `scrollWidth = 375`，弹层宽度 375，表格自身横向滚动。

---

## 4. 未完成 / 已知限制

1. 投递日志只读，不提供重放/重试单条记录。
2. 最多展示 50 条；后端上限 100 条，暂未做分页。
3. 事件列显示原始事件码，未复用事件中文标签（与 Webhook 卡片一致的部分已本地化）。
4. 投递日志弹层不是右侧 Drawer；当前复用统一 Modal，键盘与焦点行为一致。

---

## 5. 下一步

1. 投递日志重放按钮（需后端新增接口）。
2. 分享页 `/share/:token` 独立无导航布局。
3. Phase 5：全量 i18n、深色对比度、PWA 缓存版本化。
