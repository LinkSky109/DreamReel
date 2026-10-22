# PostgreSQL 韧性演练清单（待执行）

- 状态：**未执行**，2026-10-21 记录
- 目的：关闭“多实例并发写”和“备份/PITR”两项上线前风险
- 原则：只在独立演练库执行，不触碰开发库与生产库；记录真实命令与结果，不预填通过结论

## 前置条件

- PostgreSQL 16，迁移 `001`–`009` 已应用
- 独立演练库：`dreamreel_drill`（从空库开始）
- 演练机可启动 2–3 个 API 实例
- 有权限执行 `pg_dump` / `pg_basebackup` / 修改 `postgresql.conf`

```bash
# 独立演练库
createdb -h localhost -U dreamreel dreamreel_drill

DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel_drill \
  npm run db:migrate
```

## 演练一：多实例并发写

### 目标

验证多实例同时写同一组织的数据时：

- 不出现整表覆盖或丢更新
- 唯一约束/版本冲突按预期返回 `409`
- outbox 事件幂等，不重复应用、不产生 dead
- 读接口在并发写期间保持一致

### 步骤

1. 用独立库启动 2–3 个 API 实例：

```bash
for port in 3211 3212 3213; do
  PORT=$port \
  STORAGE_PATH=/tmp/dreamreel-drill-$port \
  DATABASE_URL=postgres://dreamreel:dreamreel@localhost:5432/dreamreel_drill \
  NOVEL_WRITE_MODE=dual \
  OUTBOX_ENABLED=true \
  node src/server.js > /tmp/drill-$port.log 2>&1 &
done
```

2. 并发创建不同小说（每个实例 50 条），再并发更新同一批小说。
3. 并发更新同一条小说，验证 `expectedVersion` 冲突路径返回 `409`。
4. 检查：

```bash
psql "$DATABASE_URL" -c "select org_id, count(*) from novels group by org_id"
psql "$DATABASE_URL" -c "select status, count(*) from outbox_events group by status"
npm run db:verify:novels
npm run db:verify:novel-children
npm run outbox:stats:group
```

5. 记录：错误率、p95 延迟、锁等待、连接池占用、outbox dead 数。

### 验收标准

- 创建行数与请求数一致，无重复主键、无丢失
- 冲突更新返回 `409`，非冲突更新 version 单调递增
- `outbox_events` 无 dead；`done` 数与写入次数匹配
- JSON 与 PostgreSQL 校验 `mismatches=0`
- 任一实例挂掉后，其余实例读仍正常

### 回滚

停掉演练实例，删除演练库；不改开发/生产数据。

## 演练二：备份与 PITR

### 目标

- 明确当前 RPO / RTO 目标（建议先按 RPO ≤ 5 分钟、RTO ≤ 30 分钟评估）
- 证明可以从全量备份 + WAL 恢复到指定时间点
- 恢复后的应用能通过 `/health/ready` 并读到恢复点之前的数据

### 步骤

1. 在演练库开启 WAL 归档（或使用 pgBackRest/云厂商 PITR）：

```conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'
```

2. 做一次全量备份：

```bash
pg_dump -h localhost -U dreamreel -Fc dreamreel_drill > /backup/drill.dump
# 或
pg_basebackup -h localhost -U dreamreel -D /backup/base -Ft -z -P
```

3. 写入带时间戳的标记数据（例如一部小说和一条 outbox 事件）。
4. 记录删除前时间点，执行误删（`delete from novels where id = ...`）。
5. 在独立实例上做 PITR：

```conf
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = 'YYYY-MM-DD HH:MM:SS+08'
recovery_target_action = 'promote'
```

6. 恢复后校验：

```bash
psql "$RESTORE_URL" -c "select count(*) from novels"
psql "$RESTORE_URL" -c "select version from schema_migrations order by version"
npm run db:verify:novels
PORT=3299 DATABASE_URL="$RESTORE_URL" NOVEL_WRITE_MODE=postgres \
  OUTBOX_ENABLED=false node src/server.js
curl -s http://localhost:3299/health/ready
```

### 验收标准

- 标记数据存在，误删之后的数据不存在（恢复点准确）
- `schema_migrations` 与主库一致
- 应用 `readiness=200`，小说列表/详情可读
- 实测 RTO 与数据丢失窗口记录在案

## 当前缺口（执行前已知）

- 尚未配置 WAL 归档、自动全量备份与备份失败告警
- 尚未验证备份文件加密、异地保存与恢复权限
- 当前写路径是 `NOVEL_WRITE_MODE=dual`（JSON 为事实源）；写主库切换后必须重跑演练一
- 未配置 outbox dead、连接池耗尽、复制延迟的监控告警

## 执行记录模板

```text
日期：
执行人：
环境 / 数据库：
演练类型：并发写 / 备份恢复
命令：
结果（通过 / 失败 / 阻塞）：
关键数字（RPO / RTO / 错误率 / p95 / dead）：
异常与修复：
结论：
```
