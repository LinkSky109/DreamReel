#!/usr/bin/env bash
# 开工自检：分支/worktree/依赖/工作区是否干净。
# 只把“已跟踪文件被修改”和“非依赖目录的未跟踪文件”视为脏工作区；
# node_modules 在本仓库常以 symlink 形式存在，不计入脏检查。
set -euo pipefail
cd "$(dirname "$0")/../.."

BRANCH="$(git branch --show-current)"
echo "branch: ${BRANCH:-（detached HEAD）}"
echo "HEAD:   $(git rev-parse --short HEAD)"
echo "worktree: $(pwd)"

test -f .env || { echo "缺少 .env（或 symlink）" >&2; exit 1; }
test -d node_modules || { echo "缺少 node_modules（或 symlink）" >&2; exit 1; }

if [ "$BRANCH" = "main" ]; then
  echo "[kickoff] 警告：当前在 main 上；开发请使用 feat/* 分支或独立 worktree。" >&2
fi

dirty="$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
echo "dirty tracked files: $dirty"
if [ "$dirty" != "0" ]; then
  echo "工作区不干净，先交接/清理：" >&2
  git status --short --untracked-files=no | head -20 >&2
  exit 2
fi

untracked="$({ git ls-files --others --exclude-standard | grep -vE '^(node_modules|storage)(/|$)' || true; } | wc -l | tr -d ' ')"
echo "untracked non-dependency files: $untracked"
if [ "$untracked" != "0" ]; then
  echo "存在未跟踪文件，先确认归属/清理：" >&2
  { git ls-files --others --exclude-standard | grep -vE '^(node_modules|storage)(/|$)' || true; } | head -20 >&2
  exit 2
fi

echo "OK"
