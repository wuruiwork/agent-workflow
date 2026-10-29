#!/usr/bin/env bash
# 给一个项目接入流程：生成 profile.yaml、.skillgate/done.yaml 和 .gitignore 条目。
# 用法:
#   ./scripts/init-project.sh /path/to/repo [flow]
#   ./scripts/init-project.sh . lite --force
#   ./scripts/init-project.sh /path/with spaces/repo doc-first   # 未加引号也能识别
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FORCE=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      echo "用法: $0 <项目目录> [流程名，默认 doc-first] [--force]"
      exit 0 ;;
    *) ARGS+=("$arg") ;;
  esac
done

PROJECT="${ARGS[0]:-$(pwd)}"
IDX=1
# 路径含空格且没加引号时，会被 shell 拆成多个参数；合并到目录存在为止。
while [ ! -d "$PROJECT" ] && [ "$IDX" -lt "${#ARGS[@]}" ]; do
  PROJECT="$PROJECT ${ARGS[$IDX]}"
  IDX=$((IDX + 1))
done
FLOW="${ARGS[$IDX]:-doc-first}"

if [ ! -d "$PROJECT" ]; then
  echo "目录不存在: $PROJECT" >&2
  exit 1
fi
PROJECT="$(cd "$PROJECT" && pwd)"

if ! git -C "$PROJECT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "警告: $PROJECT 不是 git 仓库，流程门禁无法生效" >&2
fi

PROFILE="$PROJECT/.claude/flows/profile.yaml"
if [ -f "$PROFILE" ] && [ "$FORCE" = 0 ]; then
  echo "已存在 profile，未覆盖: $PROFILE（--force 覆盖）"
else
  mkdir -p "$(dirname "$PROFILE")"
  cp "$ROOT/examples/profile.yaml" "$PROFILE"
  echo "已写入: $PROFILE"
fi

POLICY="$PROJECT/.skillgate/done.yaml"
if [ -f "$POLICY" ] && [ "$FORCE" = 0 ]; then
  echo "已存在策略，未覆盖: $POLICY（流程 gate 请手动合并）"
else
  mkdir -p "$(dirname "$POLICY")"
  TEMPLATE="$ROOT/flows/$FLOW/project-template/.skillgate/done.yaml"
  if [ -f "$TEMPLATE" ]; then
    cp "$TEMPLATE" "$POLICY"
  elif [ -f "$ROOT/flows/$FLOW/policy.yaml" ]; then
    cp "$ROOT/flows/$FLOW/policy.yaml" "$POLICY"
  else
    echo "未知流程: $FLOW" >&2
    exit 1
  fi
  echo "已写入: $POLICY（记得把 tests-pass 换成项目测试命令）"
fi

GITIGNORE="$PROJECT/.gitignore"
touch "$GITIGNORE"
for line in ".skillgate/phase" ".skillgate/evidence/" ".claude/flows/profile.local.yaml"; do
  if ! grep -qxF "$line" "$GITIGNORE"; then
    printf '%s\n' "$line" >> "$GITIGNORE"
    echo "已加入 .gitignore: $line"
  fi
done

cat <<EOF

完成。下一步：
  1. 编辑 $PROFILE，确认远端名、分支规则和 MR 目标。
  2. 把 $POLICY 的 tests-pass 改成项目真实测试命令。
  3. 需要可视化调整时：
       $ROOT/scripts/open-editor.sh --project "$PROJECT"
  4. 在项目里对 Claude 说「走文档先行流程」或「/flow-runner $FLOW」。
EOF
