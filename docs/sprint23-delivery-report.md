# DreamReel Sprint 23 交付报告：单集成片 + 存储同步

- 任务 ID：`TASK-20261012-023`
- 工作流上下文：`.workflow/context-sprint23.yaml`
- 分支：`main`
- 最终状态：✅ 达成（成片 + 本地同步真实；夸克网盘 dry-run；真实上传留口）

---

## 一、范围与产出

| 项 | 交付 |
|---|---|
| S23-1 单集成片 | `episodeComposeService`：片段循环扩展到目标时长（默认 90s）+ 混音（有旁白）/静音轨 → mp4；输出 `storage/exports/novels/<id>/<eid>.mp4` |
| S23-2 剧集包清单 + 同步 | `novelSyncService`：`buildManifest`（novels + exports）；本地同步（真实复制）；夸克网盘 dry-run + ledger；真实上传需 `QUARK_COOKIE`（留口） |
| S23-3 接口/CLI | `POST /:id/episodes/:eid/compose`、`GET /:id/manifest`、`POST /:id/sync`；CLI `compose/manifest/sync` |

---

## 二、真实 E2E（《殖装》单集）

```
compose（默认 90s）→ mp4：hasVideo=true，duration=90s，url=/storage/exports/novels/<id>/<eid>.mp4
manifest          → 30 个文件（novels/<id>/** + exports 成片）
sync local --dry-run → backend=local, files=30
sync quark（dry-run）→ backend=quark, fileCount=30
sync quark（真实，无 cookie）→ ERROR: 夸克网盘真实上传需 QUARK_COOKIE（cookie 登录）；未提供，未执行上传
```

---

## 三、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test` | **553 tests / 553 pass / 0 fail**（新增成片+同步 1 例） |
| 测试隔离 | 开发库未被修改 |
| `npm run lint` | 0 error / 0 warning |

---

## 四、已知限制与风险

1. **成片为"单片段循环 + 旁白"**：多镜交叉转场/字幕/配乐精修未做（后续）。
2. **夸克网盘真实上传未实现**：仅 dry-run + 本地真实同步；真实上传需 cookie（参考 `ai-manga-factory` 方案；其 Quark 真实上传曾遇 TLS EOF）。
3. **NAS 未接**：适配器保留。
4. 真实视频素材依赖 Ark key（Sprint 22 待办）。

---

## 五、新增 / 修改文件

**新增**：`src/services/episodeComposeService.js`、`src/services/novelSyncService.js`、`.workflow/context-sprint23.yaml`、`docs/sprint23-delivery-report.md`

**修改**：`src/routes/novels.js`、`scripts/novel.js`、`tests/novelSeries.test.js`、`README.md`

---

## 六、结论

Sprint 23 打通**单集成片**（90s mp4）与**剧集包清单/存储同步**（本地真实；夸克网盘 dry-run，真实上传留口）。全量 **553/553/0**。至此"书名 → 可交付剧集包"链路成型（mock 端到端）。

**最终状态：`GLOBAL_DONE`。**
