# 前端 Phase 50 交付报告 · API 文档端点一致性检查

> 日期：2026-10-20
> 前置：`frontend-phase49-plural-numbers.md`
> 目标：让文档端点可被机器校验，避免文档与后端路由漂移

---

## 1. 完成范围

### 1.1 新增校验脚本 `scripts/check-docs-endpoints.js`

- 解析 `src/app.js` 的 `app.use('/api/...')` 挂载与各路由文件的 `router.get/post/...`。
- 解析 `web/src/pages/Docs.tsx` 中声明的端点。
- 路径参数统一归一化为 `:param`（文档 `:id` 与后端 `:projectId` 视为同一路径）。
- 输出：后端端点数、文档端点数、文档缺失数、未写入文档数。
- 任何「文档声明但后端不存在」的端点 → 退出码 1。
- `--all` 可列出未写入文档的后端端点。

### 1.2 文档补充

`Docs.tsx` 新增两个分组，共 19 个端点：

- **账户与额度**：注册 / 登录 / 当前用户 / 当前额度 / 套餐列表 / 当前订阅。
- **资产与协作**：图片生成与资产、场景、角色、评论、分享设置、分享访问、通知列表、全部已读。

文档端点从 20 增至 **39**。

### 1.3 接入检查

- `package.json` 新增 `check:docs`。
- `npm run check` 变为：`lint → typecheck → check:docs → npm test → test:web`。
- 新增 `tests/docsEndpoints.test.js`，在后端测试中执行脚本并断言「文档缺失 0」。

---

## 2. 改动文件

```
scripts/check-docs-endpoints.js
tests/docsEndpoints.test.js
web/src/pages/Docs.tsx
web/src/pages/Docs.test.tsx
package.json
ai/docs/frontend-phase50-docs-endpoint-check.md
```

---

## 3. 验证

| 命令 | 结果 |
|---|---|
| `node scripts/check-docs-endpoints.js` | 后端 337 / 文档 39 / 缺失 0 / 未写入 298 |
| `npm run check` | 全部通过 |
| `npm test` | **752 passed / 0 failed**（含新增文档检查） |
| `npm run test:web` | **133 passed / 37 files** |
| `npm run build:web` | 成功 |

真实浏览器 `/docs`（英文）：7 个分区 `Authentication / Projects & shots / Generation pipeline / Account & quota / Assets & collaboration / Novel theater / Error codes`，表格共 47 行（39 端点 + 8 错误码）。

---

## 4. 未完成 / 已知限制

1. 只校验文档中的端点是否存在，不要求 337 个后端端点全部写入文档（当前 298 个未写入）。
2. 不校验请求/响应字段、鉴权要求、状态码与后端实现是否一致。
3. 路由解析基于源码正则，动态拼接路径或 `router.route()` 写法不会被识别。
4. 未生成 OpenAPI 文件；文档仍是手写静态表。
5. 未做键盘 / 屏幕阅读器实测与截图级视觉回归。

---

## 5. 下一步

1. 生成 OpenAPI 3 规范并从规范渲染 Docs，替代手写表。
2. 为高频端点补请求/响应示例。
3. 键盘 / 屏幕阅读器实测。
4. 1440 / 1024 / 768 截图级视觉回归。
