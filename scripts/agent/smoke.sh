#!/usr/bin/env bash
# 发布冒烟：不依赖 Docker，直接以 production 模式启动单进程服务并验证关键路径。
#   前置：可用的 PostgreSQL（DATABASE_URL，或仓库根 .env 中的配置）。
#   用法：scripts/agent/smoke.sh          # 默认端口 3901
#         SMOKE_PORT=3911 scripts/agent/smoke.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${SMOKE_PORT:-3901}"
STORAGE_PATH="$(mktemp -d "${TMPDIR:-/tmp}/dreamreel-smoke-XXXXXX")"
LOG_FILE="$STORAGE_PATH/server.log"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$STORAGE_PATH"
}
trap cleanup EXIT

fail() {
  echo "[smoke] FAIL: $*" >&2
  if [ -f "$LOG_FILE" ]; then
    echo "---- server log (tail) ----" >&2
    tail -40 "$LOG_FILE" >&2 || true
  fi
  exit 1
}

require_db_url() {
  if [ -n "${DATABASE_URL:-}" ]; then return 0; fi
  if [ -f .env ] && node -e "import('dotenv/config').then(()=>process.exit(process.env.DATABASE_URL?0:1))"; then
    return 0
  fi
  echo "[smoke] 需要 DATABASE_URL（当前环境或仓库根 .env）；小说域固定 PostgreSQL 单源。" >&2
  exit 2
}

require_db_url

mkdir -p "$STORAGE_PATH"/data "$STORAGE_PATH"/videos "$STORAGE_PATH"/exports \
  "$STORAGE_PATH"/audio "$STORAGE_PATH"/temp "$STORAGE_PATH"/thumbnails
printf '{"projects":{},"users":{},"usage":{}}' > "$STORAGE_PATH/data/db.json"

JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export NODE_ENV=production
export REQUIRE_AUTH=true
export RATE_LIMIT_ENABLED=false
export JWT_SECRET
export PORT
export STORAGE_PATH
export SERVE_STATIC=true

node src/server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

base="http://127.0.0.1:${PORT}"
for _ in $(seq 1 30); do
  if curl -sf "$base/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then fail "服务进程已退出"; fi
  sleep 1
done
curl -sf "$base/health" >/dev/null || fail "GET /health 未在 30s 内就绪"

readiness="$(curl -sf "$base/health/ready")" || fail "GET /health/ready 非 200"
printf '%s' "$readiness" | grep -q '"db":"postgres"' || fail "readiness 未报告 db=postgres：$readiness"

# 未登录访问受保护接口必须 401
code="$(curl -s -o /dev/null -w '%{http_code}' "$base/api/projects")"
[ "$code" = "401" ] || fail "未登录 GET /api/projects 期望 401，实际 $code"

code="$(curl -s -o /dev/null -w '%{http_code}' "$base/api/v1/meta")"
[ "$code" = "401" ] || fail "未登录 GET /api/v1/meta 期望 401（authGate 覆盖），实际 $code"

# 注册获取 token（仅落在临时 storage，不影响仓库数据）
email="smoke-$$-$(date +%s)@example.test"
register_body="$(curl -sf -X POST "$base/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"smoke$$\",\"email\":\"$email\",\"password\":\"smoke-pass-123\"}")" \
  || fail "POST /api/auth/register 失败"
token="$(printf '%s' "$register_body" | node -e "
let raw = ''
process.stdin.on('data', (d) => { raw += d })
process.stdin.on('end', () => {
  try { process.stdout.write(JSON.parse(raw).token || '') } catch { process.stdout.write('') }
})
")"
[ -n "$token" ] || fail "注册响应缺少 token"

code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" "$base/api/v1/meta")"
[ "$code" = "200" ] || fail "带 token GET /api/v1/meta 期望 200，实际 $code"

code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" "$base/api/projects")"
[ "$code" = "200" ] || fail "带 token GET /api/projects 期望 200，实际 $code"

code="$(curl -s -o /dev/null -w '%{http_code}' "$base/")"
[ "$code" = "200" ] || fail "GET / 期望 200（前端产物存在），实际 $code"

echo "[smoke] OK: health/ready(db=postgres)、401/200 鉴权、静态首页均通过 (port=${PORT})"
