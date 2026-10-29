# agent-workflow

通用流程 + 项目级 git 动作 + 可视化流程编辑器，支持 Claude Code 与 Codex。

- **流程通用**：`doc-first`、`lite`、`hotfix`、`dev-docs`、`ppt` 只声明阶段和动作槽位，不写死任何项目的 git 规则。
- **git 动作项目化**：每个项目用 `.claude/flows/profile.yaml` 决定「哪个阶段做什么」——commit、push、MR 的时机和规范全部由项目定义。
- **可视化编辑**：内置本地 HTML 编辑器，拖动阶段、勾选 hook、配置 git 动作，直接写回 YAML。

## 快速开始

```bash
git clone https://github.com/wuruiwork/agent-workflow.git
cd agent-workflow

./install.sh                 # 终端里会先让你多选要安装的组件
./scripts/open-editor.sh     # 打开流程编辑器
```

`install.sh` 默认安装大部分组件，在终端里只让你多选两件事：
**agent**（Claude Code / Codex）和**代码托管平台**（GitLab / GitHub / Gitee）。
安装系统依赖前会先询问；非交互场景用 `--yes`，或用 `--agents` / `--hosts` 直接指定。

给某个项目接入流程：

```bash
./scripts/init-project.sh ~/projects/foo doc-first
```

然后在项目里对 Claude 说「走文档先行流程」，或使用 `/flow-runner doc-first`。

## 仓库结构

| 路径 | 说明 |
|---|---|
| `install.sh` | 安装 Node.js、Claude Code、skills、flows，并合并插件配置 |
| `skills/` | 通用 skills：`flow-runner`、`git-action`、`df-implement`、`df-verify`、`code-review`、`plan-code`、`docs-steward`、`repository-docs`；Claude Code 与 Codex 共用 |
| `flows/` | 通用流程：`doc-first`、`lite`、`hotfix`、`dev-docs`、`ppt`，含各流程的 `flow.yaml`、`policy.yaml`、阶段文档和项目模板；两个 agent 共用 |
| `editor/` | 可视化流程编辑器（本地 Node 服务 + 单页 HTML，无需构建、无外部依赖） |
| `examples/profile.yaml` | 项目级 git 动作档案示例 |
| `scripts/init-project.sh` | 把 profile、skillgate 策略和 `.gitignore` 条目写入目标项目 |
| `scripts/open-editor.sh` | 启动编辑器并自动打开浏览器 |
| `docs/glab-setup.md` | Gitee / GitLab / GitHub token、glab 安装与 `glab auth login` 完整说明 |

## Claude Code 与 Codex

- `install.sh` 会把同一份 skills 和 flows 复制到选中的 agent 目录：
  `~/.claude/skills`、`~/.codex/skills`、`~/.claude/flows`、`~/.codex/flows`。
- `flow-runner` 查找流程的顺序：项目 `.claude/flows/` → `$CLAUDE_CONFIG_DIR/flows/`（默认 `~/.claude/flows/`）→ `$CODEX_HOME/flows/`（默认 `~/.codex/flows/`）。
- Codex 的 skills 与 Claude 同格式（`SKILL.md` + `name`/`description`），复制过去即可用。
- 插件（`document-skills`、`ppt-master`）只配置 Claude Code；Codex 使用复制过去的 skills。
- 登录检查：Claude Code 自动检查 `claude` 可执行文件；Codex 使用 `codex login status`，未登录时提示 `codex login`。

## 流程与 git 动作怎么配合

流程只声明「哪里需要动作」：

```yaml
# flows/doc-first/flow.yaml
checkpoints: [stage_end, finish]
stages:
  - id: implement
    hooks: [stage_end]
  - id: archive
    hooks: [stage_end, finish]
```

项目决定「动作怎么做」：

```yaml
# <project>/.claude/flows/profile.yaml
bindings:
  implement: { stage_end: [commit, push] }
  archive:   { stage_end: [commit], finish: [push, mr] }
```

执行顺序：

```
阶段产物完成 → 检查 status → git-action commit → git-action push
            → skillgate phase <stage> → 下一阶段
archive 完成 → commit → skillgate check → push → 创建 MR
```

同一份 `flow.yaml` 在不同项目里可以有不同的提交、推送、MR 时机，不需要分叉流程定义。没有 `profile.yaml` 时所有槽位是 no-op，行为与旧版一致。

### 两级 MR 示例

`examples/profile.yaml` 演示了同一个项目里的两个 MR 目标：

```yaml
actions:
  mr:
    targets:
      - id: review            # 工作分支 -> origin/main，每次流程收尾都建
        head: current_branch
        base: origin/main
        when: always
      - id: sync-upstream     # origin/main -> upstream/main
        head: origin/main
        base: upstream/main
        when:
          any:
            - ahead_by: 30    # 领先 30 个提交
            - idle_days: 7    # 或主干安静 7 天
```

`git-action` 按 `targets` 顺序判定，每个目标独立幂等；没有可合并提交时始终 no-op。

## 可视化编辑器

```bash
./scripts/open-editor.sh                              # 只编辑本仓库的流程
./scripts/open-editor.sh --project ~/projects/foo     # 同时编辑该项目的 profile
./scripts/open-editor.sh --port 5000 --no-open        # 指定端口、不自动开浏览器
```

路径含空格时建议加引号（`--project "/path/with spaces/repo"`）；不加引号也会自动合并识别，并支持 `~`。

功能：

- 阶段增删、拖动排序；编辑 `type` / `ref` / 产物 / 状态 gate / 人工确认。
- 为每个阶段勾选 hook（`stage_end` / `finish`）。
- 「阶段动作」矩阵：按 阶段 × hook 勾选 `commit` / `push` / `mr`，直接写入 profile 的 `bindings`。
- 每个阶段的 commit 类型。
- 「项目配置」：远端、分支正则、commit 类型、禁止提交路径、MR 目标（`always` / 领先提交数 / 空闲天数）。
- 「YAML」：实时预览 `flow.yaml`、`profile.yaml`，可下载，也可根据阶段生成 `policy.yaml` 并保存。

保存规则：

- 「保存流程」写入本仓库 `flows/<name>/flow.yaml`。
- 「保存 profile」在连接项目后写入 `<project>/.claude/flows/profile.yaml`；未连接时写入 `examples/profile.yaml`。
- 保存会重写文件并丢掉原有注释；生成 `policy.yaml` 后请核对 `tests-pass` 等命令。

## 安装选项

```bash
./install.sh --agents claude,codex        # agent 多选
./install.sh --hosts gitlab,github        # 托管平台多选
./install.sh --yes                        # 全部，自动确认依赖安装
./install.sh --no-input                   # 非交互：跳过缺失依赖，只复制文件
./install.sh --dry-run                    # 只打印操作
./install.sh --force                      # 覆盖已有 skills/flows，重装 CLI
./install.sh --link                       # 用符号链接代替复制，仓库改动立即生效
./install.sh --no-node                    # 跳过 Node.js
./install.sh --no-claude                  # 不安装 Claude Code
./install.sh --no-codex                   # 不安装 Codex
./install.sh --no-gitlab                  # 不安装/检查 glab
./install.sh --no-github                  # 不安装/检查 gh
./install.sh --no-gitee                   # 不显示 Gitee 指引
./install.sh --no-skills                  # 跳过 skills 复制
./install.sh --no-flows                   # 跳过流程复制
./install.sh --no-plugins                 # 跳过 Claude Code 插件配置
CLAUDE_CONFIG_DIR=/custom/dir CODEX_HOME=/custom/codex ./install.sh
```

agent：`claude`、`codex`；托管平台：`gitlab`、`github`、`gitee`。
其余组件（Node.js、skills、flows、插件）默认安装。

## 要求

- Node.js ≥ 18（`install.sh` 会尝试通过 brew 或 apt 安装）
- Claude Code（`install.sh` 会通过 npm 安装）
- Codex CLI（可选，`install.sh` 会通过 `npm install -g @openai/codex` 安装）
- `git`
- [`glab`](https://gitlab.com/gitlab-org/cli)（GitLab；`install.sh` 会尝试通过 brew / apt 安装并检查 `glab auth status`）
- [`gh`](https://cli.github.com/)（GitHub；`install.sh` 会尝试通过 brew / apt 安装并检查 `gh auth status`）
- [`gitee`](https://gitee.com/oschina/gitee-cli)（Gitee 官方 CLI；`install.sh` 会通过 npm 安装并检查 `gitee auth status`）
- token 与登录步骤见 [docs/glab-setup.md](docs/glab-setup.md)；对应平台可用 `--no-gitlab` / `--no-github` / `--no-gitee` 跳过
- 门禁依赖 [`@reneza/skillgate`](https://github.com/renezander030/skillgate)，由 `flow-runner` / `npx` 自动调用

## 常见问题

**没有 profile 会怎样？**
所有 hook 都是 no-op，流程只做阶段推进，不提交、不推送、不建 MR。

**保存后注释没了？**
编辑器用 YAML 解析/序列化，注释不保留。需要逐行注释的场景请直接手改 YAML；编辑器仍可打开读取。

**插件没有出现？**
首次安装后在 Claude Code 里运行 `/reload-skills` 或重启会话。
