# Runbook：novels 读切 PostgreSQL（开发环境）

- 状态：已执行（2026-10-20）
- 影响范围：小说剧场的列表、详情、章节、角色、世界观、季/集、设定图、形象状态读取
- 写入：JSON 仍为事实源，全部镜像到 PostgreSQL

## 当前配置

`.env`（gitignored）：

```bash
DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel
NOVEL_REPO_MODE=postgres
NOVEL_WRITE_MODE=dual
```

启动：

```bash
docker compose -f deploy/docker-compose.dev.yml --profile infra up -d postgres
npm run db:migrate
npm run dev
```

## 验证清单

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

同时检查日志：

```bash
grep "回退 legacy" /tmp/dreamreel-dev.log
grep "novel-child-write" /tmp/dreamreel-dev.log
```

## 已观测结果

- 9 个读接口与 legacy 响应**完全一致**（deepEqual）。
- 读延迟（单机、连接冷启动）：list 7ms → 81ms，chunks 5ms → 76ms，其余 2–5ms → 5–25ms。
- 写入 → 立即读（postgres 读 + dual 写）：新建小说可见、详情 200、删除后消失。
- 回退告警 0，镜像失败告警 0。

## 回滚

只改环境变量，不触碰数据：

```bash
# .env
NOVEL_REPO_MODE=legacy
NOVEL_WRITE_MODE=legacy
```

重启服务即可。JSON 一直是最新事实源，回滚不丢数据。

## 已知边界

- `GET /:id/timeline` 与角色/世界观集合列表仍读 JSON。
- 写镜像是进程内写后队列，进程崩溃会丢最后一批；多实例需要 outbox。
- 读延迟高于纯内存 JSON，连接池预热后应下降；若持续偏高，检查索引与聚合查询。
- PostgreSQL 不可用时读会自动回退 legacy（会记录告警），写入镜像失败也会告警，但 JSON 写入不受影响。

## 上线前还需要

1. outbox/队列替代 fire-and-forget；
2. timeline 与集合列表切换；
3. 压测与慢查询检查；
4. 备份/PITR 演练；
5. 关闭 JSON 写入（写主库切换）。
