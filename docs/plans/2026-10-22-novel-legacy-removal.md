# 小说域 Legacy 路径与代码移除计划

> 2026-10-22 · 基线分支 `feat/novel-pg-single-source` · 目标：小说域只保留 PostgreSQL 一条读写路径。
>
> 当前生产请求路径已不依赖内存投影；本计划处理剩余的兼容层、同步读导出、运维脚本分支和测试适配器。

## 1. 目标与非目标

**目标**

- 小说域读写只走 PostgreSQL，不再有 `NOVEL_WRITE_MODE`/`NOVEL_REPO_MODE` 开关。
- 删除 `db.json` 小说集合、启动水合、JSON 归档运行时逻辑。
- 删除 legacy/shadow 读适配器、同步列表导出和 JSON 分支。
- 测试同样跑 PG，不再用 legacy JSON 模式兜底。

**非目标**

- 其它域（用户/项目/社区/团队/计费）的 JSON 存储不在本计划内。
- 媒体文件仍按现有 local/WebDAV/Quark 方案，不迁入 PG。
- `db.json` 中非小说集合保留到各自域迁移完成。

## 2. 当前基线

- `a2f72c0` 起小说主表/子集合 PG 优先，JSON 仅本地缓存。
- `5cccf64`/`5fe1605`/`d6c9ed9`/`e4015f9` 已收口写路径、世界/资产/同步、集合选定/counts、运维脚本的 PG 读。
- 生产请求路径已不依赖 `storageService` 的小说内存投影。
- 验证基线：后端 820、前端 138、`series:verify` 33 季 / 8496 集 / 99.69% / 覆盖 99.98%。

## 3. 旧路径清单

| 位置 | 旧路径 | 处理阶段 |
|---|---|---|
| `src/config/index.js`、`src/db/config.js`、`src/app.js` | `NOVEL_WRITE_MODE` legacy/dual、`novelsRepo` | 3 |
| `src/services/storageService.js` | `hydrateNovelsFromPg`、`_archiveNovelCollections`、小说集合与 CRUD、`novelChildMirror` | 4 |
| `src/services/novelWriteSync.js` | `createNovelWriteSync`/outbox/dual 镜像类 | 3 |
| `src/services/novelChildWriteSync.js` | `createNovelChildWriteSync`/outbox/dual 镜像类 | 3 |
| `src/services/novelChildStore.js` | `JSON_WRITERS`、`isPgWriteMode` 分支、JSON 缓存写入 | 3/4 |
| `src/services/novelProjectService.js` | `getNovelProject` 同步、`listNovelProjects`、JSON create/update/delete、dual、legacy counts | 2/4 |
| `src/services/novelAsyncReadService.js` | `isPgReadMode`/legacy 分支 | 2 |
| `src/services/novelChildReadService.js` | `mode`/legacy 适配器、`getProject` 默认缓存 | 2 |
| `src/services/novelReadService.js` | `mode`/legacy 适配器 | 2 |
| `src/services/novelEpisodeStore.js` | `!isPgWriteMode()` JSON 分支 | 5 |
| `src/services/seriesPlannerService.js` | legacy JSON 分季路径、`cleanupOldEpisodesJson`、同步 `listSeasons/listEpisodes/getEpisode`、同步 estimate/consistency | 5 |
| `src/services/characterExtractionService.js` | 同步 `listCharacters/listCharacterSets`、storage project/set 读 | 2 |
| `src/services/worldbuildingService.js` | 同步 `listEntities/listSets/listRelations/summarize`、storage project/set 读 | 2 |
| `src/services/novelAssetService.js` | 同步 `listAssets/assetStats`、storage asset 读 | 2 |
| `src/services/characterGrowthService.js` | 同步 `listStates/getCharacterStateAt/buildTimeline/deriveCharacterStages/missingStatesForEpisode` | 5 |
| `src/services/novelChunkService.js` | 同步 `listChunks`、ingest 的 JSON 缓存清理/写入 | 4 |
| `src/routes/novels.js` | 残留同步 `listStates/getCharacterStateAt` 等 | 2 |
| `scripts/novel.js` | CLI 同步列表命令 | 2/5 |
| `scripts/run-tests.js`、`scripts/e2e-server.js` | `NOVEL_WRITE_MODE=legacy` 测试环境 | 1 |
| `tests/*` | JSON 读写模式、legacy/shadow 适配器断言 | 1 |
| `docs/**`、`AGENTS.md` | 旧开关/JSON 回退说明 | 5 |

## 4. 执行阶段

### Phase 0：冻结与证据

- 在 `feat/novel-pg-single-source` 上打 tag/记录当前 commit。
- 备份：`pg_dump` + `storage/archive/novels-from-db-*.json`。
- 运行基线：`npm run check`、`npm run series:verify -- <id>`、真实 API smoke。

**Gate**：基线全绿，恢复演练可执行。

### Phase 1：测试先迁 PG

- `run-tests.js`/`e2e-server.js` 移除 `NOVEL_WRITE_MODE=legacy`，改用 `_test` 库。
- 测试 fixture 通过 `createNovelProject`/`ingestNovel` 写 PG，读取全部走 PG。
- `novelRepository.test`/`novelChildRepository.test` 保留 PG 契约；删除仅测试 JSON 的小说用例。
- 新增“无 legacy 适配器”契约：读服务只接受 PG repo。

**Gate**：820 后端测试在 PG 测试库全绿；无测试依赖 `db.json` 小说集合。

### Phase 2：删除读适配器与同步导出

- `novelReadService`/`novelChildReadService` 删除 `mode`/legacy；生产与测试统一 PG。
- `getNovelProject` 改异步 PG；删除 `listNovelProjects`（改用 `novelReadService.list`）。
- `listCharacters/listCharacterSets/listEntities/listSets/listRelations/summarize/listAssets/assetStats` 全部异步 PG；更新 routes、scripts、tests。
- 处理 `selected-set` 已异步化的剩余默认参数，删除 `storageService.getNovelProject` 默认值。

**Gate**：`rg "mode: 'legacy'|legacyImpl|NOVEL_REPO_MODE"` 为 0；API smoke 通过。

### Phase 3：删除写模式与 outbox 镜像

- 删除 `NOVEL_WRITE_MODE` 与 `dual`：配置、健康检查、runbook、AGENTS。
- `novelChildStore` 只写 PG；删除 `JSON_WRITERS` 与 `isPgWriteMode` 分支。
- `novelProjectService` 只写 PG；删除 `novelMirror` schedule、dual 分支。
- `novelWriteSync`/`novelChildWriteSync`：保留 `applyNovelUpsert/Delete`、`applyChild*` 作为**离线迁移/恢复工具**，迁移到 `scripts/lib/` 或 `src/repositories/`；删除 outbox/mirror 类。
- `outboxWorker` 删除小说事件分支；小说域不再产生 outbox。

**Gate**：`rg "NOVEL_WRITE_MODE|novelMirror|createNovelWriteSync|createNovelChildWriteSync|outbox.*novel"` 为 0；outbox 无小说事件。

### Phase 4：删除 JSON 投影与 db.json 小说集合

- 删除 `hydrateNovelsFromPg`、`_archiveNovelCollections`、`_persistedSnapshot` 的小说分支。
- 删除 `storageService` 的小说集合字段/CRUD/镜像调用；非小说集合不动。
- `novelJsonArchive` 运行时删除；归档能力移到独立脚本 `scripts/archive-novel-json.js`（只读旧文件）。
- `novelChunkService` ingest 去掉 JSON 缓存清理/写入；`novelProjectService` 去掉 JSON create/update/delete。
- `db.json` 小说 key 一次性清理并归档；启动不再水合。

**Gate**：`rg "hydrateNovelsFromPg|novelProjects|novelChunks|novelCharacters|novelAssetImages" src/services` 只剩非小说引用或为 0；服务重启后 API 正常。

### Phase 5：删除同步生成/规划/资产残留

- `novelEpisodeStore` 删除 JSON 分支。
- `seriesPlannerService` 删除 legacy 分季路径、`cleanupOldEpisodesJson`、同步 list/estimate/consistency；保留 PG 路径。
- `novelAssetService` 删除同步 `listAssets/assetStats`；`persistIndex` 全异步。
- `characterGrowthService` 删除同步 `listStates`/`buildTimeline`/`deriveCharacterStages`/`buildAppearanceDirective`/`missingStatesForEpisode`，统一异步。
- `novelChunkService.listChunks` 改异步；更新 `verify-series`/`novel.js`。
- `scripts/novel.js` CLI 全部改 `await` 异步 PG；删除 legacy 开关提示。

**Gate**：`rg "storageService\\.(listNovel|getNovel|listSeasons|listEpisodes|getSeason|getEpisode|getCharacterSet|getWorldSet)" src` 为 0。

### Phase 6：文档与门禁收口

- 更新 `docs/architecture/postgres-single-source-design.md`、`database.md`、`novel-series-llm-plan.md`、runbooks、`AGENTS.md`。
- 删除 `NOVEL_WRITE_MODE`/`NOVEL_REPO_MODE`/`dual` 说明。
- 新增 CI grep 门禁：禁止 legacy 开关、同步小说集合读、outbox 小说事件。
- 最终验收：`npm run check`、PG 集成、E2E、`series:verify`、`pg_dump` 恢复演练。

**Gate**：文档端点缺失 0；所有旧路径 grep 为 0；恢复演练通过。

## 5. 文件级顺序

1. `tests/*` + `scripts/run-tests.js`（PG 测试）。
2. `src/services/novelReadService.js`、`novelChildReadService.js`、`novelAsyncReadService.js`。
3. `src/services/novelProjectService.js`、`novelChildStore.js`、`novelWriteSync.js`、`novelChildWriteSync.js`。
4. `src/services/storageService.js`、`novelChunkService.js`、`novelJsonArchive.js`。
5. `src/services/novelEpisodeStore.js`、`seriesPlannerService.js`、`novelAssetService.js`、`characterGrowthService.js`、`characterExtractionService.js`、`worldbuildingService.js`。
6. `src/routes/novels.js`、`scripts/novel.js`、运维脚本。
7. `src/config/index.js`、`src/db/config.js`、`src/app.js`、`AGENTS.md`、docs。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 测试迁 PG 后慢/不稳定 | 独立 `_test` 库、迁移一次、固定 fixture；失败按测试隔离 |
| 删除同步读导致 CLI/脚本漏改 | 先跑 `rg` 清单 + 逐个脚本 smoke；保留一个发布周期日志告警 |
| 删除 dual 后无法快速回滚 | 以 `pg_dump`/PITR 为唯一回滚；上线前做恢复演练 |
| 多实例内存缓存/写入竞争 | 删除投影后天然消除；PG advisory lock 已覆盖规划/重建 |
| 旧 db.json 误删 | 归档到 `storage/archive/`；只清理小说 key，非小说保留 |

**完成定义（DoD）**

- 小说域只有 PG 读写；无 JSON 小说集合、无启动水合、无 legacy/shadow/dual、无小说 outbox。
- `npm run check` 全绿，PG 测试/E2E/`series:verify` 通过。
- 代码 grep 门禁为 0；文档与 runbook 同步；`pg_dump` 恢复演练通过。
