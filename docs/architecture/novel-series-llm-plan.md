# 小说分季分集（LLM 大事件 + 故事完整 + 85–95s）实施计划

> 状态：已确认需求，待另外两个会话（前后端分离 / 数据库 / 前端优化）收口后实施。
> 本文只描述设计与落地步骤，不含代码改动。

## 0. 需求确认（用户答复）

| 项 | 决策 |
|---|---|
| 分集大纲 | **懒生成**（进入/生成某集时再出） |
| LLM 供应商 | 复用现有 `llmProviderFactory`（项目级 → 用户级 → 全局 → Mock 四级回退） |
| 分季合并 | 只允许**相邻弧**合并，保持剧情连贯合理 |
| 存储冗余 | **去掉** `novelChunks.text` 与 `episodes/*.txt` 的重复，改为**偏移量**切分 |
| 当前项目 | **重建** 8378 集 |
| 兼容性 | 现有功能必须继续可用（API 形状、旧数据、测试） |

## 1. 现状核对

| 能力 | 位置 | 现状 |
|---|---|---|
| 分章切片 | `novelChunkService.splitChapters` | 已实现，粒度=章，正文存 `novelChunks.text` |
| 分季 | `seriesPlannerService.planSeries` | **纯规则**：`floor(总集数/200)` 均匀分块，无 LLM、无大事件 |
| 分集 | `seriesPlannerService.splitChapterIntoEpisodes` | **按字符均分**，非剧情边界；实测仅 71.4% 落在 85–95s |
| 单集分镜 | `episodeScriptService` | 已内置「剧本创作总监」系统提示词（与用户提供的剧本智能体提示词一致） |
| 分集大纲 | 无 | Episode 无 `outline` 字段 |
| 存储 | `novelChunks.text` + `episodes/*.txt` | 重复存储同一段正文 |

结论：分章与分季不重复（上下游），但分季/分集均未按用户设计实现。

## 2. 设计原则

1. **分层**：分章只管“把全文切成章”；分季只管“大事件→季”；分集只管“季内切集”；分镜才生成 shot。
2. **兼容优先**：新增能力全部**加性**；旧字段与旧读路径保留，旧 `sourceFile` 数据可继续读。
3. **懒生成**：分集大纲、分镜在需要时才调用 LLM；季规划一次性生成并缓存。
4. **幂等可续跑**：章摘要/弧线/大纲均落盘缓存，按 hash 校验，支持中断续跑与 `--force`。
5. **可回滚**：重建前备份 `db.json`，旧媒体归档到 `_archive/<ts>/`，不直接删除。
6. **时长硬约束**：85–95s 为验收线；对数学上无解的章节（死区）记录例外并最小化偏差。
7. **不冲突**：实施只改 `src/services`、`src/models`、`src/utils`、`scripts`、`tests`；`src/routes`、`src/db`、`src/repositories`、`web/` 需与对应会话协调后再动。

## 3. 存储改造（去冗余 + 偏移量）

### 3.1 偏移量口径

- 以 `source/cleaned.txt` 的 **UTF-16 code unit** 偏移为准（与 JS `String.slice` 一致）。
- 新增 `src/utils/textOffsets.js`：
  - `hashText(text)` → 稳定 hash（复用 `utils/hash`）。
  - `sliceByOffsets(text, start, end)`。
  - `locateChunks(cleanedText, chapters)`：把 `splitChapters` 结果映射为 `[{startOffset,endOffset}]`。
- 落盘校验：项目/章记录存 `cleanedHash`；hash 不一致时禁止按偏移读，提示重新摄取。

### 3.2 模型变更（加性）

```js
// NovelChunk（text 变为可选，兼容旧数据）
{ id, novelId, index, chapterTitle,
  startOffset, endOffset, wordCount,   // 新
  cleanedHash,                          // 新
  text }                                // 旧数据仍可能有；新数据不再写

// Episode
{ id, novelId, seasonId, episodeNo,
  chapterTitle, title, targetSeconds,
  chapterStart, chapterEnd,             // 新：可跨章
  startOffset, endOffset,               // 新：正文偏移
  estimatedSeconds,                     // 新：按 charsPerSecond 估算
  outline,                              // 新：懒生成的分集大纲
  status, screenplay,
  sourceFile }                          // 旧数据兼容；新数据为空

// Season
{ id, novelId, seasonNo, title, synopsis, episodeCount,
  arcName, goal, acts, endingHook,      // 新：LLM 大事件
  chapterStart, chapterEnd, estimatedEpisodes } // 新
```

### 3.3 兼容读取（关键）

新增统一读取器，所有旧调用点改用它：

```js
// 读章正文：优先 text，否则按偏移从 cleaned.txt 切
getChunkText(novelId, chunk)
// 读集正文：优先 sourceFile，否则按偏移切
getEpisodeText(novelId, episode)
```

- `novelChunkService.listChunks(novelId)` **仍返回带 `text` 的对象**（内部用 `getChunkText` 水合）。
  → `characterExtractionService`、`worldbuildingService`、`seasonAssetService`、`routes/novels.js` 无需改动。
- `episodeScriptService`、`characterGrowthService`、`checkConsistency` 改用 `getEpisodeText`。
- `seriesEstimate` 用 `sum(chunk.wordCount)`，不再依赖 `text`。
- PG/仓储层：`novelChildRepository` 里 `chunks.toDoc` 目前把 `content` 映射为 `text`；改造为优先用 `start_offset/end_offset`，`content` 可留空。**与 DB 会话对齐后再改**。

## 4. 分季：LLM 大事件 → 季（相邻合并）

### 4.1 流程

```
cleaned.txt + chunks(offsets)
  → [A] 章摘要（分批 LLM，1206 章 ≈ 80 次调用）
  → [B] 弧线识别（章摘要分窗输入，窗口重叠 + 边界合并）
  → [C] 季装配（相邻弧合并至 ≥200 集）
  → seriesSeasons + plan/arcs.json + plan/seasons.json
```

### 4.2 [A] 章摘要

- 批量：每 12 章一批，输入 `【章标题】正文节选`，要求输出严格 JSON。
- 输出：`[{ index, summary, events: string[], characters: string[] }]`
- 缓存：`storage/novels/<id>/plan/chapter-summaries.json`，按 `cleanedHash` + provider/model 校验。
- 失败重试：复用 `utils/llmRetry`；单批失败标记 `pending`，续跑只补缺失。

### 4.3 [B] 弧线识别

- 把章摘要压成 `index｜summary` 列表；单窗最多 300 条，窗口间重叠 20 条，避免切断大事件。
- Prompt：你是剧集策划，请把以下章摘要划分为「完整大事件/剧情弧」，每个弧必须闭合、不得跨弧拆事件；输出严格 JSON：
```json
[{ "name":"", "chapterStart":0, "chapterEnd":25,
   "goal":"", "acts":{"setup":"","confrontation":"","resolution":""},
   "endingHook":"", "summary":"" }]
```
- 多个窗口的结果按章节范围拼接；重叠区若同一事件被切两半，取覆盖更完整的弧，必要时二次 LLM 合并。
- 缓存：`plan/arcs.json`。
- 校验：弧必须连续覆盖 `0..chapters-1`，无空洞/重叠；否则回退启发式。

### 4.4 [C] 季装配（相邻合并，≥200 集）

- 每个弧估算集数：`episodes(arc) = ceil(charsInArc / (episodeSeconds × charsPerSecond))`。
- 顺序遍历相邻弧累加，累计 ≥200 即成一季；不足则继续并入下一弧。
- 单弧本身 >200：独占一季。
- 最后一季不足 200：默认并入前一季（保持连续）；若只剩一季则允许例外并标注。
- 季字段：`arcName/goal/acts/endingHook/chapterStart/chapterEnd/episodeCount`。
- **禁止跨弧重排**，只在相邻边界合并 → 满足“剧情连贯合理”。

### 4.5 无 LLM 回退

- `--no-llm` 或 provider 不可用：用章标题关键词 + 固定规模（约 200 集/季）分季，`provider='heuristic'` 标注，不阻断流程。

## 5. 分集：故事完整 + 85–95s

### 5.1 切分原则

1. 只在**自然边界**切：章末 > 节拍/场景 > 段落 > 句子（`。！？…；`）> 分句（`，、：`）。
2. 每集估算时长 `chars / charsPerSecond` 必须落在 `[85,95]`。
3. 尽量少跨章；跨章时标题显示章节范围。
4. 每集结尾尽量落在“钩子/悬念”节拍（由 LLM 节拍或段落边界近似）。

### 5.2 算法（已在真实 346 万字验证）

在**季范围内**对全书正文做一次全局切分：

- 字符窗口：`[85×cps, 95×cps] = [382, 427]`（cps=4.5）。
- 贪心 + 回填：
  1. 累积 token 到 ≥382 字符；
  2. 若加入下一 token 仍 ≤427，且（当前 <405 或 下一 token 是章末/节拍末）则继续；
  3. 否则在此切分；
  4. 末集 <382 时，对最后两集做均衡重切。
- 结果（模拟）：**8430 集，8428 集 ∈ [85,95]（99.98%）**，1161 集跨章，7269 集单章内。
- 死区章节（如 152s）数学无解：取最小偏差的均衡切分，记录到 `plan/exceptions.json`，验收时单列。

### 5.3 故事完整性增强（可选开关）

- `--llm-beats`：分批（每 5 章）让 LLM 输出剧情节拍边界与钩子：
```json
[{ "chapter":0, "beats":[{"at":120,"summary":"","hook":true}] }]
```
- 切分器优先在 beat 边界落刀；窗口内无 beat 时退回段落/句子边界。
- 默认关闭（控制成本），开启后边界更贴合剧情。

### 5.4 懒生成分集大纲

- 新服务 `episodeOutlineService.getOrGenerateOutline(novelId, episodeId)`：
  - 命中 `episode.outline` 直接返回；
  - 否则用第 3 节格式生成：
```json
{ "title":"第X集｜...", "coreConflict":"", "synopsis":"",
  "cliffhanger":"", "keyCharacters":[""] }
```
  - 输入：本集正文 + 季 `goal/acts` + 全书核心角色/设定（复用 `bookCoreLines`）；
  - 落盘：写回 `episode.outline`，并追加 `plan/episode-outlines.json` 缓存。
- 触发点：
  - `generateEpisodeScript` 开头（生成分镜前保证有大纲）；
  - 新增 `GET /api/novels/:id/episodes/:eid/outline`（显式请求时才生成，避免列表变慢）。
- 不影响列表接口：列表不返回/不生成 outline。

## 6. 服务与文件改动清单

| 文件 | 改动 |
|---|---|
| `src/utils/textOffsets.js` | **新增**：hash、偏移切片、章节定位 |
| `src/services/novelChunkService.js` | 写入偏移；`listChunks` 水合 `text`；`getChunkText` |
| `src/services/seasonPlanService.js` | **新增**：章摘要、弧线、季装配、缓存、回退 |
| `src/services/seriesPlannerService.js` | `planSeries` 改为：季规划（LLM/启发式）+ 新分集算法 + 偏移落盘；保留 `listSeasons/listEpisodes/seriesEstimate/checkConsistency` 签名 |
| `src/services/episodeOutlineService.js` | **新增**：懒生成大纲 |
| `src/services/episodeScriptService.js` | 用 `getEpisodeText`；生成前确保 outline |
| `src/services/characterGrowthService.js` | 用 `getEpisodeText` |
| `src/models/{NovelChunk,Episode,Season}.js` | 加字段（默认值，向后兼容） |
| `src/services/novelProjectService.js` | 加 `getChunkText/getEpisodeText`；保留 `readNovelFile/writeNovelFile` |
| `scripts/novel.js` | `plan` 增加 `--llm/--no-llm/--llm-beats/--force` |
| `scripts/rebuild-series.js` | **新增**：重建当前项目 |
| `scripts/verify-series.js` | **新增**：验收时长/覆盖/边界 |
| `tests/` | 新增偏移、分季合并、分集时长、懒大纲测试；保持旧测试通过 |

**暂不改**（等协作会话）：`src/routes/*`、`src/db/*`、`src/repositories/*`、`web/*`。
新增 outline 路由与前端展示放到协作收口后做。

## 7. 重建当前项目（47dd19996161517b）

`scripts/rebuild-series.js --novel 47dd19996161517b --provider project`：

1. 备份 `storage/data/db.json` → `db.backup-<ts>.json`。
2. 校验/重算 `source/cleaned.txt` 的 `cleanedHash` 与章偏移（缺失则从现有 `chunks` 反推）。
3. 生成章摘要与弧线（有缓存则复用；`--force` 重算）。
4. 装配季（相邻合并 ≥200）。
5. **归档旧产物**：旧 `seriesSeasons/seriesEpisodes` 记录、`episodes/*.txt`、`assets/*.json`、`handoff/*`、媒体文件 → `_archive/<ts>/`（`--purge` 才删除）。
6. 重置 `project.stage='series'`（解除锁定），重建季/集（偏移方式），`recomputeNovelCounts`。
7. 写 `plan/{chapter-summaries,arcs,seasons,exceptions}.json`；`_flush()`。
8. 运行 `verify-series.js`，输出达标率报告。
9. 可选：`--advance` 结束后把 stage 推回 `episodes`。

幂等：重复执行复用缓存；`--dry-run` 只报告不写。

## 8. 验收标准

1. **时长**：≥99% 集估算时长 ∈ [85,95]s；例外集全部在 `plan/exceptions.json` 中有原因（死区章节）。
2. **季**：每季 ≥200 集（最后一季例外），季边界只落在弧边界。
3. **故事完整**：每集结尾落在句/段/节拍边界，不得切在句中（自动校验）。
4. **覆盖**：所有章正文被集完整覆盖，无遗漏/重复（偏移连续性校验）。
5. **兼容**：
   - `npm test`、`npm run test:web`、`npm run typecheck`、`npm run lint` 全绿；
   - 旧项目（含 `sourceFile`）仍可读、可生成剧本/素材；
   - 列表/详情 API 字段形状不变（新字段为增量）。
6. **可回滚**：备份 + `_archive` 可恢复。

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| LLM 成本/耗时（摘要 ~80 次、弧线数次） | 批量 + 缓存 + `--no-llm` 回退 |
| 弧线跨窗切断大事件 | 窗口重叠 + 二次合并 + 连续性校验 |
| 与 DB/仓储会话冲突 | 只改服务层；`content` 列保留；偏移放 payload/新列，收口后对齐 |
| 破坏性重建 | 备份 + 归档 + `--dry-run` |
| 偏移失效（cleaned.txt 变化） | `cleanedHash` 校验，不一致拒绝按偏移读 |
| 懒大纲拖慢单集生成 | 仅剧本/显式 outline 接口触发，列表不触发 |

## 10. 实施阶段（建议顺序）

| 阶段 | 内容 | 产出 |
|---|---|---|
| P0 | `textOffsets` + 模型加字段 + `getChunkText/getEpisodeText` + `listChunks` 水合 | 行为不变，测试全绿 |
| P1 | 章偏移迁移 + 新分集算法（不接 LLM，覆盖旧字符切分） | `verify-series` 达标率报告 |
| P2 | `seasonPlanService`：摘要 → 弧线 → 相邻合并季 + 回退 | `plan/{chapter-summaries,arcs,seasons}.json` |
| P3 | 懒大纲服务 + 接入 `generateEpisodeScript` | 单集生成自动补大纲 |
| P4 | `rebuild-series.js` + 重建当前项目 + `verify-series` | 新 8430 集数据 |
| P5 | 与协作会话对齐后：outline 路由/前端展示、PG 仓储偏移列 | 全链路 |

## 11. 下游流程影响与兜底（逐段核对）

结论：**会有影响，但可通过“统一读取器 + 派生数据清理 + 短文本兜底”控制**。风险集中在三类。

### 11.1 必须改的读取点（否则读到空文本）

| 下游 | 现状 | 影响 | 兜底 |
|---|---|---|---|
| `episodeScriptService.generateEpisodeScript` | `readNovelFile(ep.sourceFile)` | 新集无 `sourceFile` → 空文本 → 分镜退化为乱码/启发式垃圾 | 改 `getEpisodeText(novelId, ep)` |
| `characterGrowthService.generateEpisodeStates` | 同上 | 出场角色判定失效 | 同上 |
| `seriesPlannerService.checkConsistency` | 同上 | 一致性校验全空 | 同上 |
| `novelChunkService` 各消费方 | `novelChunks.text` | 停止持久化后为空 | `listChunks` 水合；`getChunkText` |
| `routes/novels.js` 字数统计 | `chunk.text.length` | 显示 0 字 | 水合后自然修复 |
| `novelChildWriteSync`（dual→PG） | `content = doc.text` | PG 里 `content=''` | 与 DB 会话对齐：content 可空，读时按偏移水合 |
| `novelChildReadService`（postgres/shadow） | `text = row.content` | PG 读路径空文本 | 在 read service 中按 `start_offset/end_offset` 水合 |
| `scripts/migrate-novel-children-to-pg.js` | `doc.text → content` | 迁移写入空 | 同步改为写偏移 + 空 content |

> 关键：`novel_chunks.content` 是 `NOT NULL DEFAULT ''`，写空不会报错，**但会静默丢正文**——这是最隐蔽的风险，必须在水合层统一解决。

### 11.2 必须清理的派生数据（否则新旧数据串味）

| 数据 | 问题 | 处理 |
|---|---|---|
| `novelCharacterStates` | 表唯一键 `(novel_id, character_id, episode_no)`；集号重排后旧状态会命中新集，形象/装备错乱 | 重建时**删除该小说全部状态**，按需重跑 `backfill-character-states` |
| `episode.screenplay` | 旧分镜引用旧集 ID/视频 | 归档旧集记录，不迁移 |
| `assets/<episodeId>.json`、`images|videos|audio`、`handoff/<episodeId>` | 旧集 ID 失效 → 孤儿 | 移入 `_archive/<ts>/`（`--purge` 才删） |
| `sync/ledger.json` | 记录旧 `episodes/*.txt` 哈希 | 重建后重置该小说 ledger 或重新 sync |
| `plan/*.json` | 旧规划缓存 | 按 `cleanedHash` 校验，失效则重算 |

### 11.3 短文本 / 测试兜底（保证现有功能）

- 现有 `tests/novelSeries.test.js` 用约 30 字的样例小说，断言 `episodes >= 2`。
- 全局 85–95s 切分会把这种极短文本合成 1 集（约 6.7s），**会导致旧测试失败**。
- 规则：**当整本/整季内容 < 85s 时，退回“1 章 ≥ 1 集”**，每章至少 1 集，标记 `shortSource: true`；不强行套 90s。
- LLM 分季在测试/CI 环境默认走启发式（provider=mock 或未配置时不发网络请求），避免测试变慢/不稳定。

### 11.4 跨章集的语义变化

- 新集可能跨 2 章（约 14%），因此：
  - `Episode.chapterTitle` = 起始章标题；新增 `chapterStart/chapterEnd` 表达范围；
  - 前端展示建议 `起始章 … 结束章`；
  - `characterGrowthService` 的 `(ep.chapterIndex ?? 0)+1` 回退逻辑需改为优先 `episodeNo`（新集一定有）。
- `web/src/domain/types.ts` 中 `sourceFile?`、`chapterIndex?` 已是可选，前端未直接展示，风险低。

### 11.5 不受影响

- 剧本生成、素材生成、合成、导出、handoff 的**接口形状**不变（新字段为增量）。
- `episodeHandoffService` 只写 prompt/spec，不读 `sourceFile`（`importHandoffResult` 用的是外部传入路径）。
- `shotHandoffService`、`episodeComposeService` 依赖 `screenplay/assets`，重建后重新生成即可。

## 12. 待协作确认

- DB 会话：`novel_chunks` 是否新增 `start_offset/end_offset` 列，或放 `payload`；`content` 是否保留。
- 前端会话：Episode 类型新增 `outline/chapterStart/chapterEnd`；列表是否需要展示大纲（默认不要）。
- 两会话收口前，本计划只做 P0（纯服务层、无 schema 冲突）或整体等待。
