#!/bin/sh
# 容器入口：等待 PostgreSQL 可用并执行迁移，然后启动 API。
# 迁移失败会重试（数据库尚未就绪），超过重试次数则以非 0 退出。
set -eu

if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  attempts="${DB_MIGRATE_RETRIES:-30}"
  delay="${DB_MIGRATE_DELAY:-2}"
  i=1
  while :; do
    if node scripts/db-migrate.js; then
      break
    fi
    if [ "$i" -ge "$attempts" ]; then
      echo "[entrypoint] 数据库迁移在 $attempts 次尝试后仍失败，退出" >&2
      exit 1
    fi
    echo "[entrypoint] 数据库尚未就绪（第 $i/$attempts 次），${delay}s 后重试" >&2
    i=$((i + 1))
    sleep "$delay"
  done
fi

exec node src/server.js
