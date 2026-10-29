# Git 托管平台接入：token、CLI 与登录

`git-action` 的 `mr` 动作通过 [`glab`](https://gitlab.com/gitlab-org/cli) 创建 Merge Request。
只用 `commit` / `push` 的项目不需要 glab；profile 里配置了 `mr.targets` 才需要。

`./install.sh` 会尝试自动安装 glab 并检查登录状态；本文是手动安装、登录和排错的完整说明。
token 准备部分覆盖 **Gitee / GitLab / GitHub** 三个平台；安装与登录部分以 glab（GitLab）为主。

## 1. 安装

### macOS

```bash
brew install glab
```

### Linux

有 brew 时（包括 Linuxbrew）：

```bash
brew install glab
```

Debian / Ubuntu 使用 GitLab 官方包源：

```bash
curl -fsSL https://packages.gitlab.com/install/repositories/gitlab/gitlab-cli/script.deb.sh | sudo bash
sudo apt-get install glab
```

也可以直接从 [GitLab Releases](https://gitlab.com/gitlab-org/cli/-/releases) 下载对应架构的二进制，解压后把 `glab` 放到 `PATH` 中的目录（例如 `~/.local/bin`）。

### Windows

```powershell
scoop install glab
# 或
choco install glab
```

或从 Releases 下载 `.exe` 并加入 `PATH`。

### 验证

```bash
glab --version
```

## 2. 准备访问令牌

按代码托管平台选择对应步骤。`glab` 只消费 GitLab token；GitHub / Gitee 的 token 供 `gh`、
Gitee API 或 CI 使用——当前 `git-action` 的 `mr` 动作只支持 GitLab。

| 平台 | 使用的工具 | token 名称 | 最低权限 |
|---|---|---|---|
| GitLab | `glab` | Personal Access Token | `api` |
| GitHub | `gh` 或 GitHub API | Personal access token（classic / fine-grained） | `repo`，或 Contents + Pull requests 读写 |
| Gitee | Gitee API / CI | 私人令牌（Personal Access Token） | `projects`、`pull_requests`、`issues` |

> token 等同于密码：不要提交到仓库、不要贴进 issue/聊天记录。优先用环境变量或
> 平台的 secret 注入。

### 2.1 GitLab

1. 右上角头像 → **Edit profile** → **Access Tokens**（部分版本叫 **Preferences → Access Tokens**）。
2. Name 填 `glab-cli`，Expiration 按团队策略设置。
3. Scopes 至少勾选 **`api`**；`read_api` 只能读，不能创建 MR。
4. 创建后复制 `glpat-...` 开头的 token。页面关闭后无法再次查看。

`glab` 默认把 token 存在 `~/.config/glab-cli/config.yml`；需要系统钥匙串时加 `--use-keyring`。

### 2.2 GitHub

1. 右上角头像 → **Settings** → **Developer settings** → **Personal access tokens**。
2. 两种 token 任选：
   - **Fine-grained**（推荐）：Repository access 选择目标仓库 →
     Permissions 至少给 **Contents: Read and write**、**Pull requests: Read and write**
     （Metadata 会自动只读）。
   - **Classic**：Scopes 至少勾 **`repo`**；访问组织仓库时再勾 **`read:org`**；
     需要修改 workflow 时勾 **`workflow`**。
3. 生成后复制 `github_pat_...` 或 `ghp_...` 开头的 token。
4. 安装 `gh`（GitHub CLI）：macOS `brew install gh`；Debian/Ubuntu
   `sudo apt install gh`；Windows `winget install GitHub.cli`。
5. 登录 `gh`：

   ```bash
   gh auth login --with-token < ~/.config/github-token.txt
   gh auth status
   ```

   也可以在 CI / 当前 shell 里使用 `GH_TOKEN` 或 `GITHUB_TOKEN` 环境变量，
   它们的优先级高于 `gh` 保存的凭据。

### 2.3 Gitee

1. 右上角头像 → **设置** → **安全设置** → **私人令牌** → **生成新令牌**。
2. 勾选权限：**`projects`**（仓库读写）、**`pull_requests`**（Pull Request）、
   **`issues`**（Issue，可选）、**`notes`**（评论，可选）。
3. 生成后立即复制 token，页面关闭后无法再次查看。
4. 安装官方 Gitee CLI：

   ```bash
   npm install -g @gitee/gitee-cli
   gitee --version
   ```

   或使用官方安装脚本：

   ```bash
   curl -fsSL https://gitee.com/oschina/gitee-cli/raw/main/scripts/install.sh | sh
   ```

5. 登录：

   ```bash
   gitee auth login                                              # 交互粘贴 token
   printf '%s' "$GITEE_TOKEN" | gitee auth login --with-token     # 非交互
   gitee auth status                                             # 查看状态
   ```

   凭据保存在 `~/.config/gitee/credentials.yml`。

6. 使用方式：
   - HTTPS 拉取/推送时，用户名填 Gitee 账号，密码填 token。
   - CI 中通过平台 secret 注入 `GITEE_TOKEN`，不要写进仓库。
   - 创建 PR：`gitee pr create -R owner/repo --base main --head <branch> -t "..." -b "..."`；
     列表：`gitee pr list -R owner/repo --json`。

## 3. 登录

### 交互式（推荐）

在任意 git 仓库里执行：

```bash
glab auth login
```

- glab 会从当前仓库的 remote 自动识别 GitLab 主机，选中对应实例。
- 选择认证方式（token 最简单；支持 OAuth 的实例也可选浏览器登录）。
- 选择 Git 协议：用 SSH 推送就选 `ssh`，用 HTTPS 就选 `https`。
- 粘贴第 2 步创建的 token。

### 指定自建实例

内网 HTTP 实例需要显式指定 API 协议，否则默认按 HTTPS 访问：

```bash
glab auth login \
  --hostname gitlab.example.com \
  --api-protocol http \
  --git-protocol ssh
```

### 非交互式（脚本 / CI）

```bash
glab auth login \
  --hostname gitlab.example.com \
  --api-protocol http \
  --git-protocol ssh \
  --token glpat-xxxxxxxx
```

从文件读取 token，避免出现在 shell 历史里：

```bash
glab auth login --hostname gitlab.example.com --stdin < ~/.config/glab-token.txt
```

浏览器 OAuth 登录（适用于 gitlab.com 等支持 OAuth 的实例）：

```bash
glab auth login --web
```

## 4. 验证

```bash
glab auth status
glab auth status --all          # 所有已登录实例
glab auth status --hostname gitlab.example.com
```

期望输出类似：

```text
gitlab.example.com
  ✓ Logged in to gitlab.example.com as <username> (~/.config/glab-cli/config.yml)
  ✓ Git operations for gitlab.example.com configured to use ssh protocol.
  ✓ API calls for gitlab.example.com are made over http protocol.
```

再确认能访问目标项目：

```bash
glab mr list -R <group>/<project> --per-page 5
```

## 5. 多实例与选择规则

- 可以同时登录 gitlab.com 和自建实例，凭据按 hostname 分别保存。
- glab 默认根据当前目录的 git remote 选择实例；不确定时用 `--hostname` 或 `-R` 显式指定。
- `-R/--repo` 指定**目标项目**，`-H/--head` 指定**源项目**。fork → upstream 的 MR 两者都必须显式给出，否则 glab 可能挑错仓库。

## 6. 环境变量

| 变量 | 用途 |
|---|---|
| `GITLAB_TOKEN` / `GITLAB_ACCESS_TOKEN` / `OAUTH_TOKEN` | 覆盖已保存的凭据（优先级更高，CI 常用） |
| `GITLAB_HOST` | 指定默认实例 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 代理 |

`GITLAB_TOKEN` 只放在当前 shell 或 CI secret 里，不要写进 `.env` 或仓库文件。

## 7. 常见问题

**401 Unauthorized / invalid token**

- token 过期、被撤销，或 Scopes 没有 `api`。重新创建 token 后 `glab auth login` 覆盖旧凭据。

**连接超时 / 证书错误**

- 自建实例只有 HTTP：登录时加 `--api-protocol http`。
- 公司代理：设置 `HTTPS_PROXY` 后重试。

**`glab` 选错了实例**

- 用 `glab auth status --all` 查看已登录的实例。
- 命令里显式加 `--hostname <host>` 或 `-R <group>/<project>`。

**创建 MR 失败：source/target 不对**

- fork → upstream 场景：`glab mr create -R <upstream> -H <fork> -s <branch> -b <target>`。
- `git-action` 会按 profile 的 `mr.targets` 自动推导这两个项目；手工执行时同样要写全。

**登录写到了哪里**

- 默认 `~/.config/glab-cli/config.yml`；使用 `--use-keyring` 时保存在系统钥匙串。该文件不要提交。

## 8. 与本仓库的关系

`git-action` 的 `mr` 动作由 profile 的 `actions.mr.tool` 选择：

| tool | 列表 | 创建 |
|---|---|---|
| `glab` | `glab mr list -R <target> -s <head> -b <base> -F json` | `glab mr create -R <target> [-H <head_project>] -s <head> -b <base> -t <title> -d <body> -y` |
| `gh` | `gh pr list -R <target> --head <head> --base <base> --state open --json url` | `gh pr create -R <target> --head <head> --base <base> -t <title> -b <body>` |
| `gitee` | `gitee pr list -R <target> --head <head> --base <base> --json` | `gitee pr create -R <target> --head <head> --base <base> -t <title> -b <body> --json --no-tui` |

fork → 上游时，`gh` / `gitee` 的 head 使用 `<owner>:<branch>` 形式（以各自文档为准）。
`install.sh` 会检查对应 CLI 是否安装、是否登录；登录命令需要交互输入或 `--with-token`，脚本不会代填。
