#!/usr/bin/env bash
# 启动流程编辑器并自动打开浏览器。
# 用法:
#   ./scripts/open-editor.sh
#   ./scripts/open-editor.sh /path/to/repo
#   ./scripts/open-editor.sh /path/with spaces/repo --port 5000
#   ./scripts/open-editor.sh --project /path/to/repo
# 项目路径可以直接写在第一个参数，不需要 --project，也不需要加引号。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js ≥18，请先运行 ./install.sh 或手动安装" >&2
  exit 1
fi

# 第一个参数不是选项时，视为项目路径；含空格被拆开的后续参数一起合并。
if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
  project="$1"
  shift
  while [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; do
    project="$project $1"
    shift
  done
  set -- --project "$project" "$@"
fi

exec node "$ROOT/editor/server.mjs" "$@"
