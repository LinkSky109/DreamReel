# Runbook：小说 PostgreSQL 数据恢复

> 2026-10-22：小说域固定 PostgreSQL 单源。恢复优先级如下：
> **1) `pg_dump`/PITR 恢复 → 2) 归档 JSON 应急重建 → 3) 从 `cleaned.txt` 重新摄取**。
>
> 归档 JSON 只读，不参与运行时；读取归档的脚本在 `scripts/check-legacy-paths.js` allowlist 中登记。

## 症状

- 小说列表为空 / 详情 404；
- 前端能打开某集，但操作报 `episode not found`；
- PG 中 `novels / seasons / episodes / novel_sources` 行数为 0 或明显少于基线。

## 常见原因

1. **误删 `default` 组织**：`organizations` 被删除后，`novels / seasons / episodes / chunks / characters / ...` 会按外键级联清空。
2. 测试/清理脚本按组织删除，而不是按 `novel_id` 删除。
3. 重建/迁移过程中断，PG 只写入了一半。

## 预防（重要）

- **不要删除 `default` 组织**。测试请使用独立 org，或只按 `novel_id` 清理。
- 重建前停止旧版本 Web 实例；脚本已有端口占用保护。
- 每次重建/批量迁移前执行 `pg_dump`（或确认 PITR 可用），并运行 `npm run series:verify -- <id>` 留基线。
- 不在请求路径或启动路径读取 `storage/archive/novels-from-db-*.json`。

## 方案一：从 pg_dump / PITR 恢复（首选）

```bash
# 示例：把备份恢复到新库并校验
createdb -h localhost -U dreamreel dreamreel_restore
pg_restore -h localhost -U dreamreel -d dreamreel_restore /backup/dreamreel.dump

DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel_restore \
  npm run db:status
DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel_restore \
  npm run series:verify -- <novelId>
```

校验通过后切换 `DATABASE_URL` 并重启应用。正式环境优先使用云厂商 PITR 恢复到指定时间点。

## 方案二：从归档 JSON 应急重建（无可用备份时）

前提：`storage/archive/novels-from-db-*.json`、`storage/novels/<id>/source/cleaned.txt` 仍在。

```bash
npm run db:restore:novel -- --novel <novelId>
# 或指定归档
npm run db:restore:novel -- --novel <novelId> --from storage/archive/novels-from-db-<timestamp>.json
```

脚本会：

1. 自动选择最新 `storage/archive/novels-from-db-*.json`（或 `--from`）；
2. 确保 `organizations` 存在；
3. 从归档 upsert `novels` 项目；
4. upsert 角色/世界观/资产/状态/备选集合；
5. 调 backfill 恢复 `novel_sources / novel_chunks / seasons / episodes / plan`；
6. 输出 PG 计数。

> 该脚本属于离线恢复工具，保留对归档与旧存储的读取；不得被 API、启动流程或测试编排引用。

## 方案三：从 `cleaned.txt` 重新摄取

归档也缺失时：

```bash
# 1) 确认 source/cleaned.txt 存在
ls -lh storage/novels/<novelId>/source/cleaned.txt
# 2) 重新摄取/分章（按 CLI 提示，通常需要 --url 或 --text-file）
npm run novel -- ingest <novelId> --url <source-url>
# 3) 重建季/集（事务内写 PG）
npm run series:rebuild -- --novel <novelId> --advance
npm run series:verify -- <novelId> --strict
```

## 手动检查（脚本不可用时）

```bash
# 1) 检查归档是否完整
ls -lh storage/archive/novels-from-db-*.json
node -e "const fs=require('fs'); const f=fs.readdirSync('storage/archive').filter(x=>x.startsWith('novels-from-db-')).sort().pop(); const d=require('./storage/archive/'+f); for (const k of ['novelProjects','novelChunks','seriesSeasons','seriesEpisodes','novelCharacters','novelWorldEntities','novelAssetImages']) console.log(k,Object.keys(d.collections[k]||{}).length)"

# 2) 重建 default 组织
#    psql: INSERT INTO organizations (id,name,slug,plan) VALUES ('default','Default','default','free') ON CONFLICT DO NOTHING;

# 3) 恢复项目（applyNovelUpsert）+ 子集合（applyChildUpsert）
#    node scripts/restore-novel-from-json.js --novel <id>
```

## 验证

```bash
npm run db:status
npm run series:verify -- <novelId> --strict
npm run check:legacy

curl -s http://localhost:3001/api/novels/<id>/episodes | jq '.data | length'
curl -s http://localhost:3001/api/novels/<id>/seasons | jq '.data | length'
curl -s http://localhost:3001/api/novels/<id>/consistency | jq '.data'
```

期望（《殖装》）：

- `novels=1`、`novel_sources=1`、`novel_chunks=1206`
- `seasons=33`、`episodes=8496`
- `episodes.logical_key` 非空 8496
- 单集剧本/分镜/资产/合成/交接/大纲接口正常
- 服务重启后不读取 `db.json` 小说集合

## 媒体文件

恢复只重建 PG 元数据，不移动图片/视频/音频；媒体仍在本地/网盘/NAS，路径不变。
