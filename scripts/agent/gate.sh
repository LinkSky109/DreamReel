#!/usr/bin/env bash
# DreamReel 统一门禁：重型检查串行化（后端测试共享 dreamreel_test 库与 storage/test-run）。
#
# 用法：
#   scripts/agent/gate.sh quick      # lint + typecheck（commit 前）
#   scripts/agent/gate.sh docs       # 端点/文档一致性
#   scripts/agent/gate.sh backend    # lint + 后端测试（共享锁）
#   scripts/agent/gate.sh frontend   # typecheck + 前端测试
#   scripts/agent/gate.sh full       # lint/typecheck/docs/后端测试/前端测试（串行）
#   scripts/agent/gate.sh e2e        # Playwright（共享锁）
#   scripts/agent/gate.sh build      # 双构建目标 + 产物一致性检查
#   scripts/agent/gate.sh smoke      # 发布冒烟（需 PostgreSQL）
set -euo pipefail
cd "$(dirname "$0")/../.."

LEVEL="${1:-quick}"
LOCK_DIR="${TMPDIR:-/tmp}/dreamreel-gate.lock"
LOCK_HELD=0

release_lock() {
  if [ "$LOCK_HELD" = "1" ]; then
    rm -rf "$LOCK_DIR"
    LOCK_HELD=0
  fi
}
trap release_lock EXIT INT TERM

acquire_lock() {
  local waited=0
  local holder=""
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    holder=""
    if [ -f "$LOCK_DIR/pid" ]; then
      holder="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    fi
    # 上次进程异常退出时清理失效锁，避免全局锁永久卡住所有 worktree。
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      echo "[gate] 清理失效锁（pid=$holder 已退出）"
      rm -rf "$LOCK_DIR"
      continue
    fi
    if [ "$waited" -ge 180 ]; then
      echo "[gate] 获取锁超时（15 分钟，$LOCK_DIR，holder=${holder:-unknown}）" >&2
      exit 75
    fi
    echo "[gate] 等待其它门禁/测试进程释放锁（$LOCK_DIR）..."
    sleep 5
    waited=$((waited + 1))
  done
  echo "$$" > "$LOCK_DIR/pid"
  LOCK_HELD=1
}

case "$LEVEL" in
  quick)
    npm run lint
    npm run typecheck
    ;;
  docs)
    npm run check:docs
    ;;
  backend)
    npm run lint
    acquire_lock
    npm test
    ;;
  frontend)
    npm run typecheck
    npm run test:web
    ;;
  full)
    npm run lint
    npm run typecheck
    npm run check:docs
    acquire_lock
    npm test
    npm run test:web
    ;;
  e2e)
    acquire_lock
    npm run test:e2e
    ;;
  build)
    npm run build
    npm run build:web
    npm run check:web-build
    ;;
  smoke)
    bash scripts/agent/smoke.sh
    ;;
  *)
    echo "usage: gate.sh quick|docs|backend|frontend|full|e2e|build|smoke" >&2
    exit 2
    ;;
esac

echo "[gate] OK: $LEVEL"
