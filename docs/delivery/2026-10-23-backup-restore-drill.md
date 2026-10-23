# 备份恢复演练（2026-10-23）

> 范围：R3-T3.8 韧性验收中的「备份可恢复」部分。
> 环境：本机 Docker `deploy-postgres-1`（PostgreSQL，端口 5432），库 `dreamreel`。

## 1. 演练步骤

```bash
# 1) 逻辑备份（custom format）
docker exec deploy-postgres-1 pg_dump -U dreamreel -d dreamreel -Fc -f /tmp/dreamreel-drill.dump

# 2) 独立演练库
docker exec deploy-postgres-1 psql -U dreamreel -d postgres \
  -c 'DROP DATABASE IF EXISTS dreamreel_restore_drill;' \
  -c 'CREATE DATABASE dreamreel_restore_drill;'

# 3) 恢复
docker exec deploy-postgres-1 pg_restore -U dreamreel -d dreamreel_restore_drill \
  --no-owner /tmp/dreamreel-drill.dump

# 4) 关键表行数比对（源库 vs 恢复库）
```

## 2. 结果（2026-10-23）

| 表 | 源库 | 恢复库 |
|---|---:|---:|
| schema_migrations | 15 | 15 |
| novels | 1 | 1 |
| episodes | 8496 | 8496 |
| seasons | 33 | 33 |
| novel_chunks | 1206 | 1206 |
| video_jobs | 0 | 0 |

恢复库与源库行数一致，`pg_restore` 无报错。

## 3. 结论与边界

- 逻辑备份/恢复链路可用，可作为发布前快照与误删恢复的兜底。
- 本次**不是** WAL PITR 演练：PITR 需要持续 WAL 归档与独立恢复实例；当前环境未开启归档，无法验证「任意时间点恢复」。
- 生产发布仍按 `docs/runbooks/novel-pg-restore.md` 执行：先恢复到独立库校验，再决定切换或 PITR。
- 演练库已在验证后删除，未触碰业务库数据。
