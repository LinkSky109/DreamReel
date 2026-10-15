# DreamReel Sprint 19 交付报告：小说 → 角色抽取流水线（MVP-1）

- 任务 ID：`TASK-20261012-019`
- 主题：原文切片入库 + 角色抽取&别名归一 + 角色卡 + 人工审核（API/CLI/Web）
- 分支：`main`
- 工作流上下文：`.workflow/context-sprint19.yaml`
- 最终状态：⚠️ **部分达成**——管线/落盘/审核闭环已交付并验证；**"人工修订率 < 30%" 未达成**（需真实 LLM，见下）

> 说明：本轮为**开发期最小成本**实现，抽取走**离线启发式基线**；LLM 路径已接线但本机无 key，未验证。

---

## 一、范围与产出

| 项 | 交付 |
|---|---|
| S19-1 项目/目录/存储 | `NovelProject` + `storage/novels/<id>/{source,chunks,characters,assets}` + storageService 扩展 |
| S19-2 来源接入 | `novelSourceService`：`qishuxia-txt`（两跳 Cookie + **GB18030** 解码，实测可用）；**只下载一次**（`source/raw.txt` 落地后复用，`force` 可强制重下）；逐章抓取为兜底（未实现，明确报错） |
| S19-3 文本清理 + 章节切分 | `novelChunkService`：**清理非原文内容**（水印/广告/导航/求票/重复标题变体/纯标点行/空行）→ **以 `source/cleaned.txt` 为准**；按"第X章/节"分章、合并重复标题空块、切片入库 |
| S19-4 角色抽取（**全书**） | `characterExtractionService`：**范围=整本小说**；LLM 路径 + 离线启发式；别名归一 |
| S19-5 角色卡 | `NovelCharacter`：`appearance/personality/voice/catchphrase/relations/abilities/growth` |
| S19-6 人工审核 | API（PATCH/approve/review-stats）+ **CLI**（`npm run novel`）+ **Web 页**（`#/novels`、`#/novel/:id`） |

---

## 二、真实 E2E 证据（《殖装》全书）

```
create  → 殖装 / 铅笔刀 / 科幻灵异
ingest  --url .../book/34639/               → chapterCount = 1206，空切片 0，总 346 万字
ingest  （二次）                             → downloaded = false（只下载一次，命中缓存）
extract --provider heuristic --min-freq 30  → 40 个角色
```

- **抓取（只下载一次）**：站点 TXT（GBK）两跳 Cookie 成功；二次摄取 `downloaded:false` 复用缓存；未绕过登录/验证码/加密。
- **清理（以清理后为准）**：`raw.txt` 135896 行 → `cleaned.txt` 66420 行；cleaned 已无水印（"一秒记住"）与重复标题（"第一节废墟中的男子()"）。
- **落盘**：`source/raw.txt`、`source/cleaned.txt`、`chunks/chunks.json`、`characters/characters.json`。
- **抽到真名**：罗比 / 辛格 / 朱尔 / 米雅 / 潘多 / 巴斯 / 邓尔 / 艾薇 / 雷亚 / 莫斯 / 米姬；**仍有噪声**：那就 / 尤其 / 通过 / 那种 / 曾经 / 包括 / 简直 / 空气 / 空间 ……（启发式低精度基线）。

---

## 三、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test` | **549 tests / 549 pass / 0 fail**（本 Sprint 新增 `tests/novelSeries.test.js` 5 例） |
| 测试隔离 | 开发库未被修改（projects/studios/imageAssets 不变） |
| `npm run lint` | 0 error / 0 warning |
| 前端可达 | `GET /js/views/novels.js` 200；`index.html` 含 `#/novels` 导航；`GET /api/novels` 200 |

---

## 四、验收对照

| 验收项 | 结果 |
|---|---|
| **全书** → 完整角色表 | ⚠️ 全书 1206 章 → 产出 40 个（**含噪声**，非"完整且干净"） |
| 每角色含 9 字段 | ✅ 字段齐全（启发式下卡片多为空，待人工/LLM 填充） |
| **修订率 < 30%** | ❌ **未达成**：启发式精度不足；需真实 LLM（本机无 key，未验证） |
| 落盘、重启不丢、**TXT 只下载一次**、**以清理后为准** | ✅ |
| 抓取不绕过反爬；取不到走粘贴 | ✅ |

---

## 五、已知限制与风险

1. **启发式精度低**：姓氏+词频+句首上下文，仍混入常用词；**达不到 <30% 修订率**。真实 LLM 路径已接线（`characterExtractionService` 的 `provider:'llm'`），但无 key 未验证。
2. **逐章抓取兜底未实现**：`qishuxia-chapters` 抛"未实现"；本期以 TXT 下载为准。
3. **别名归一为弱实现**：当前仅按同名合并 + 去重；跨称呼（如"三哥/林三"）需 LLM。
4. **前端未做真实浏览器 E2E**（环境无 Playwright），仅静态 + API 契约级。
5. 版权合规按用户决定"先忽略"，记为用户接受的合规风险；产出保留来源标注。

---

## 六、新增 / 修改文件

**新增**

- `src/models/NovelProject.js`、`src/models/NovelChunk.js`、`src/models/NovelCharacter.js`
- `src/services/novelProjectService.js`、`src/services/novelSourceService.js`、`src/services/novelChunkService.js`、`src/services/characterExtractionService.js`、`src/services/characterCardService.js`
- `src/routes/novels.js`
- `scripts/novel.js`
- `public/js/views/novels.js`
- `tests/novelSeries.test.js`
- `.workflow/context-sprint19.yaml`、`docs/sprint19-delivery-report.md`

**修改**

- `src/services/storageService.js`（novelProjects/novelChunks/novelCharacters）、`src/server.js`（挂载 `/api/novels`）、`public/js/api.js`、`public/js/app.js`、`public/index.html`、`package.json`（`novel` 脚本）、`README.md`

---

## 七、下一步建议

1. **接一个真实 LLM**（便宜模型即可），验证 `provider:'llm'` 路径并复测修订率 —— 这是达成 Sprint 19 验收的关键。
2. 补 `qishuxia-chapters` 逐章兜底。
3. 前端做一次真实浏览器走查。
4. **已并入后续需求**（记录于 `docs/novel-series-plan.md` §6）：
   - **LLM 供应商**：开发用 opencode-go 订阅；留多供应商 key 切换口子；后续按开源参考接入（Sprint 20）。
   - **角色成长状态**（Sprint 20）。
   - **剧本/分集规则（Sprint 21）**：1 章 ≥ 1 集、每集 85–95s（以**成片秒数**为准）、季按大事件/总结划分、每季 ≥ 200 集、以季为单元生成剧本。

**最终状态：`GLOBAL_IN_CONSISTENCY`（管线闭环 PASS；修订率验收未达成，待真实 LLM）。**
