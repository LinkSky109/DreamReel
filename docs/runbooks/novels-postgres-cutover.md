# Runbook：小说域 PostgreSQL 单源运行与验收

> 2026-10-22：小说域读写固定 PostgreSQL，`db.json` 不再承载小说集合。
> 本文用于单源上线后的验收、故障定位与回滚；不再包含运行时读/写模式切换步骤。
> 灾难恢复见 `docs/runbooks/novel-pg-restore.md`；韧性演练见 `docs/runbooks/postgres-resilience-drills.md`。

- 状态：单源运行（原读切 PG 已完成）
- 影响范围：小说列表、详情、章节、角色、世界观、季/集、设定图、形象状态、剧本/资产/合成/交接
- 写入：PostgreSQL 唯一事实源；无 JSON 双写
- 旧数据：`storage/archive/novels-from-db-*.json`（只读归档）

## 1. 当前配置

`.env`（gitignored）：

```bash
DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel
DB_DRIVER=postgres
```

启动：

```bash
docker compose -f deploy/docker-compose.dev.yml --profile infra up -d postgres
npm run db:migrate
npm run db:status
npm run dev
```

## 2. 验收清单

```bash
curl -s http://localhost:3001/health/ready
curl -s http://localhost:3001/api/novels
curl -s "http://localhost:3001/api/novels/<id>/chunks?meta=1"
curl -s http://localhost:3001/api/novels/<id>/characters
curl -s http://localhost:3001/api/novels/<id>/world/entities
curl -s http://localhost:3001/api/novels/<id>/seasons
curl -s http://localhost:3001/api/novels/<id>/episodes
curl -s http://localhost:3001/api/novels/<id>/assets
curl -s http://localhost:3001/api/novels/<id>/characters/<cid>/states
```

数据与日志：

```bash
npm run db:verify:novels
npm run db:verify:novel-children
npm run series:verify -- <novelId> --strict
npm run check:legacy

# 日志中不应出现小说 JSON 回退或写镜像告警
grep -E "novel-child-write|novel-write|回退" /tmp/dreamreel-dev.log || true
```

## 3. 期望结果

- 9 个读接口返回 200，字段形状与前端契约一致。
- 写入 → 立即读：新建小说可见、详情 200、删除后列表消失。
- `db:verify:*` mismatches=0。
- `series:verify` 达到基线：33 季 / 8496 集 / 时长达标 99.69% / 覆盖 99.98%。
- `check:legacy` 为 0 违规（已接入 `npm run check`）。
- 日志中无 JSON 回退、无写镜像失败告警。

## 4. 故障定位

| 现象 | 检查 |
|---|---|
| 列表为空 / 详情 404 | `npm run db:status`；检查 `organizations` 与 `novels` 行数 |
| `episode not found` | `npm run series:verify -- <id> --strict`；检查 `episodes.logical_key` 与资产引用 |
| `/health/ready` 失败 | 检查 `DATABASE_URL`、连接池、迁移版本 |
| 重建后计数不对 | 检查重建是否在事务内完成；查看 `novels.counts` 与季/集行数 |
| 旧归档被误读 | `npm run check:legacy`；确认请求/启动路径未引用归档工具 |

## 5. 回滚

小说域没有 JSON 双写或模式切换回滚路径。回滚方式：

1. **应用版本回滚**：部署上一版本；数据库保持兼容（迁移只增不改）。
2. **数据回滚**：`pg_dump` / PITR 恢复到目标时间点；恢复后跑 `series:verify` 与 API smoke。
3. **禁止**：把归档 JSON 重新加载到请求路径；把 `db.json` 小说集合写回运行时。

## 6. 已知边界

- 测试使用独立 `_test` 库，结束后删除；不得写开发库。
- `npm run outbox:stats` 仅用于非小说域；小说域不产生 outbox 事件。
- 媒体仍在本地/网盘/NAS；PG 只存元数据。
