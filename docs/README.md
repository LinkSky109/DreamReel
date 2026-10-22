# DreamReel / 梦卷 — 项目目录说明

> 本文档说明仓库各目录的职责与相互关系。
> 面向新加入的开发者 / AI Agent 快速建立整体认知。

## 1. 项目简介

DreamReel（梦卷）是一个 AI 短片创作平台：从一句话想法到成片输出，覆盖剧本、分镜、生成、配音、字幕全链路。

- **后端**：Node.js >= 20.19 + Express 5（ES Modules），源码在 `src/`
- **前端**：React 19 + TypeScript + Vite，源码在 `web/`，构建产物输出到 `public/`
- **存储**：默认 JSON 文件库（`storage/data/db.json`），可选 PostgreSQL（Kysely）
- **小说剧场**：书名/链接 → TXT 摄取 → 分章 → 分季分集 → 角色/世界观抽取 → 单集剧本/素材生成

技术栈与快速开始见根目录 `README.md`；前端细节见 `FRONTEND-DEVELOPMENT.md`；架构决策见 `docs/adr/`。

## 2. 顶层目录

| 路径 | 说明 |
|---|---|
| `src/` | 后端源码（Express 服务） |
| `web/` | 前端源码（React + Vite，TS/TSX） |
| `public/` | 前端构建产物 + 静态资源（Express 静态托管） |
| `storage/` | 运行期数据与生成产物（JSON 库 + 小说/图片/视频/音频） |
| `docs/` | 项目文档（本目录：ADR、API、架构） |
| `ai/` | AI 工作流文档、Sprint 交付报告、上下文快照、参考资料 |
| `tests/` | 后端测试（Node 内置 test runner） |
| `scripts/` | 运维 / 迁移 / 种子 / 校验脚本 |
| `deploy/` | Docker Compose 与 Nginx 配置 |
| `litellm/` | LiteLLM 网关配置 |
| `node_modules/` | 依赖（勿提交） |

### 顶层关键文件

| 文件 | 说明 |
|---|---|
| `package.json` | 依赖与脚本（`npm run start/dev/build/test/lint/typecheck/novel`） |
| `src/server.js` / `src/app.js` | 后端入口与应用装配 |
| `web/vite.config.ts` | 前端构建配置（产物 → `public/`） |
| `.env.example` | 环境变量模板（Provider / 数据库 / 存储路径等） |
| `AGENT-HANDOFF.md` | 跨会话交接说明 |
| `docs/api/v1.md` | 开放 API v1 文档 |
| `docs/architecture/route-inventory.md` | 全部路由清单（自动生成） |

## 3. 后端 `src/`

| 路径 | 说明 |
|---|---|
| `src/app.js` / `server.js` | Express 应用装配与启动 |
| `src/routes/` | 路由层（45 个域，如 `projects`、`video`、`audio`、`novels`、`community`…） |
| `src/services/` | 业务服务层（82 个，核心逻辑；含 `storageService` 数据访问门面） |
| `src/providers/` | 外部 Provider 适配（LLM / 视频 / 图片 / TTS，含 Mock 与真实实现） |
| `src/models/` | 领域模型（Project、Shot、Episode、NovelCharacter、WorldEntity…） |
| `src/middleware/` | 中间件（auth、rateLimit、validate、idempotency、mediaAccess…） |
| `src/config/` | 配置与内置库（场景库、BGM/SFX、导演档案、模型定价、ComfyUI 工作流） |
| `src/db/` | PostgreSQL 访问层（Kysely client + SQL 迁移） |
| `src/repositories/` | 仓储层（PostgreSQL 迁移目标） |
| `src/contracts/` | 接口契约 |
| `src/http/` | HTTP 相关工具 |
| `src/utils/` | 通用工具（ffmpeg、hash、idGenerator、pool、textChunking、titleCard…） |

### 小说剧场相关服务（重点）

| 服务 | 职责 |
|---|---|
| `novelProjectService.js` | 项目 CRUD、阶段推进、落盘读写（`writeNovelFile`/`readNovelFile`） |
| `novelChunkService.js` | 摄取：来源 → 清洗 → 分章切片 |
| `characterExtractionService.js` | 全书角色抽取（别名归一，离线启发式 + LLM） |
| `characterCardService.js` | 角色卡（八大类） |
| `worldbuildingService.js` | 世界观设定集（13 类模块） |
| `seriesPlannerService.js` | 分季分集规划，**生成 `episodes/` 文本文件** |
| `episodeScriptService.js` | 单集剧本（分镜表）生成 |
| `episodeAssetService.js` | 单集素材（图/音/视频）生成 |
| `episodeComposeService.js` | 单集合成 |
| `bulkEpisodeService.js` | 批量生成（分批续跑） |
| `episodeHandoffService.js` | 单集生成提示交接包 |
| `novelSyncService.js` | 云盘同步（local/webdav/quark） |

## 4. 前端 `web/` 与 `public/`

| 路径 | 说明 |
|---|---|
| `web/src/` | React 19 + TS 源码（页面、组件、hooks、API 客户端） |
| `web/index.html` | 入口 HTML |
| `web/vite.config.ts` | Vite 配置（构建到 `public/`） |
| `web/tsconfig.json` | TS 严格模式配置 |
| `public/` | 构建产物 + 静态资源（`index.html`、`assets/`、`js/`、`css/`、`media/`、`sw.js`、`manifest.webmanifest`） |

## 5. 存储 `storage/`

| 路径 | 说明 |
|---|---|
| `storage/data/db.json` | 主 JSON 数据库（25 个集合） |
| `storage/data/db.backup-*.json` | 自动备份 |
| `storage/novels/<novelId>/` | 每部小说的落盘工作区（详见下节） |
| `storage/images/novels/<id>/` | 小说生成的图片素材 |
| `storage/videos/novels/<id>/` | 小说生成的视频（含 `shots/` 分镜） |
| `storage/audio/voices/novels/<id>/` | 小说配音（按集/按句） |
| `storage/audio/bgm|sfx|previews/` | 配乐、音效与混音预听 |
| `storage/exports/novels/<id>/` | 小说产物导出 |
| `storage/exports/novel-*.{json,md}` | 角色/世界观导出 |
| `storage/metrics/` | 用量指标 |
| `storage/comfyui-verify/`、`media-verify/`、`metrics-verify/` | 校验产物 |
| `storage/test-phase1/`、`test-run/` | 测试隔离数据（不污染开发库） |
| `storage/.quark-cookie` | 夸克云盘登录 Cookie（敏感，勿提交） |

### 小说工作区 `storage/novels/<novelId>/`

以当前项目 `47dd19996161517b`（《殖装》/ 铅笔刀）为例：

| 路径 | 说明 |
|---|---|
| `source/raw.txt` | 原始正文（GB18030 解码后） |
| `source/cleaned.txt` | 清洗后正文（去水印/广告/重复标题，**以此为准**） |
| `chunks/chunks.json` | 分章索引（`index` / `chapterTitle` / `wordCount`） |
| `characters/characters.json` | 角色抽取结果（含别名与角色卡） |
| `worldbuilding/entities.json` | 世界观实体 |
| `art/assets.json` | 设定图集元数据 |
| `episodes/<episodeId>.txt` | **每集源文本片段**（详见下节） |
| `assets/<episodeId>.json` | 每集素材产物（图/音/视频） |
| `handoff/<episodeId>/` | 单集生成提示交接包（`prompt.txt` + `spec.json` + `refs/`） |
| `sync/ledger.json` | 云盘同步台账 |

## 6. `episodes/` 目录说明（重点）

路径：`storage/novels/<novelId>/episodes/`

### 内容

- 该目录下是**按「集」切分并落盘的小说源文本片段**，每个 `.txt` 文件对应一集。
- 文件名 = 该集的 `episode.id`（16 位十六进制，由 `src/utils/idGenerator.js` 的 FNV-1a 生成，如 `ef9ba1cac7c0ba45.txt`）。
- 文件内容是这一集要改编的小说正文（来自 `source/cleaned.txt` 的对应片段）。
- 当前《殖装》项目共有 **8402 个文件**（数据库登记 8378 集，41 季，1206 章）。

### 生成方式

`src/services/seriesPlannerService.js:111-113`：

```js
const rel = `episodes/${ep.id}.txt`
writeNovelFile(novelId, rel, p.text)
ep.sourceFile = rel
```

即：分季分集时，把每集的正文片段写入 `episodes/<episodeId>.txt`，并把相对路径记到 `episode.sourceFile`。后续剧本/一致性校验服务通过 `readNovelFile(novelId, ep.sourceFile)` 读取。

### 切分规则

- **1 章 ≥ 1 集**：短章直接对应 1 集；长章按目标时长切成多集（如「第一节 废墟中的男子」被切成 1/9 … 9/9）。
- 正常文件约 1–1.3 KB，即该集的正文片段。
- **极小文件（约 43–52 字节）**：如 `f9b54723037b5c92.txt` 内容为 `第二卷宇宙佣兵]第四二二节抵达`。这类是集内片段为空、只剩章节标题的占位文件，属于切分产生的边界情况，不是损坏。

### 命名与元数据

文件名本身不携带语义，**集标题/序号需查数据库**：

```
db.json → seriesEpisodes[id] → { episodeNo, chapterTitle, title, targetSeconds, sourceFile, status }
```

例如 `ef9ba1cac7c0ba45` → `episodeNo: 1`、`title: "第一节 废墟中的男子（1/9）"`、`status: "composed"`。

## 7. 文档 `docs/`

| 路径 | 说明 |
|---|---|
| `docs/README.md` | 本文件：项目目录说明 |
| `docs/adr/` | 架构决策记录（0001 PostgreSQL、0002 前后端分离、0003 多租户+RBAC、0004 后端框架） |
| `docs/api/v1.md` | 开放 API v1 文档 |
| `docs/architecture/database.md` | 数据库结构 |
| `docs/architecture/route-inventory.md` | 路由清单（`npm run inventory` 生成） |
| `docs/architecture/storage-inventory.md` | 存储清单（`npm run inventory` 生成） |
| `docs/architecture/novel-series-llm-plan.md` | 小说 LLM 分季分集（大事件 + 85–95s）设计与实施结果 |
| `docs/architecture/postgres-single-source-design.md` | PostgreSQL 单一事实源：结构化数据全量落库设计 |
| `docs/runbooks/novel-pg-restore.md` | 小说 PG 数据灾难恢复（从 JSON 重建） |
| `docs/runbooks/` | 运行手册、切换/回滚步骤与演练清单 |
| `docs/delivery/` | 交付总结与验证记录 |

## 8. AI 工作流 `ai/`

| 路径 | 说明 |
|---|---|
| `ai/docs/` | PRD、需求分析、Sprint 交付报告、前端分阶段交付文档（80+ 篇） |
| `ai/workflow/` | 各 Sprint 上下文快照（`context-sprintN.yaml`） |
| `ai/refs/` | 参考资料（架构报告、UI 设计、检索/抓取结果） |
| `ai/allnall/` | 辅助产物 |

## 9. 测试 `tests/` 与脚本 `scripts/`

| 路径 | 说明 |
|---|---|
| `tests/*.test.js` | 后端测试（Node 内置 runner，独立 STORAGE_PATH） |
| `web/src/**/*.test.tsx` | 前端测试（Vitest + Testing Library） |
| `scripts/run-tests.js` | 测试编排入口（`npm test`） |
| `scripts/novel.js` | 小说流水线 CLI（`npm run novel`） |
| `scripts/inventory.js` | 生成存储/路由清单 |
| `scripts/db-migrate.js` | 数据库迁移 |
| `scripts/rebuild-series.js` | 重建小说分季分集（`npm run series:rebuild`） |
| `scripts/verify-series.js` | 校验分集时长/覆盖/边界（`npm run series:verify`） |
| `scripts/backfill-novel-write-model.js` | 回填小说 PG 写模型（`npm run db:backfill:novel-write`） |
| `scripts/restore-novel-from-json.js` | 从 JSON 恢复小说 PG 数据（`npm run db:restore:novel`） |
| `scripts/verify-*.js` | Provider / 媒体 / 指标校验 |

## 10. 部署 `deploy/`

| 路径 | 说明 |
|---|---|
| `deploy/docker-compose.dev.yml` | 开发环境编排 |
| `deploy/nginx.conf` | 反向代理配置 |
| `Dockerfile.api` / `Dockerfile.web` / `docker-compose.yml` | 容器化部署 |

## 11. 数据流速览（小说剧场）

```
书名/URL
  → source/raw.txt → source/cleaned.txt        (novelChunkService: 摄取/清洗/分章)
  → chunks/chunks.json + db.novelChunks
  → characters/characters.json                (characterExtractionService)
  → worldbuilding/entities.json                (worldbuildingService)
  → episodes/<episodeId>.txt × N               (seriesPlannerService: 分季分集)
  → 单集剧本 screenplay                         (episodeScriptService)
  → assets/<episodeId>.json + images/videos/audio  (episodeAssetService)
  → handoff/<episodeId>/                        (episodeHandoffService)
  → 云盘同步                                     (novelSyncService → sync/ledger.json)
```
