# DreamReel Sprint 18 交付报告（FNV 稳定 ID + 影评社区 Wave 2）

- 任务 ID：`TASK-20261010-018`
- 主题：T18-001 FNV-1a 稳定 ID；Wave 2 影评社区（榜单 / 推荐 / 举报审核）
- 来源提交：`cdd9c08 Merge Sprint 16/17/18 patches`（2026-10-10）
- 工作流上下文：`.workflow/context-sprint18.yaml`
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
| Wave 2 ENTRY | 影评社区独立 API `src/app.js` | ❌ 孤立且 import 失败 |

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

## 四、❌ Wave 2 ENTRY：`src/app.js` 孤立且不可运行

- 是一个基于 `node:http` 的独立「Movie Review Community API」，自带 `seedData()` 与 `server.listen(3000)`。
- **import 即失败**：`import { getUserNotifications, getUnreadCount, markAsRead, markAllAsRead } from './services/notificationService.js'` —— 实测 `notificationService.js` 未导出 `getUserNotifications`/`getUnreadCount`，`markAsRead` 签名也不匹配。

  ```
  node -e "import('./src/app.js')"
  → does not provide an export named 'getUnreadCount'
  ```

- **未被任何入口引用**：`src/server.js`、`package.json` 脚本、`tests/` 均无引用（死代码）。
- **语义不一致**：影评社区与 DreamReel（AI 短片平台）领域不符。

---

## 五、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test`（合入 main 时） | **523 tests / 522 pass / 1 fail**（`templateMarket`，T18-001 引发） |
| `npm test`（2026-10-12 修复后） | **523 tests / 523 pass / 0 fail** |
| 社区测试（隔离） | 35 / 35 pass |
| `npm run lint` | 0 error / 1 warning（warning 在 `src/app.js`） |
| 相对 Sprint 15 | 488 → 523（+35，主要是社区 3 个测试文件） |

---

## 六、新增 / 修改文件

**新增**：`src/utils/hash.js`、`src/utils/idGenerator.js`、`src/services/rankingService.js`、`src/services/recommendationService.js`、`src/services/moderationService.js`、`src/models/review.js`、`src/models/comment.js`、`src/models/notification.js`、`src/models/report.js`、`src/app.js`、`tests/rankingService.test.js`、`tests/recommendationService.test.js`、`tests/moderationService.test.js`

**修改（主要）**：`src/models/{project,shot,scene,character,Studio,Team,ImageAsset,user}.js`（id 生成 / 社区偏好字段）、`src/services/{templateService,authService,collaborationService,exportHistoryService,galleryService,sceneService,scriptService,versionService,projectService,storageService,…}.js`（uuid→generateId 或 lint）、`src/providers/*`（catch 收敛）

---

## 七、已知限制与风险

1. **T18-001 FNV 缺陷（P0）**：已于 2026-10-12 修复并复测（523/523/0）。
2. **`src/app.js` 孤立且 import 失败（P2，未关闭）**：死代码，且与仓库领域不符，待产品决策（删除或接回主服务）。
3. ID 生成口径不统一：4 个新模型各自实现本地 `generateId`，未复用 `utils/idGenerator`。
4. 社区功能无路由接入主服务（`src/app.js` 未启用），实际不可达。

---

## 八、结论

Sprint 18 引入了 FNV 稳定 ID 与影评社区服务。社区服务（榜单/推荐/举报审核）测试充分且通过；其依赖的 FNV ID 生成实现曾存在 P0 缺陷（ID 长度 426 + `slice(0,8)` 恒定碰撞，导致 1 例测试失败），**已于 2026-10-12 修复并复测全绿（523/523/0）**。`src/app.js`（P2）孤立且 import 失败，仍待产品决策。

**最终状态：`GLOBAL_DONE`（P0 已修复）。**
