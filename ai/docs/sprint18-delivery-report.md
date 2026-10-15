# DreamReel Sprint 18 交付报告（FNV 稳定 ID + 影评社区 Wave 2）

- 任务 ID：`TASK-20261010-018`
- 主题：T18-001 FNV-1a 稳定 ID；Wave 2 影评社区（榜单 / 推荐 / 举报审核）
- 来源提交：`cdd9c08 Merge Sprint 16/17/18 patches`（2026-10-10）
- 工作流上下文：`ai/workflow/context-sprint18.yaml`
- 最终状态：✅ **通过（修复后）**——P0 缺陷于 2026-10-12 修复，`npm test` **523 / 523 / 0**

> ⚠️ **补记说明**：本报告由编排者于 2026-10-12 补记并独立复测。复测发现原始提交存在未关闭的 P0 缺陷，状态曾回退为 `GLOBAL_IN_CONSISTENCY`；同日修复后复测全绿，置回 `GLOBAL_DONE`。P2（`src/app.js`）仍待决策。

---

## 一、范围

| ID | 名称 | 状态 |
|---|---|---|
| T18-001 | FNV-1a 64-bit 稳定 ID 生成 | ✅ 已修复（原含 P0 缺陷） |
| Wave 2 F1 | 热评榜单 `rankingService` | ✅ |
| Wave 2 F3 | 个性化推荐 `recommendationService` | ✅ |
| Wave 2 F4 | 内容举报与审核 `moderationService` | ✅ |
| Wave 2 ENTRY | 影评社区 API 接入主服务（原 `src/app.js`） | ✅ 已接入 `/api/community` |

---

## 二、🔴→✅ P0 缺陷（已修复）：T18-001 FNV-1a 实现错误

### 现象（实测）

- `generateId()` 返回长度 **426** 的十六进制串（注释声称 16 位），例如 `cbf29d1c04c1830a…`。
- 连续 6 次调用 `generateId().slice(0,8)` **全部为 `cbf29d1c`**（唯一值 1）。

### 根因

`src/utils/hash.js` 用 BigInt 实现 FNV-1a，但**没有做 mod 2⁶⁴ 回绕**：

```js
for (const byte of data) {
  hash = hash ^ BigInt(byte)
  hash = hash * FNV_64_PRIME   // ❌ BigInt 无溢出，乘积无界增长
}
return hash
```

BigInt 不截断，导致：乘积无界增长 → `fnv1a64Hex` 的 `.padStart(16,'0')` 形同虚设（串长达数百位）；且高位十六进制位由 `offset_basis × prime^n` 主导、**不受低位输入影响**，故取前缀 `slice(0,8)` 恒定。

### 影响

| 位置 | 影响 |
|---|---|
| `src/services/templateService.js` → `user-${generateId().slice(0,8)}` | 用户模板 ID 恒定碰撞 → `templateMarket` 用例失败（期望 1 实际 0） |
| `src/models/ImageAsset.js` → `img_${Date.now()}_${generateId().slice(0,8)}` | 同毫秒内资产 ID 碰撞 |
| `project/shot/scene/character/Studio/Team` 等 `id = generateId()` | ID 为非预期 426 字符长串，影响 URL、文件名、索引与可读性 |

### 修复（2026-10-12 已应用）

`src/utils/hash.js` 增加 `FNV_64_MASK = 0xffffffffffffffffn`，每步乘后掩码回绕：

```js
hash = (hash * FNV_64_PRIME) & FNV_64_MASK   // mod 2^64
```

修后实测：`generateId()` 长度 **16**；连续 6 次 `slice(0,8)` 唯一值 6；`fnv1a64Hex('hello') = a430d84680aabd0b`（标准 FNV-1a 64 值）。`templateMarket` 用例恢复通过。

---

## 三、Wave 2 影评社区

**F1 `rankingService`**：`heat = 评分×10 + 互动数×1`，再乘指数时间衰减（daily/weekly/monthly 半衰期 6/24/72h）；`getLeaderboard(period, limit)` 仅取 `published` 且落在时间窗内。
**F3 `recommendationService`**：标签重叠 + 四维评分余弦相似度 + 热度（权重 0.4/0.4/0.2）；排除本人作品。
**F4 `moderationService` + `Report` 模型**：`submitReport`（防重复举报）、`getPendingReports`、`processReport`（`approved` 时隐藏被举报影评）。
**新模型**：`review.js`、`comment.js`、`notification.js`、`report.js`（各自本地 ID 生成，未复用 `utils/idGenerator`）。

**验证**：`ranking/recommendation/moderation` 三个测试文件共 **35 例，独立运行 35 pass / 0 fail**。

---

## 四、✅ Wave 2 ENTRY：影评社区已接入主服务（`/api/community`）

原 `src/app.js` 是一个基于 `node:http` 的孤立服务（`server.listen(3000)`），且 import 一个不存在的命名导出（`does not provide an export named 'getUnreadCount'`），不可运行、无人引用。按决策「接回主服务」完成改造：

**做法**

- 新增 `src/routes/community.js`（标准 Express 路由），复用 `rankingService` / `recommendationService` / `moderationService`，统一响应信封。
- `src/server.js` 挂载：`app.use('/api/community', authOptional, communityRouter)`。
- **命名空间选择 `/api/community`**：主服务已存在 `/api/notifications`（平台通知，Sprint 1 体系）与 `/api/moderation`（文本内容审核），同名会冲突，故社区独立前缀。
- 存储层补 `storageService.getAllReports()`；`moderationService.getReports(status)` 支持不传 status 返回全部。
- 演示数据迁至 `scripts/seed-community.js`（幂等 upsert，**不再 `clearAll`**，避免清空开发库），新增 `npm run seed:community`。
- 移除失效的独立服务文件 `src/app.js`。

**接口**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/community/reviews` | 发布影评（四维评分 + movieTags；缺 userId/title → 400，201；`overallScore` = 四维均值） |
| GET | `/api/community/reviews?userId=&movieId=&status=&limit=` | 影评列表（默认 published，按时间倒序） |
| GET | `/api/community/reviews/:id` | 影评详情（不存在 404） |
| POST | `/api/community/reviews/:id/like` | 点赞影评（`likeCount` +1） |
| GET | `/api/community/leaderboard?period=&limit=` | 热评榜单（daily/weekly/monthly） |
| GET | `/api/community/recommendations?userId=&limit=` | 个性化推荐（排除本人） |
| POST | `/api/community/reports` | 举报影评（201；重复 409；影评不存在 404） |
| GET | `/api/community/reports?status=` | 举报列表（不传返回全部） |
| GET | `/api/community/reports/pending` | 待处理举报 |
| GET | `/api/community/reports/:id` | 举报详情（不存在 404） |
| POST | `/api/community/reports/:id/process` | 处理举报（approved 隐藏被举报影评） |
| GET | `/api/community/notifications?userId=&unreadOnly=&limit=` | 社区通知列表（含 `unreadCount`） |
| GET | `/api/community/notifications/unread-count?userId=` | 社区通知未读数 |
| POST | `/api/community/notifications/:id/read` | 单条标记已读（不存在 404） |
| POST | `/api/community/notifications/read-all` | 全部标记已读 |

**前端**：新增 `public/js/views/community.js` 并接入 SPA —— 侧边栏「🗣️ 影评社区」（`#/community`）、`app.js` 路由、`api.js` 方法；页面含发布影评、热评榜单、推荐、影评列表（点赞/举报）、举报处理、社区通知。

**验证（真实 HTTP，隔离 STORAGE_PATH + JWT_SECRET）**：发影评 201；列表/详情 200；点赞 +1；缺字段 400；不存在 404；新影评进榜单；榜单 3 条；推荐 200；举报 201；待处理 1；**通知链路：他人点赞 → 作者未读 1 → 标记已读 → 0**；平台 `/api/notifications` 仍 200（无冲突）；未知子路径 404。前端静态：`community.js` 200、`index.html` 含 `#/community` 导航、`api.js` 提供方法。测试：`communityRoutes` 10 + `communityReviews` 6 + `communityNotifications` 5 例。

**连带修复**：`src/models/review.js` 此前未保存 `movieTags` 字段，导致个性化推荐的标签重叠分恒为 0 —— 已修复并加断言。另修复既有偶发失败测试 `rankingService.test.js`（`computeTimeDecay` 严格断言 ===1，改为容差）。

**边界（未做）**：举报处理未做管理员鉴权（B，暂缓：当前无 role/admin 体系）；社区前端未做真实浏览器 E2E（环境无 Playwright）。

---

## 五、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test`（合入 main 时） | **523 tests / 522 pass / 1 fail**（`templateMarket`，T18-001 引发） |
| `npm test`（2026-10-12 修复 FNV 后） | **523 tests / 523 pass / 0 fail** |
| `npm test`（2026-10-12 接入社区后） | **533 tests / 533 pass / 0 fail** |
| `npm test`（2026-10-12 补齐影评写入后） | **539 tests / 539 pass / 0 fail** |
| `npm test`（2026-10-12 通知+前端后） | **544 tests / 544 pass / 0 fail**（连续 4 轮稳定） |
| 社区服务测试（隔离） | 35 / 35 pass |
| 新增社区测试 | 21 例（communityRoutes 10 + communityReviews 6 + communityNotifications 5） |
| `npm run lint` | 0 error / 0 warning |
| 相对 Sprint 15 | 488 → 544（+56） |

---

## 六、新增 / 修改文件

**新增**：`src/utils/hash.js`、`src/utils/idGenerator.js`、`src/services/rankingService.js`、`src/services/recommendationService.js`、`src/services/moderationService.js`、`src/models/review.js`、`src/models/comment.js`、`src/models/notification.js`、`src/models/report.js`、`tests/rankingService.test.js`、`tests/recommendationService.test.js`、`tests/moderationService.test.js`

**2026-10-12 接入新增**：`src/routes/community.js`、`src/services/reviewService.js`、`src/services/communityNotificationService.js`、`public/js/views/community.js`、`scripts/seed-community.js`、`tests/communityRoutes.test.js`、`tests/communityReviews.test.js`、`tests/communityNotifications.test.js`

**2026-10-12 接入移除**：`src/app.js`（独立 http 服务，功能并入主服务）

**修改（主要）**：`src/models/{project,shot,scene,character,Studio,Team,ImageAsset,user,review}.js`（id 生成 / 社区偏好 / movieTags）、`src/services/{templateService,authService,collaborationService,exportHistoryService,galleryService,sceneService,scriptService,versionService,projectService,storageService,…}.js`（uuid→generateId 或 lint）、`src/server.js`（挂载 /api/community）、`src/services/{storageService,moderationService}.js`（getAllReports / 社区通知方法）、`public/js/app.js`、`public/js/api.js`、`public/index.html`（社区页接线）、`tests/rankingService.test.js`（去偶发）、`package.json`（seed:community）、`src/providers/*`（catch 收敛）

---

## 七、已知限制与风险

1. **T18-001 FNV 缺陷（P0）**：已于 2026-10-12 修复并复测。
2. **影评社区已接入主服务（`/api/community`）+ 前端页**：原 `src/app.js` 孤立问题（P2）已关闭。
3. ID 生成口径不统一：4 个新模型各自实现本地 `generateId`，未复用 `utils/idGenerator`。
4. **举报处理未做管理员鉴权（B，暂缓）**：需先引入 role/admin 体系（设计变更）。
5. **社区前端未做真实浏览器 E2E**：环境无 Playwright，仅做了静态与 API 契约验证。

---

## 八、结论

Sprint 18 引入了 FNV 稳定 ID 与影评社区服务。其 FNV ID 生成实现曾存在 P0 缺陷（ID 长度 426 + `slice(0,8)` 恒定碰撞，导致 1 例测试失败），**已于 2026-10-12 修复并复测**；随后将原孤立的影评社区（`src/app.js`）**接入主服务**（`/api/community`），**补齐影评写入闭环**（发布/列表/详情/点赞）、**社区通知**（点赞自动通知作者 + 已读管理）与**前端页面**（`#/community`），并修复 `movieTags` 字段缺陷与一处既有偶发失败测试。最终 **544 tests / 544 pass / 0 fail（连续 4 轮稳定）**，真实 HTTP 冒烟全过。

**最终状态：`GLOBAL_DONE`（P0 已修复，P2 已接入，社区写入/通知/前端闭环完成）。**
