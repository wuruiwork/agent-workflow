#!/usr/bin/env bash
# agent-workflow 安装脚本。
# 可选择安装组件；安装系统依赖前会先询问。
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

ALL_COMPONENTS="node claude glab skills flows plugins"
COMPONENTS="$ALL_COMPONENTS"
PLUGINS="document-skills ppt-master"
DISABLED=""
DRY_RUN=0
FORCE=0
LINK=0
ASSUME_YES=0
NO_INPUT=0
SELECT_GIVEN=0
PLUGINS_GIVEN=0

usage() {
  cat <<'EOF'
用法: ./install.sh [选项]

组件选择:
  --select LIST     只安装指定组件，逗号或空格分隔
                    node, claude, glab, skills, flows, plugins
  --plugins LIST    只启用指定插件：document-skills, ppt-master
  --no-node         跳过 Node.js 检查/安装
  --no-claude       跳过 Claude Code
  --no-glab         跳过 glab 安装与登录检查
  --no-plugins      跳过插件市场配置

交互:
  --yes, -y         自动确认所有安装提示（适合重复执行 / CI）
  --no-input        非交互：不安装缺失的系统依赖，只做文件复制
  （默认在终端里会先让你多选要安装的组件）

其它:
  --dry-run         只打印将执行的操作，不修改任何文件
  --force           覆盖已存在的 skills/flows，并重装 Claude Code
  --link            用符号链接代替复制（仓库改动立即生效）
  -h, --help        显示帮助

环境变量:
  CLAUDE_CONFIG_DIR   Claude 配置目录，默认 ~/.claude
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --link) LINK=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --no-input) NO_INPUT=1 ;;
    --select) shift; SELECT_GIVEN=1; COMPONENTS="${1:-}" ;;
    --select=*) SELECT_GIVEN=1; COMPONENTS="${1#*=}" ;;
    --plugins) shift; PLUGINS_GIVEN=1; PLUGINS="${1:-}" ;;
    --plugins=*) PLUGINS_GIVEN=1; PLUGINS="${1#*=}" ;;
    --no-node) DISABLED+=" node" ;;
    --no-claude) DISABLED+=" claude" ;;
    --no-glab) DISABLED+=" glab" ;;
    --no-plugins) DISABLED+=" plugins" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\n== %s ==\n' "$*"; }
run() { printf '+ %s\n' "$*"; [ "$DRY_RUN" = 1 ] || "$@"; }
as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else echo "需要 root 权限：$*" >&2; return 1
  fi
}

normalize_list() { printf '%s' "$1" | tr ',' ' ' | xargs 2>/dev/null || printf '%s' "$1" | tr ',' ' '; }

remove_word() {
  local word="$1" list="$2" out="" w
  for w in $list; do
    [ "$w" = "$word" ] || out+=" $w"
  done
  printf '%s' "${out# }"
}

has_component() { case " $COMPONENTS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

confirm_install() {
  local what="$1" answer
  if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] $what"; return 0; fi
  if [ "$ASSUME_YES" = 1 ]; then echo "$what [--yes 自动确认]"; return 0; fi
  if [ "$NO_INPUT" = 1 ] || [ ! -t 0 ]; then echo "$what [非交互，跳过]" >&2; return 1; fi
  read -r -p "$what [Y/n] " answer
  case "$answer" in n|N|no|NO) return 1 ;; *) return 0 ;; esac
}

choose_components() {
  local i=1 c state answer selected n
  echo "选择要安装的组件（空格分隔编号；直接回车=全部）："
  for c in $ALL_COMPONENTS; do
    state=""
    case "$c" in
      node) if command -v node >/dev/null 2>&1; then state="已安装 $(node --version)"; else state="未安装"; fi ;;
      claude) if command -v claude >/dev/null 2>&1; then state="已安装"; else state="未安装"; fi ;;
      glab) if command -v glab >/dev/null 2>&1; then state="已安装 $(glab --version 2>/dev/null | head -1)"; else state="未安装"; fi ;;
      skills) state="复制到 $CLAUDE_DIR/skills" ;;
      flows) state="复制到 $CLAUDE_DIR/flows" ;;
      plugins) state="$PLUGINS" ;;
    esac
    printf '  %d) %-8s %s\n' "$i" "$c" "$state"
    i=$((i + 1))
  done
  printf '> '
  read -r answer || true
  [ -n "${answer// /}" ] || return 0
  selected=""
  for n in $answer; do
    case "$n" in
      1) selected+=" node" ;;
      2) selected+=" claude" ;;
      3) selected+=" glab" ;;
      4) selected+=" skills" ;;
      5) selected+=" flows" ;;
      6) selected+=" plugins" ;;
      *) echo "忽略未知编号: $n" >&2 ;;
    esac
  done
  COMPONENTS="${selected# }"
}

choose_plugins() {
  local answer selected="" n
  echo "选择要启用的插件（空格分隔编号；直接回车=全部）："
  echo "  1) document-skills (docx / pdf / pptx / xlsx)"
  echo "  2) ppt-master"
  printf '> '
  read -r answer || true
  [ -n "${answer// /}" ] || return 0
  for n in $answer; do
    case "$n" in
      1) selected+=" document-skills" ;;
      2) selected+=" ppt-master" ;;
      *) echo "忽略未知编号: $n" >&2 ;;
    esac
  done
  PLUGINS="${selected# }"
}

# ---- 解析组件 ----

if [ "$SELECT_GIVEN" = 1 ]; then
  COMPONENTS="$(normalize_list "$COMPONENTS")"
fi
for d in $DISABLED; do
  COMPONENTS="$(remove_word "$d" "$COMPONENTS")"
done
PLUGINS="$(normalize_list "$PLUGINS")"

if [ -z "$COMPONENTS" ]; then
  echo "没有要安装的组件" >&2
  exit 2
fi
for c in $COMPONENTS; do
  case " $ALL_COMPONENTS " in
    *" $c "*) ;;
    *) echo "未知组件: $c（可选：$ALL_COMPONENTS）" >&2; exit 2 ;;
  esac
done

if [ "$SELECT_GIVEN" = 0 ] && [ "$NO_INPUT" = 0 ] && [ "$ASSUME_YES" = 0 ] && [ -t 0 ] && [ "$DRY_RUN" = 0 ]; then
  choose_components
fi
if has_component plugins && [ "$PLUGINS_GIVEN" = 0 ] && [ "$NO_INPUT" = 0 ] && [ "$ASSUME_YES" = 0 ] && [ -t 0 ] && [ "$DRY_RUN" = 0 ]; then
  choose_plugins
fi

say "安装计划"
echo "仓库:      $REPO_DIR"
echo "Claude 目录: $CLAUDE_DIR"
echo "组件:      $COMPONENTS"
if has_component plugins; then
  echo "插件:      $PLUGINS"
fi

# ---- Node.js ----

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi

if has_component node; then
  say "Node.js"
  if [ "$node_major" -lt 18 ]; then
    echo "需要 Node.js ≥18（当前 ${node_major:-未安装}）"
    if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
      if confirm_install "是否执行 brew install node？"; then run brew install node; fi
    elif command -v apt-get >/dev/null 2>&1; then
      if confirm_install "是否执行 apt-get install nodejs npm？"; then
        run as_root apt-get update -qq
        run as_root apt-get install -y nodejs npm
      fi
    else
      echo "请手动安装 Node.js ≥18 后重试" >&2
    fi
  else
    echo "Node.js $(node --version) / npm $(npm --version 2>/dev/null || echo '?')"
  fi
fi

# ---- Claude Code ----

if has_component claude; then
  say "Claude Code"
  if command -v claude >/dev/null 2>&1 && [ "$FORCE" = 0 ]; then
    echo "已安装：$(command -v claude)（--force 可重装）"
  elif ! command -v npm >/dev/null 2>&1; then
    echo "未找到 npm，跳过 Claude Code 安装（先安装 Node.js）" >&2
  else
    if confirm_install "是否执行 npm install -g @anthropic-ai/claude-code？"; then
      run npm install -g @anthropic-ai/claude-code
    fi
  fi
fi

# ---- glab ----

if has_component glab; then
  say "GitLab CLI (glab)"
  if command -v glab >/dev/null 2>&1; then
    echo "已安装：$(glab --version 2>/dev/null | head -1)"
  elif command -v brew >/dev/null 2>&1; then
    if confirm_install "是否执行 brew install glab？"; then run brew install glab; fi
  elif command -v apt-get >/dev/null 2>&1 \
    && LC_ALL=C apt-cache policy glab 2>/dev/null | grep -q 'Candidate: [0-9]'; then
    if confirm_install "是否执行 apt-get install glab？"; then
      run as_root apt-get update -qq
      run as_root apt-get install -y glab
    fi
  else
    cat >&2 <<'GLAB'
未找到 glab，且当前系统没有可用的安装源。请手动安装：
  macOS:  brew install glab
  Debian/Ubuntu（官方源）:
    curl -fsSL https://packages.gitlab.com/install/repositories/gitlab/gitlab-cli/script.deb.sh | sudo bash
    sudo apt-get install glab
  其它: https://gitlab.com/gitlab-org/cli
详细步骤: https://github.com/wuruiwork/agent-workflow/blob/main/docs/glab-setup.md
GLAB
  fi

  if command -v glab >/dev/null 2>&1; then
    if glab auth status >/dev/null 2>&1; then
      echo "glab 已登录"
    else
      echo "glab 未登录：创建 MR 前请运行 glab auth login（步骤见 docs/glab-setup.md）"
    fi
  fi
fi

# ---- skills / flows ----

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

if has_component skills; then
  say "安装 skills"
  sync_tree "$REPO_DIR/skills" "$CLAUDE_DIR/skills" "skills"
fi

if has_component flows; then
  say "安装流程"
  sync_tree "$REPO_DIR/flows" "$CLAUDE_DIR/flows" "flows"
fi

# ---- 插件 ----

if has_component plugins; then
  say "配置插件"
  if ! command -v node >/dev/null 2>&1; then
    echo "未找到 node，跳过插件配置（先安装 Node.js）" >&2
  elif [ -z "$PLUGINS" ]; then
    echo "没有选择插件，跳过"
  else
    run mkdir -p "$CLAUDE_DIR"
    if [ "$DRY_RUN" = 1 ]; then
      echo "+ 合并 extraKnownMarketplaces / enabledPlugins 到 $CLAUDE_DIR/settings.json"
    else
      node - "$CLAUDE_DIR/settings.json" "$PLUGINS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const selected = new Set(process.argv[3].split(/\s+/).filter(Boolean));
const MARKETPLACES = {
  'anthropic-agent-skills': { source: { source: 'github', repo: 'anthropics/skills' } },
  'ppt-master': { source: { source: 'github', repo: 'hugohe3/ppt-master' } },
};
const PLUGIN_MAP = {
  'document-skills': 'document-skills@anthropic-agent-skills',
  'ppt-master': 'ppt-master@ppt-master',
};

let settings = {};
if (fs.existsSync(file)) {
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`settings.json 解析失败，未修改插件配置: ${err.message}`);
    process.exit(0);
  }
}

settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
settings.enabledPlugins = settings.enabledPlugins || {};
const picked = [...selected].filter((name) => PLUGIN_MAP[name]);
for (const name of picked) {
  const id = PLUGIN_MAP[name];
  const marketplace = id.split('@')[1];
  settings.extraKnownMarketplaces[marketplace] = MARKETPLACES[marketplace];
  settings.enabledPlugins[id] = true;
}
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(picked.length ? `已启用插件: ${picked.join(', ')}（未改动其它字段）` : '没有选择有效插件');
NODE
    fi
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
