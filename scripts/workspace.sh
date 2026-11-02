#!/usr/bin/env bash
# 管理编辑器工作区（缓存区）。
# 工作区默认位于 <仓库>/workspaces/<name>/，已加入 .gitignore。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACES_DIR="${AGENT_WORKFLOW_WORKSPACES:-$ROOT/workspaces}"

usage() {
  cat <<EOF
用法: $0 <命令> [名称]

  new <name>       创建工作区
  list             列出工作区
  path <name>      打印工作区路径
  remove <name>    删除工作区（交互确认，--force 跳过）

工作区根目录: $WORKSPACES_DIR
可用 AGENT_WORKFLOW_WORKSPACES 覆盖。
EOF
}

valid_name() {
  case "${1:-}" in
    ""|*[!a-z0-9-]*) return 1 ;;
    *) return 0 ;;
  esac
}

require_name() {
  if ! valid_name "${1:-}"; then
    echo "名称只能包含小写字母、数字和连字符" >&2
    exit 2
  fi
}

count_dirs() {
  [ -d "$1" ] || { echo 0; return; }
  find "$1" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '
}

CMD="${1:-help}"
NAME="${2:-}"

case "$CMD" in
  new)
    require_name "$NAME"
    dir="$WORKSPACES_DIR/$NAME"
    if [ -d "$dir" ]; then
      echo "工作区已存在: $dir" >&2
      exit 1
    fi
    mkdir -p "$dir/skills" "$dir/flows"
    printf '{\n  "name": "%s",\n  "created": "%s"\n}\n' \
      "$NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$dir/workspace.json"
    echo "已创建工作区: $NAME"
    echo "路径: $dir"
    echo
    echo "安装时叠加："
    echo "  ./install.sh --workspace $NAME --agents claude,codex --yes"
    ;;
  list)
    if [ ! -d "$WORKSPACES_DIR" ]; then
      echo "还没有工作区（$WORKSPACES_DIR）"
      exit 0
    fi
    found=0
    for d in "$WORKSPACES_DIR"/*/; do
      [ -d "$d" ] || continue
      name="$(basename "$d")"
      valid_name "$name" || continue
      found=1
      printf '%-24s %s skills / %s flows\n' "$name" "$(count_dirs "$d/skills")" "$(count_dirs "$d/flows")"
    done
    [ "$found" = 1 ] || echo "还没有工作区（$WORKSPACES_DIR）"
    ;;
  path)
    require_name "$NAME"
    echo "$WORKSPACES_DIR/$NAME"
    ;;
  remove)
    require_name "$NAME"
    dir="$WORKSPACES_DIR/$NAME"
    if [ ! -d "$dir" ]; then
      echo "工作区不存在: $dir" >&2
      exit 1
    fi
    if [ "${3:-}" != "--force" ]; then
      read -r -p "删除工作区 $NAME（$dir）？[y/N] " answer
      case "$answer" in
        y|Y|yes|YES) ;;
        *) echo "已取消"; exit 0 ;;
      esac
    fi
    rm -rf "$dir"
    echo "已删除工作区: $NAME"
    ;;
  help|-h|--help|*)
    usage
    ;;
esac
