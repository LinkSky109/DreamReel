# Runbook：小说 PostgreSQL 数据恢复（从 JSON）

## 症状

- 小说列表为空 / 详情 404；
- 前端能打开某集，但操作报 `episode not found`；
- PG 中 `novels / seasons / episodes / novel_sources` 行数为 0。

## 常见原因

1. **误删 `default` 组织**：`organizations` 被删除后，`novels / seasons / episodes / chunks / characters / ...` 会按外键级联清空。
2. 测试/清理脚本按组织删除，而不是按 `novel_id` 删除。
3. 重建/同步过程中断，PG 只写入了一半。

## 预防（重要）

- **不要删除 `default` 组织**。测试请使用独立 org，或只按 `novel_id` 清理。
- 重建前停止 Web 服务；脚本已有端口占用保护。
- 切换写模式前先跑 `npm run db:backfill:novel-write -- --novel <id> --dry-run` 与 `npm run series:verify -- <id>`。

## 一键恢复

前提：`storage/archive/novels-from-db-*.json`、`storage/novels/<id>/source/cleaned.txt` 仍在。

> Phase 3c-1 后小说集合已从 `db.json` 移出，自动归档到 `storage/archive/novels-from-db-*.json`。
> 恢复脚本默认自动选择最新归档，也可用 `--from` 指定。
> PG 是事实源；正式备份以 `pg_dump`/PITR 为准，归档 JSON 仅作应急重建。

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

## 手动步骤（脚本不可用时）

```bash
# 1) 检查归档是否完整
ls -lh storage/archive/novels-from-db-*.json
node -e "const fs=require('fs'); const f=fs.readdirSync('storage/archive').filter(x=>x.startsWith('novels-from-db-')).sort().pop(); const d=require('./storage/archive/'+f); for (const k of ['novelProjects','novelChunks','seriesSeasons','seriesEpisodes','novelCharacters','novelWorldEntities','novelAssetImages']) console.log(k,Object.keys(d.collections[k]||{}).length)"

# 2) 重建 default 组织
#    psql: INSERT INTO organizations (id,name,slug,plan) VALUES ('default','Default','default','free') ON CONFLICT DO NOTHING;

# 3) 恢复项目（applyNovelUpsert）+ 子集合（applyChildUpsert）
#    可直接执行：node scripts/restore-novel-from-json.js --novel <id>

# 4) 恢复正文/章节/季/集/规划
npm run db:backfill:novel-write -- --novel <id>
```

## 验证

```bash
npm run db:status
npm run series:verify -- <novelId>

curl -s http://localhost:3001/api/novels/<id>/episodes | jq '.data | length'
curl -s http://localhost:3001/api/novels/<id>/seasons | jq '.data | length'
curl -s http://localhost:3001/api/novels/<id>/consistency | jq '.data'
```

期望（《殖装》）：

- `novels=1`、`novel_sources=1`、`novel_chunks=1206`
- `seasons=33`、`episodes=8496`
- 集 ID 的 JSON/PG 集合完全一致
- `episodes.logical_key` 非空 8496
- 单集剧本/分镜/资产/合成/交接/大纲接口正常

## 媒体文件

恢复只重建 PG 元数据，不移动图片/视频/音频；媒体仍在本地/网盘/NAS，路径不变。
