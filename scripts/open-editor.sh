#!/usr/bin/env bash
# 启动流程编辑器并自动打开浏览器。
# 用法:
#   ./scripts/open-editor.sh
#   ./scripts/open-editor.sh --project /path/to/repo
#   ./scripts/open-editor.sh --project "/path/with spaces/repo"
#   ./scripts/open-editor.sh --port 5000
# 路径含空格时建议加引号；不加引号也会自动合并识别。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js ≥18，请先运行 ./install.sh 或手动安装" >&2
  exit 1
fi

exec node "$ROOT/editor/server.mjs" "$@"
