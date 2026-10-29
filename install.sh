#!/usr/bin/env bash
# agent-workflow 安装脚本。
# 安装 Node.js / Claude Code，复制通用 skills 与流程，并合并插件配置。
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

DRY_RUN=0
FORCE=0
LINK=0
INSTALL_CLAUDE=1
INSTALL_PLUGINS=1
INSTALL_GLAB=1

usage() {
  cat <<'EOF'
用法: ./install.sh [选项]

  --dry-run       只打印将执行的操作，不修改任何文件
  --force         覆盖已存在的 skills/flows，并重装 Claude Code
  --link          用符号链接代替复制（仓库改动立即生效）
  --no-claude     跳过 Claude Code 安装
  --no-plugins    跳过插件市场配置
  --no-glab       跳过 GitLab CLI (glab) 安装与登录检查
  -h, --help      显示帮助

环境变量:
  CLAUDE_CONFIG_DIR   Claude 配置目录，默认 ~/.claude
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --link) LINK=1 ;;
    --no-claude) INSTALL_CLAUDE=0 ;;
    --no-plugins) INSTALL_PLUGINS=0 ;;
    --no-glab) INSTALL_GLAB=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s ==\n' "$*"; }
run() { printf '+ %s\n' "$*"; [ "$DRY_RUN" = 1 ] || "$@"; }
as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else echo "需要 root 权限：$*" >&2; return 1
  fi
}

say "环境检查"
echo "仓库:      $REPO_DIR"
echo "Claude 目录: $CLAUDE_DIR"

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi

if [ "$node_major" -lt 18 ]; then
  echo "需要 Node.js ≥18（当前 ${node_major:-未安装}），尝试安装..."
  if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    run brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    run as_root apt-get update -qq
    run as_root apt-get install -y nodejs npm
  else
    echo "请先安装 Node.js ≥18 后重试" >&2
    exit 1
  fi
else
  echo "Node.js $(node --version) / npm $(npm --version 2>/dev/null || echo '?')"
fi

if [ "$INSTALL_CLAUDE" = 1 ]; then
  say "Claude Code"
  if command -v claude >/dev/null 2>&1 && [ "$FORCE" = 0 ]; then
    echo "已安装：$(command -v claude)（--force 可重装）"
  else
    run npm install -g @anthropic-ai/claude-code
  fi
fi

if [ "$INSTALL_GLAB" = 1 ]; then
  say "GitLab CLI (glab)"
  if command -v glab >/dev/null 2>&1; then
    echo "已安装：$(glab --version 2>/dev/null | head -1)"
  elif command -v brew >/dev/null 2>&1; then
    run brew install glab
  elif command -v apt-get >/dev/null 2>&1 \
    && LC_ALL=C apt-cache policy glab 2>/dev/null | grep -q 'Candidate: [0-9]'; then
    run as_root apt-get update -qq
    run as_root apt-get install -y glab
  else
    cat >&2 <<'GLAB'
未找到 glab，且当前系统没有可用的安装源。请手动安装：
  macOS:  brew install glab
  Debian/Ubuntu（官方源）:
    curl -fsSL https://packages.gitlab.com/install/repositories/gitlab/gitlab-cli/script.deb.sh | sudo bash
    sudo apt-get install glab
  其它: https://gitlab.com/gitlab-org/cli
GLAB
  fi

  if command -v glab >/dev/null 2>&1; then
    if glab auth status >/dev/null 2>&1; then
      echo "glab 已登录"
    else
      echo "glab 未登录：创建 MR 前请运行 glab auth login"
    fi
  fi
fi

sync_tree() {
  local src="$1" dest="$2" label="$3" item name target
  [ -d "$src" ] || return 0
  if [ "$LINK" = 1 ]; then
    run mkdir -p "$dest"
    for item in "$src"/*; do
      [ -e "$item" ] || continue
      name="$(basename "$item")"
      target="$dest/$name"
      if [ -e "$target" ] || [ -L "$target" ]; then
        if [ "$FORCE" = 0 ]; then
          echo "跳过已存在：$target（--force 覆盖）"
          continue
        fi
        run rm -rf "$target"
      fi
      run ln -s "$item" "$target"
    done
  else
    run mkdir -p "$dest"
    run cp -R "$src/." "$dest/"
  fi
  echo "$label -> $dest"
}

say "安装 skills"
sync_tree "$REPO_DIR/skills" "$CLAUDE_DIR/skills" "skills"

say "安装流程"
sync_tree "$REPO_DIR/flows" "$CLAUDE_DIR/flows" "flows"

if [ "$INSTALL_PLUGINS" = 1 ]; then
  say "配置插件"
  run mkdir -p "$CLAUDE_DIR"
  if [ "$DRY_RUN" = 1 ]; then
    echo "+ 合并 extraKnownMarketplaces / enabledPlugins 到 $CLAUDE_DIR/settings.json"
  else
    node - "$CLAUDE_DIR/settings.json" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let settings = {};
if (fs.existsSync(file)) {
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`settings.json 解析失败，未修改插件配置: ${err.message}`);
    process.exit(0);
  }
}
settings.extraKnownMarketplaces = Object.assign({
  'anthropic-agent-skills': { source: { source: 'github', repo: 'anthropics/skills' } },
  'ppt-master': { source: { source: 'github', repo: 'hugohe3/ppt-master' } },
}, settings.extraKnownMarketplaces || {});
settings.enabledPlugins = Object.assign({
  'document-skills@anthropic-agent-skills': true,
  'ppt-master@ppt-master': true,
}, settings.enabledPlugins || {});
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log('已合并插件配置（未改动其它字段）');
NODE
  fi
fi

cat <<EOF

完成。

下一步：
  1. 首次安装插件后，在 Claude Code 里运行 /reload-skills 或重启会话。
  2. 创建 MR 前确认 glab 已登录：glab auth status（未登录时运行 glab auth login）。
  3. 打开流程编辑器：
       ./scripts/open-editor.sh
       ./scripts/open-editor.sh --project /path/to/your/repo
  4. 给某个项目接入流程：
       ./scripts/init-project.sh /path/to/your/repo doc-first
  5. 在该项目里对 Claude 说「走文档先行流程」。

安装位置：
  skills  $CLAUDE_DIR/skills
  flows   $CLAUDE_DIR/flows
  settings $CLAUDE_DIR/settings.json（仅合并插件字段）
EOF
