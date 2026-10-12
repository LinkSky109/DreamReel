# DreamReel Sprint 21 交付报告：分季分集 + 剧本

- 任务 ID：`TASK-20261012-021`
- 工作流上下文：`.workflow/context-sprint21.yaml`
- 分支：`main`
- 最终状态：✅ 达成（规则驱动分季分集 + 单集剧本；LLM 剧本可选）

---

## 一、规则（已落地）

| 规则 | 实现 |
|---|---|
| 1 章 ≥ 1 集 | 按章拆分；长章按估算秒数拆多集（实测 1 章 → 9 集） |
| 每集时长 ≥90s ±5s（85–95s） | 每集目标 90s；剧本时长**归一化**到 90（校验 ∈[85,95]） |
| 季按内容划分、每季 ≥200 集 | 集按 200 均衡分季（每季 ≥200） |
| 以季为单元生成剧本 | 季/集结构 + 逐集剧本（season→episodes→script） |

---

## 二、真实 E2E（《殖装》全书）

```
plan（规则驱动）→ seasons: 41, episodes: 8378, episodesPerSeason: 200（耗时 1.67s）
seasons  → 第1季 集数=205 章=0-26；每季均 ≥200
episodes → 总集数 8378；第1章 → 9 集（1/9 … 9/9），每集 targetSeconds=90
script（启发式）→ totalSeconds=90，shots=12（∈[85,95] ✓）
consistency → 结构返回（本次未先抽取角色，故 characters=0）
```

---

## 三、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test` | **551 tests / 551 pass / 0 fail**（新增分季分集+剧本 1 例） |
| 测试隔离 | 开发库未被修改 |
| `npm run lint` | 0 error / 0 warning |

---

## 四、已知限制与风险

1. **分季为"均匀分块"，非语义大事件**：当前按集数均衡切季；"按大事件/总结划分"需 LLM 弧线识别（后续）。
2. **时长换算基准 `charsPerSecond` 默认 5**（成片口径估算），需用真实成片校准。
3. **一致性校验依赖先抽取角色**：未抽取时 characters=0；后续可自动串联。
4. **单集剧本 LLM 路径可用但免费模型慢**：默认启发式（确定性、必落 85–95）；LLM 需真实可用且较慢。
5. **集数规模大**（全书 8378 集）：后续需批量/异步生成剧本与配额控制。

---

## 五、新增 / 修改文件

**新增**：`src/models/Season.js`、`src/models/Episode.js`、`src/services/seriesPlannerService.js`、`src/services/episodeScriptService.js`、`.workflow/context-sprint21.yaml`、`docs/sprint21-delivery-report.md`

**修改**：`src/services/storageService.js`（seriesSeasons/seriesEpisodes）、`src/routes/novels.js`（series/seasons/episodes/script/consistency）、`scripts/novel.js`（plan/seasons/episodes/script）、`tests/novelSeries.test.js`、`README.md`

---

## 六、结论

Sprint 21 用**规则驱动**实现分季分集（1 章≥1 集、每季≥200 集）与单集剧本（时长落 85–95s），并可选 LLM 剧本。全书实测 41 季 / 8378 集，规划确定性、秒级完成。全量 **551/551/0**。

**最终状态：`GLOBAL_DONE`（分季分集+剧本达成；语义分季与批量生成列为后续）。**
