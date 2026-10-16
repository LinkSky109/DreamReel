# 小说 → 剧集 生产流水线 · 方案与排期（v0.1 · 待修订）

> 状态：**草案（留白待你修改）**。文中标 `（待定）` 与 `<!-- TODO -->` 的段落是我预留给你改的口子。
> 适用：单人开发、非商业化；开发期最小成本。

---

## 0. 决策记录（你已确认）

| # | 决策项 | 你的选择 |
|---|---|---|
| 1 | 小说来源 | `qishuxia.com`（奇书网）；**首选站点 TXT 下载**（GBK，实测可用）→ **只下载一次**并缓存；**以清理后文本为准**；逐章抓取为兜底；**先忽略版权合规**（记为"用户明确接受的合规风险"） |
| 2 | 最终产出 | **成片视频**（末段目标） |
| 3 | 开发成本 | **最小成本**（开发期走 mock/廉价 provider） |
| 4 | 存储 | 本地项目目录（MVP 落盘） + **夸克网盘**同步（参考 `ai-manga-factory/docs/夸克网盘业务产物同步.md`）；NAS 适配器保留 |
| 5 | MVP-1 范围 | 原文切片入库 + 角色抽取&别名归一 + 角色卡（外形/性格/声线）+ 人工确认界面/CLI；**验收：中篇产出完整角色表，人工修订率 < 30%** |
| 5a | 角色表范围 | **全书**（整本小说，不限章数） |
| 5b | 角色卡字段 | `name/aliases/appearance/personality/voice` **+ `catchphrase 口头禅 / relations 关系网 / abilities 能力 / growth 成长轨迹`**（要） |
| 5c | 风格粒度 | **全书统一** |
| 5d | 剧本/分集规则 | **1 章 ≥ 1 集**；**每集时长 ≥ 90s，误差 ±5s（85–95s，以成片秒数为准）**；**季按大事件/总结划分**；**每季 ≥ 200 集**；**以季为单元生成剧本** |
| 5e | LLM 供应商 | **开发阶段用 opencode-go 订阅**；**留多供应商 key 切换口子**；后续按开源参考接入其它供应商（记入 Sprint 20+） |
| 6 | 交互 | **Web UI**（接入 DreamReel SPA） |
| 7 | 规模 | 单人、暂不考虑商业化 |
| 边界 | 抓取 | **不绕过**登录/验证码/加密接口；能直取则直取，否则落入粘贴/上传 |

---

## 1. 端到端流水线

```
[1 小说获取] → [2 章节切分] → [3 角色抽取 + 别名归一] → [4 风格确定]
  → [5 角色生成(形象/性格/声线/成长状态)] → [6 分季分集 + 剧本]
  → [7 内容生成(图/音/视频)] → [8 成片] → [9 存储(本地/网盘/NAS)] → [10 项目管理/发布]
```

---

## 2. 抓取实测结论（qishuxia.com，2026-10-12）

- **可达性**：首请求 `403` 且 `Set-Cookie`（挑战 Cookie），**带该 Cookie 重放即 200** —— 属普通 Cookie 往返，无需 JS/验证码/登录。
- **编码**：`gbk`（需转码）。
- **书籍页**：含 `og:novel:book_name / author / category / status`，以及**章节目录**（`/book/<id>/<chapterId>.html`）。
- **章节页**：正文在 `<div id="content">`；需过滤水印（如"一秒记住【..info】"）与站内广告。
- **样例**：《殖装》/ 铅笔刀 / 科幻灵异 / 约 1209 章。
- **实现要点（逐章兜底）**：两跳 Cookie + GBK 解码 + HTML 提取 + **限速（如 ≥1 请求/秒）** + 失败如实报错。

### 2.1 首选：站点 TXT 下载（实测可用）

- 书籍页有 **TXT 下载**按钮：`/modules/article/txtarticle.php?id=<bookId>`。
- 实测：`id=34639` → **200**，`content-disposition: attachment; filename=殖装.txt`，**6.97 MB**，内容 `text/plain`，**GBK**（首字节 `【殖装】`）。
- 结论：**优先走 TXT 整本下载 → GB18030 解码 → 清理 → 本地分章**。**只下载一次**（`source/raw.txt` 落地后复用）；**以清理后文本（`source/cleaned.txt`）为准**进行切分与后续生成。
- 清理规则：去站点水印/广告/导航/求票、**重复标题变体**（如「第一节废墟中的男子()」）、纯标点行、折叠空行。
- 逐章抓取仅作 TXT 不可用时的兜底。

`<!-- TODO：若你要加其它站点，在此追加站点结构说明 -->`

站点适配器（可插拔）：

| 适配器 | 输入 | 说明 |
|---|---|---|
| `qishuxia-txt` | 书籍 URL/ID | **首选**：下载整本 TXT（GBK）→ 本地分章 |
| `qishuxia-chapters` | 书籍 URL | 兜底：两跳 Cookie + 逐章 `/book/<id>/<cid>.html` 抓取 |
| `text` | 粘贴/上传文本 | 最稳、合规、随时可用 |
| `file` | 本地 txt/epub | 离线导入 |

---

## 3. 架构设计

### 3.1 存储布局（本地，MVP）

```
storage/novels/<novelId>/
├─ meta.json          项目元信息（标题/作者/来源/风格/状态）
├─ source/raw.txt     原文（合并）
├─ source/chapters/   分章原文
├─ chunks/chunks.json 切片索引
├─ characters/*.json  角色卡（+ 后续形象图/音色样本）
├─ seasons/           分季分集（后续）
└─ assets/            图/音/视频（后续）
```

`storageBackend` 接口（MVP 实现 `LocalBackend`）：`read/write/list/remove/stat`。
**网盘目标 = 夸克网盘**（参考 `ai-manga-factory/docs/夸克网盘业务产物同步.md`）：cookie 登录（`quark_pan_cookie.txt`，密钥不入库）、`root_folder/business_folder` 目录层次、**dry-run**、**ledger 去重**、`only_completed_jobs`。注意该方案记录 Quark 真实上传曾有 TLS EOF 问题待处理。
NAS 适配器保留（`<!-- TODO：NAS 若要接，SMB/WebDAV/NFS/SFTP 选一 -->`）。

### 3.2 数据模型（新增）

| 模型 | 关键字段 |
|---|---|
| `NovelProject` | id, title, author, sourceType, sourceRef, style（待定）, status, dir |
| `Chunk` | id, novelId, index, chapterTitle, text, wordCount |
| `Character` | id, novelId, name, aliases[], description, card{appearance, personality, voice, **catchphrase, relations, abilities, growth**}, status(pending/approved), reviewEdits[] |
| `Season/Episode`（后续） | id, novelId, seasonNo, episodeNo, title, synopsis, chunkRange, projectId |
| `CharacterState`（后续，成长） | characterId, episodeRef, appearanceDelta, relationships, abilities |

### 3.3 服务与接口（新增）

| 服务 | 职责 |
|---|---|
| `novelProjectService` | 项目 CRUD + 目录管理 |
| `novelSourceService` | 来源适配器（text / qishuxia / url-generic / file） |
| `novelChunkService` | 章节识别 + 切片 |
| `characterExtractionService` | LLM 抽取角色 + **别名归一** |
| `characterCardService` | 角色卡（外形/性格/声线描述） |
| `storageBackend`（接口） | LocalBackend；Cloud/Nas 预留 |

接口（`/api/novels`）：`POST /`（建项目）、`POST /:id/ingest`（来源→切片）、`POST /:id/extract`（角色抽取）、`GET/:id/characters`、`PATCH /:id/characters/:cid`（审核/修订）。
UI：`#/novels` 列表、`#/novel/:id` 项目（来源/切片/角色表/审核）。CLI：`npm run novel -- <cmd>`。

### 3.4 复用现有模块

LLM/剧本 `scriptService`·`llmProviderFactory`；风格 `styleService`·`directorProfiles`；形象 `imageService`；音色 `dubbingService`·`ttsProviderFactory`；视频 `videoService`；存储 `storageService`·`config.storage.path`。

---

## 4. 最小成本策略

- 开发期走 mock provider 打通链路；**角色抽取/剧本**这类需要语义的任务接**可配置的真实 LLM**（mock 只能冒烟，不能达标，会如实标注）。
- 不引入新运行时依赖；抓取用内置 fetch，不用无头浏览器。
- 抓取**限速 + 超时 + 失败如实报错**，无后台常驻爬虫。

### 4.1 LLM Provider 策略：采用 Vercel AI SDK（多供应商统一层）

参考文档：https://ai-sdk.dev/docs/introduction

- **为什么**：AI SDK 用**统一接口**屏蔽各供应商差异；`generateText` + `Output.object({ schema })`（Zod）做**结构化输出**，正好用于角色抽取与剧本 JSON（自带校验，替代手写 JSON 解析）。
- **开发阶段**：用 **opencode-go 订阅**作为 LLM 来源。AI SDK 生态里有 **OpenCode Provider**（社区包 `ai-sdk-provider-opencode-sdk`）与 **OpenAI 兼容 Provider**（`@ai-sdk/openai-compatible`），二者都可指向 opencode-go（具体接入方式待你确认）。
- **留口子（多供应商 key 切换）**：新增 `ai-sdk` LLM provider 适配，包在现有 `llmProviderFactory` 接口内；供应商 = 配置（`provider` + `model` + `apiKey`/`baseURL`），可逐个切换，支持官方 provider（OpenAI/Anthropic/Google/DeepSeek/Groq/…）与 OpenAI 兼容/自建。
- **依赖影响**：会新增运行时依赖（`ai` + 所选 provider 包 + `zod`），与"最小依赖"取舍——**你点名此方案，视为接受**。
- **落地**：Sprint 20（见 §6）。
- 参考链接：
  - 简介：https://ai-sdk.dev/docs/introduction
  - 供应商与模型（含 OpenCode Provider / OpenAI 兼容）：https://ai-sdk.dev/docs/foundations/providers-and-models
  - 结构化输出：https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- **接入方式（已定）**：开发阶段 LLM 来源使用社区包 **`ai-sdk-provider-opencode-sdk`**（AI SDK 的 OpenCode Provider）。落地见 Sprint 20。

---

## 5. Sprint 19（MVP-1）范围与验收

**范围**：NovelProject + 目录 + LocalBackend 接口；来源（**TXT 下载只下一次 + 清理后为准** / text / 逐章兜底）→ 章节切分 → **切片入库**；**角色抽取 + 别名归一**；**角色卡**（外形/性格/声线 + 口头禅/关系网/能力/成长轨迹）；**Web 审核页 + CLI 审核**。

**验收**：
1. 范围 = **全书**（整本小说）→ 产出**完整角色表**（主要角色齐全、别名归一到唯一实体）。
2. 每个角色含 `name / aliases / appearance / personality / voice / catchphrase / relations / abilities / growth`。
3. **人工修订率 < 30%** = 人工修订字段数 ÷ 自动产出字段总数（审核页记录每次编辑，可统计）。
4. 原文 + **清理后文本** + 切片 + 角色卡**落盘、重启不丢**；TXT **只下载一次**。
5. 抓取不绕过反爬；TXT 与逐章都取不到时走粘贴/上传，如实失败。

---

## 6. Sprint 20–23 大纲（记录备查）

### Sprint 20 — 风格确定 + 角色资产 + 成长状态
- 风格确定：复用 `styleService`（导演风格/色调）产出全局风格 + 角色造型基调。
- **LLM 接入（Vercel AI SDK）与多供应商 key 切换**：新增 `ai-sdk` provider 适配（包 `llmProviderFactory`），用 `generateText`+`Output.object`(Zod)；开发用 opencode-go；供应商/model/key 可切换（官方 provider + OpenAI 兼容）。参考 `ai/docs/novel-series-plan.md` §4.1。
- 角色**形象图**（`imageService`，先 mock）、**音色样本**（TTS，先 mock/占位）。
- **角色成长状态**：按章节/集记录外貌/关系/能力演进（`CharacterState`）。
- 验收：每角色出形象+音色+可查询成长轨迹；风格全局可锁定；LLM 路径跑通（opencode-go）。

### Sprint 21 — 分季分集 + 剧本
- **分季**：按**大事件/剧情总结**划分季；**每季 ≥ 200 集**。
- **分集**：**1 章 ≥ 1 集**（1 章可拆多集）；**每集（成片）时长 ≥ 90s，误差 ±5s（85–95s）**。
- **以季为单元生成剧本**（复用 `scriptService`）；跨集角色/设定一致性校验。
- 验收：一本小说 → 季/集结构与分集剧本；满足 ≥200 集/季、1 章≥1 集、每集 85–95s。
- 时长口径：**以成片秒数为准**（85–95s）；剧本阶段按预估"每秒台词/分镜"换算到分镜数。
- **后续（记录）**：
  - **语义分季（LLM 弧线识别）**：用 LLM 按"大事件/剧情弧线"划分季，替代当前"均匀分块"。
  - **批量生成异步/配额**：全书可达 8000+ 集，逐集生成需异步任务 + 并发/配额控制。

### Sprint 22 — 内容生成（图/音/视频）
- 分集生成：分镜/图片/配音/字幕/（可选）视频片段，复用 `videoService`/`editPlanService`。
- 验收：单集可产出可预览的图/音/视频素材。

### Sprint 23 — 成片 + 存储同步 + 发布
- **成片合成**（`videoCompositingService`）+ 后续处理。
- **存储同步**：**夸克网盘**适配器（参考 ai-manga-factory：cookie 登录 + dry-run + ledger 去重）+ 冲突/重试；NAS 保留。
- 发布/导出（对接 gallery/studios）。
- 验收：`书名 → 可交付剧集包`，并同步到目标存储。

`<!-- TODO：20–23 的优先级/是否拆分/里程碑时间，你可在此调整 -->`

---

## 7. 风险与边界

1. **版权/合规**：你已明确"先忽略"，记为**用户接受的合规风险**；产出保留来源标注，责任边界由你确认。
2. **抓取边界**：不绕过登录/验证码/加密/Cookie 伪造以外的技术保护；站点改版会失效，需维护。
3. **抽取质量**：依赖 LLM；mock 下无法达到"修订率<30%"。
4. **成本/规模**：长篇 × 真实模型调用费用，需预算。
5. **长文本一致性**：跨季集角色一致性与"成长"建模是难点。
6. **存储同步**：凭据安全、冲突、失败重试；不得泄露用户密钥。

---

## 8. 决策落实与留白

已按你的答复落实：

- [x] 来源首选：**站点 TXT 下载（GBK）**
- [x] MVP-1 样本：《殖装》**前 100 章**
- [x] 角色卡字段：**含** 口头禅 / 关系网 / 能力 / 成长轨迹
- [x] 网盘：**夸克网盘**（参考 `ai-manga-factory` 方案）
- [x] 风格粒度：**全书统一**

仍留白（你随时改）：

- [ ] **提供火山方舟 Ark key（`SEEDANCE_API_KEY`）与 `SEEDANCE_MODEL`（Doubao-Seedance-2.5 的模型/端点 ID）**，以跑通真实视频生成。
- [ ] 其它站点适配器与结构说明。
- [ ] NAS 是否/何时接、协议（SMB/WebDAV/NFS/SFTP）。
- [ ] 人工审核判定口径（"修订字段数 ÷ 字段总数"）是否作为 <30% 的唯一口径。
- [ ] 20–23 里程碑时间与优先级。
- [ ] `<!-- TODO：其它你想加的 -->`

## 9. 视频与成片：待办（A/B/C，2026-10-16 记录，暂缓）

> 现状：单集视频只出 1 段 5s「整集代表片段」，成片用 `-stream_loop` 循环到 90s + 旁白；
> 剧本的 `shots` 未参与视频/成片。当前 `VIDEO_PROVIDER=seedance`（Agent Plan `/api/plan/v3`）
> 报 `UnsupportedModel: does not support the agent plan feature`。
> **当前决定：暂不升级 plan。** 先做「设定图集」为后续图生视频铺路。

- [ ] **A. 修视频连通**：Seedance 换标准 `/api/v3`（或改用支持 Agent Plan 的模型/供应商），让视频真实出片。
- [ ] **B. 按镜头多段生成**：`screenplay.shots` 每段生成 N 秒视频 → `compose` 拼接，做成真「分镜成片」。
- [ ] **C. 成片增强**：镜头拼接 + 旁白对时 + 字幕 + BGM/音效（复用 `bgmLibrary`/`sfxLibrary`/`sceneLibrary`）+ 转场。

建议顺序：A → B → C。

## 10. 设定图集（当前进行中）

为「图生视频」预先产出成套设定图（角色/衣物/装备/建筑/场景/道具…），
复用图片 provider（`doubao-seedream-5.0-pro`，当前 plan 可用）；Entity/角色可作为候选来源一键生成。
