#!/usr/bin/env bash
# agent-workflow 安装脚本。
# 多选 agent（Claude Code / Codex）与代码托管平台（GitLab / GitHub / Gitee），
# 其余组件默认安装；安装系统依赖前会先询问。
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

ALL_AGENTS="claude codex"
ALL_HOSTS="gitlab github gitee"
AGENTS="$ALL_AGENTS"
HOSTS="$ALL_HOSTS"
AGENTS_GIVEN=0
HOSTS_GIVEN=0
INSTALL_NODE=1
INSTALL_SKILLS=1
INSTALL_FLOWS=1
INSTALL_PLUGINS=1
DRY_RUN=0
FORCE=0
LINK=0
ASSUME_YES=0
NO_INPUT=0

usage() {
  cat <<'EOF'
用法: ./install.sh [选项]

默认安装全部组件，并在终端里多选 agent 与代码托管平台。

选择:
  --agents LIST     agent 多选：claude, codex
  --hosts LIST      代码托管平台多选：gitlab, github, gitee
  --no-claude       不安装 Claude Code
  --no-codex        不安装 Codex
  --no-gitlab       不安装/检查 GitLab CLI (glab)
  --no-github       不安装/检查 GitHub CLI (gh)
  --no-gitee        不显示 Gitee token 指引
  --no-node         跳过 Node.js 检查/安装
  --no-skills       跳过 skills 复制
  --no-flows        跳过流程复制
  --no-plugins      跳过 Claude Code 插件配置

交互:
  --yes, -y         自动确认所有安装提示（适合重复执行 / CI）
  --no-input        非交互：不安装缺失的系统依赖，只做文件复制

其它:
  --dry-run         只打印将执行的操作，不修改任何文件
  --force           覆盖已存在的 skills/flows，并重装 CLI
  --link            用符号链接代替复制（仓库改动立即生效）
  -h, --help        显示帮助

环境变量:
  CLAUDE_CONFIG_DIR   Claude 配置目录，默认 ~/.claude
  CODEX_HOME          Codex 配置目录，默认 ~/.codex
EOF
}

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

has_agent() { case " $AGENTS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
has_host() { case " $HOSTS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

confirm_install() {
  local what="$1" answer
  if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] $what"; return 0; fi
  if [ "$ASSUME_YES" = 1 ]; then echo "$what [--yes 自动确认]"; return 0; fi
  if [ "$NO_INPUT" = 1 ] || [ ! -t 0 ]; then echo "$what [非交互，跳过]" >&2; return 1; fi
  read -r -p "$what [Y/n] " answer
  case "$answer" in n|N|no|NO) return 1 ;; *) return 0 ;; esac
}

choose_agents() {
  local answer selected="" n state
  echo "选择 agent（空格分隔编号；直接回车=全部）："
  for n in 1 2; do
    case "$n" in
      1) if command -v claude >/dev/null 2>&1; then state="已安装"; else state="未安装"; fi
         printf '  1) %-8s %s\n' claude "$state" ;;
      2) if command -v codex >/dev/null 2>&1; then state="已安装 $(codex --version 2>/dev/null | head -1)"; else state="未安装"; fi
         printf '  2) %-8s %s\n' codex "$state" ;;
    esac
  done
  printf '> '
  read -r answer || true
  [ -n "${answer// /}" ] || return 0
  for n in $answer; do
    case "$n" in
      1) selected+=" claude" ;;
      2) selected+=" codex" ;;
      *) echo "忽略未知编号: $n" >&2 ;;
    esac
  done
  AGENTS="${selected# }"
}

choose_hosts() {
  local answer selected="" n state
  echo "选择代码托管平台（空格分隔编号；直接回车=全部）："
  printf '  1) %-7s %s\n' gitlab "$(if command -v glab >/dev/null 2>&1; then echo "glab 已安装"; else echo "glab 未安装"; fi)"
  printf '  2) %-7s %s\n' github "$(if command -v gh >/dev/null 2>&1; then echo "gh 已安装"; else echo "gh 未安装"; fi)"
  printf '  3) %-7s %s\n' gitee "无官方 CLI，仅提供 token 指南"
  printf '> '
  read -r answer || true
  [ -n "${answer// /}" ] || return 0
  for n in $answer; do
    case "$n" in
      1) selected+=" gitlab" ;;
      2) selected+=" github" ;;
      3) selected+=" gitee" ;;
      *) echo "忽略未知编号: $n" >&2 ;;
    esac
  done
  HOSTS="${selected# }"
}

# ---- 解析参数 ----

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --link) LINK=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --no-input) NO_INPUT=1 ;;
    --agents) shift; AGENTS="${1:-}"; AGENTS_GIVEN=1 ;;
    --agents=*) AGENTS="${1#*=}"; AGENTS_GIVEN=1 ;;
    --hosts) shift; HOSTS="${1:-}"; HOSTS_GIVEN=1 ;;
    --hosts=*) HOSTS="${1#*=}"; HOSTS_GIVEN=1 ;;
    --no-claude) AGENTS="$(remove_word claude "${AGENTS:-$ALL_AGENTS}")"; AGENTS_GIVEN=1 ;;
    --no-codex) AGENTS="$(remove_word codex "${AGENTS:-$ALL_AGENTS}")"; AGENTS_GIVEN=1 ;;
    --no-gitlab) HOSTS="$(remove_word gitlab "${HOSTS:-$ALL_HOSTS}")"; HOSTS_GIVEN=1 ;;
    --no-github) HOSTS="$(remove_word github "${HOSTS:-$ALL_HOSTS}")"; HOSTS_GIVEN=1 ;;
    --no-gitee) HOSTS="$(remove_word gitee "${HOSTS:-$ALL_HOSTS}")"; HOSTS_GIVEN=1 ;;
    --no-node) INSTALL_NODE=0 ;;
    --no-skills) INSTALL_SKILLS=0 ;;
    --no-flows) INSTALL_FLOWS=0 ;;
    --no-plugins) INSTALL_PLUGINS=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

AGENTS="$(normalize_list "$AGENTS")"
HOSTS="$(normalize_list "$HOSTS")"

for a in $AGENTS; do
  case " $ALL_AGENTS " in *" $a "*) ;; *) echo "未知 agent: $a（可选：$ALL_AGENTS）" >&2; exit 2 ;; esac
done
for h in $HOSTS; do
  case " $ALL_HOSTS " in *" $h "*) ;; *) echo "未知托管平台: $h（可选：$ALL_HOSTS）" >&2; exit 2 ;; esac
done

if [ "$AGENTS_GIVEN" = 0 ] && [ "$NO_INPUT" = 0 ] && [ "$ASSUME_YES" = 0 ] && [ -t 0 ] && [ "$DRY_RUN" = 0 ]; then
  choose_agents
fi
if [ "$HOSTS_GIVEN" = 0 ] && [ "$NO_INPUT" = 0 ] && [ "$ASSUME_YES" = 0 ] && [ -t 0 ] && [ "$DRY_RUN" = 0 ]; then
  choose_hosts
fi

say "安装计划"
echo "仓库:       $REPO_DIR"
echo "Claude 目录: $CLAUDE_DIR"
echo "Codex 目录:  $CODEX_HOME"
echo "agents:     ${AGENTS:-（无）}"
echo "托管平台:   ${HOSTS:-（无）}"
echo "组件:       node=$INSTALL_NODE skills=$INSTALL_SKILLS flows=$INSTALL_FLOWS plugins=$INSTALL_PLUGINS"

# ---- Node.js ----

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi

if [ "$INSTALL_NODE" = 1 ]; then
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

if has_agent claude; then
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

# ---- Codex ----

if has_agent codex; then
  say "Codex CLI"
  if command -v codex >/dev/null 2>&1 && [ "$FORCE" = 0 ]; then
    echo "已安装：$(codex --version 2>/dev/null | head -1)（--force 可重装）"
  elif ! command -v npm >/dev/null 2>&1; then
    echo "未找到 npm，跳过 Codex 安装（先安装 Node.js）" >&2
  else
    if confirm_install "是否执行 npm install -g @openai/codex？"; then
      run npm install -g @openai/codex
    fi
  fi

  if command -v codex >/dev/null 2>&1; then
    if codex login status >/dev/null 2>&1; then
      echo "codex 已登录"
    else
      echo "codex 未登录：使用前请运行 codex login"
    fi
  fi
fi

# ---- 代码托管平台 CLI ----

cli_install_hint() {
  local name="$1" pkg="$2" url="$3"
  if command -v brew >/dev/null 2>&1; then
    if confirm_install "是否执行 brew install $pkg？"; then run brew install "$pkg"; fi
  elif command -v apt-get >/dev/null 2>&1 \
    && LC_ALL=C apt-cache policy "$pkg" 2>/dev/null | grep -q 'Candidate: [0-9]'; then
    if confirm_install "是否执行 apt-get install $pkg？"; then
      run as_root apt-get update -qq
      run as_root apt-get install -y "$pkg"
    fi
  else
    echo "未找到 $name，且当前系统没有可用的安装源。请手动安装：$url" >&2
  fi
}

if [ -n "$HOSTS" ]; then
  say "代码托管平台"
fi

if has_host gitlab; then
  if command -v glab >/dev/null 2>&1; then
    echo "GitLab: $(glab --version 2>/dev/null | head -1)"
  else
    echo "GitLab: 未找到 glab"
    cli_install_hint glab glab "https://gitlab.com/gitlab-org/cli"
  fi
  if command -v glab >/dev/null 2>&1; then
    if glab auth status >/dev/null 2>&1; then
      echo "  glab 已登录"
    else
      echo "  glab 未登录：创建 MR 前运行 glab auth login（见 docs/glab-setup.md）"
    fi
  fi
fi

if has_host github; then
  if command -v gh >/dev/null 2>&1; then
    echo "GitHub: $(gh --version 2>/dev/null | head -1)"
  else
    echo "GitHub: 未找到 gh"
    cli_install_hint gh gh "https://cli.github.com/"
  fi
  if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
      echo "  gh 已登录"
    else
      echo "  gh 未登录：使用前运行 gh auth login（token 见 docs/glab-setup.md）"
    fi
  fi
fi

if has_host gitee; then
  echo "Gitee: 暂无通用官方 CLI；Pull Request 用网页或 API 创建，token 见 docs/glab-setup.md#23-gitee"
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

target_dirs() {
  local kind="$1" dirs=""
  if has_agent claude; then dirs+=" $CLAUDE_DIR/$kind"; fi
  if has_agent codex; then dirs+=" $CODEX_HOME/$kind"; fi
  if [ -z "$dirs" ]; then
    if [ -d "$CLAUDE_DIR" ]; then dirs+=" $CLAUDE_DIR/$kind"; fi
    if [ -d "$CODEX_HOME" ]; then dirs+=" $CODEX_HOME/$kind"; fi
  fi
  if [ -z "$dirs" ]; then dirs="$CLAUDE_DIR/$kind"; fi
  printf '%s' "$dirs"
}

if [ "$INSTALL_SKILLS" = 1 ]; then
  say "安装 skills"
  for dest in $(target_dirs skills); do
    sync_tree "$REPO_DIR/skills" "$dest" "skills"
  done
fi

if [ "$INSTALL_FLOWS" = 1 ]; then
  say "安装流程"
  for dest in $(target_dirs flows); do
    sync_tree "$REPO_DIR/flows" "$dest" "flows"
  done
fi

# ---- 插件（仅 Claude Code） ----

if [ "$INSTALL_PLUGINS" = 1 ]; then
  say "配置插件"
  if ! has_agent claude; then
    echo "未选择 Claude Code，跳过插件配置"
  elif ! command -v node >/dev/null 2>&1; then
    echo "未找到 node，跳过插件配置（先安装 Node.js）" >&2
  else
    run mkdir -p "$CLAUDE_DIR"
    if [ "$DRY_RUN" = 1 ]; then
      echo "+ 合并 extraKnownMarketplaces / enabledPlugins 到 $CLAUDE_DIR/settings.json"
    else
      node - "$CLAUDE_DIR/settings.json" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const marketplaces = {
  'anthropic-agent-skills': { source: { source: 'github', repo: 'anthropics/skills' } },
  'ppt-master': { source: { source: 'github', repo: 'hugohe3/ppt-master' } },
};
const plugins = {
  'document-skills@anthropic-agent-skills': true,
  'ppt-master@ppt-master': true,
};
settings.extraKnownMarketplaces = Object.assign({}, marketplaces, settings.extraKnownMarketplaces || {});
settings.enabledPlugins = Object.assign({}, plugins, settings.enabledPlugins || {});
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log('已合并插件配置（未改动其它字段）');
NODE
    fi
  fi
fi

cat <<EOF

完成。

agents:   ${AGENTS:-（无）}
托管平台: ${HOSTS:-（无）}

下一步：
  1. 首次安装插件后，在 Claude Code 里运行 /reload-skills 或重启会话。
  2. 登录检查：
       GitLab: glab auth status（未登录时 glab auth login）
       GitHub: gh auth status（未登录时 gh auth login）
  3. 打开流程编辑器：
       ./scripts/open-editor.sh
       ./scripts/open-editor.sh --project /path/to/your/repo
  4. 给某个项目接入流程：
       ./scripts/init-project.sh /path/to/your/repo doc-first
  5. 在该项目里让 agent 走对应流程（Claude Code 可直接说「走文档先行流程」）。

安装位置：
  claude  $CLAUDE_DIR/skills, $CLAUDE_DIR/flows
  codex   $CODEX_HOME/skills, $CODEX_HOME/flows
  settings $CLAUDE_DIR/settings.json（仅合并 Claude Code 插件字段）
EOF
