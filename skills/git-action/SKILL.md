---
name: git-action
description: >
  项目级 git 动作执行器。只负责按项目 `.claude/flows/profile.yaml` 执行 commit / push / mr 三类动作，
  不决定流程阶段、不写业务文档、不改功能代码、不做审查或验证、不安装门禁。
  由 flow-runner 在阶段边界槽位调用，或用户在阶段结束明确要求“提交/推送/建 MR”时使用。
  没有 profile.yaml 时拒绝执行，不猜测项目的分支、远端或提交规范。
---

# 项目级 git 动作执行器（git-action）

## 职责边界

**只负责：**

- 读取项目 `.claude/flows/profile.yaml`（可选 `profile.local.yaml` 覆盖本机差异）。
- 按 profile 执行 `commit`、`push`、`mr` 三类动作。
- 报告动作结果：commit sha、推送目标、MR 链接，或 no-op 原因。

**不负责：**

- 不决定何时执行；时机由 flow.yaml 的 `hooks` 和 profile 的 `bindings` 决定。
- 不写 brief / 设计 / 任务 / 实现 / 审查 / 验证内容。
- 不修改功能代码或测试断言。
- 不做 rebase、不解决冲突、不 amend 他人提交、不 force push。
- 不安装或修改 `.skillgate/done.yaml`；门禁由 flow-runner 安装、由 skillgate 判定。
- 不自动合并 MR。

## 输入

调用方传入：

| 参数 | 必填 | 说明 |
|---|---|---|
| `ACTION` | 是 | `commit` / `push` / `mr` |
| `STAGE` | 是 | 当前阶段 id，如 `implement`、`archive` |
| `FLOW` | 是 | 流程名，如 `doc-first` |
| `FEATURE` | 是 | feature 目录名，如 `2026-10-29-stage-git`，用于提交 trailer 和分支名 |
| `SCOPE` | 否 | 本阶段产物的显式路径列表；提供时只允许这些路径进入提交 |

## 前置检查（任何动作之前）

1. 确认在 git 仓库内且位于仓库根目录：

   ```bash
   root=$(git rev-parse --show-toplevel) && cd "$root"
   ```

2. 读取 profile；依次尝试 `.claude/flows/profile.local.yaml`、`.claude/flows/profile.yaml`。
   - 两个都不存在：**停止**，报告「项目未定义 git 动作 profile，跳过本次 <ACTION>」，不要猜测规则。
   - 同时存在：以 `profile.yaml` 为底，`profile.local.yaml` 的同名字段覆盖（按 `git`、`actions`、`bindings` 三段做浅合并）。
3. profile 声明了 `flow` 且与传入 `FLOW` 不一致时：停止并报告，不跨流程套用规则。

## 动作：commit

1. **分支守卫**
   - `branch=$(git rev-parse --abbrev-ref HEAD)`。
   - `branch` 等于 `git.base_branch` 或在 `git.protected` 中时：
     - `git.on_base_branch: refuse` → 停止，提示先创建分支，不自动切换。
     - `git.on_base_branch: create` → 按 `git.branch.pattern` 用 `FEATURE` 生成分支名并 `git switch -c`；生成的名字必须匹配 pattern，否则停止。
   - `branch` 与 `git.branch.pattern` 不匹配时：报告并停止（避免把提交写到不规范的分支上）。

2. **计算变更集**

   ```bash
   git status --porcelain=v1
   ```

   - 排除 `add.deny` 中的 pathspec（默认应包含 `.env*`、`*.key`、`*.pem`、`reports/`、`.tmp/`、`.skillgate/phase`）。
   - 排除后没有任何变更：报告 **no-op**（不是失败），给出「本阶段无待提交改动」，结束。
   - 提供了 `SCOPE` 时：只允许 `SCOPE` 内的路径进入本次提交；发现范围外改动时**停止**并列出文件，请调用方确认后再试。
   - 发现疑似密钥文件（`*.key`、`*.pem`、`.env*`、含 `TOKEN`/`SECRET` 的路径）：不加入提交，单独报告。

3. **暂存**

   ```bash
   git add -A -- . ':(exclude)<deny-1>' ':(exclude)<deny-2>'
   ```

   禁止 `git add -A` 不带排除、禁止 `git add -f`（会绕过 `.gitignore`）、禁止把仓库外路径加入提交。

4. **生成提交信息**
   - 类型：优先 `message.type_by_stage[STAGE]`；取值为 `auto` 时按变更内容判断——只改 `docs/` 或流程文档用 `docs`，只改测试用 `test`，改功能代码用 `feat`（若是修复缺陷用 `fix`），纯流程/配置用 `chore`。
   - scope：`message.scope_by_stage[STAGE]`，没有则省略。
   - 语言：`message.language`，默认 `zh`。
   - 格式：

     ```text
     <type>(<scope>): <不超过 50 字的中文摘要>

     - <本阶段做了什么>
     - <影响范围或验证情况>

     Flow-Flow: <FLOW>
     Flow-Stage: <STAGE>
     Flow-Feature: <FEATURE>
     ```

   - trailer 必须保留：`git log --grep "Flow-Stage: implement"` 要能回溯每个阶段的提交。

5. **提交**

   ```bash
   git commit -m "<subject>" -m "<body>" -m "<trailers>"
   ```

   - 提交失败（钩子拒绝、身份未配置等）：停止并原样报告错误，不重试、不绕过 `--no-verify`。
   - 成功后输出 `git log -1 --format='%H %s'`。

## 动作：push

1. 分支守卫同 `commit`：不允许从 `base_branch` 或 `protected` 分支推送。
2. 确认远端存在：

   ```bash
   git remote get-url <git.push_remote>
   ```

   不存在时停止，报告缺失的远端名，不自动添加或改名。
3. 推送：

   ```bash
   # 尚无 upstream 时
   git push -u <git.push_remote> <branch>
   # 已有 upstream 时
   git push <git.push_remote> <branch>
   ```

4. 禁止 `--force`、`--force-with-lease`、`+<ref>`、`--no-verify`。个人分支需要改写历史时由用户手动处理。
5. 已经是最新（无待推送提交）时报告 **no-op**，不视为失败。
6. 输出推送的远端、分支和远端 URL。

## 动作：mr

按 `mr.targets` 的顺序逐个处理；每个目标独立判定、独立幂等。任一目标失败即停止，不回滚已创建的 MR。

### 公共前置

1. 工作区干净：`git status --porcelain` 必须为空。
2. `mr.targets` 中出现的远端都必须存在，否则停止并报告缺失的远端名。
3. 只读 fetch 后再比较和创建，不基于可能过期的本地引用：

   ```bash
   git fetch --quiet <head_remote> <head_branch>
   git fetch --quiet <base_remote> <base_branch>
   ```

4. `mr.tool` 必须是 `glab`、`gh` 或 `gitee`；缺失或未知时停止，不猜测。

### 每个目标

1. **解析 head / base**
   - `head`、`base` 形如 `<remote>/<branch>`；`head: current_branch` 表示当前工作分支。
   - `head` 是当前分支时要求已推送且与远端一致：`git rev-list --count @{upstream}..HEAD` 为 `0`，否则停止并提示先执行 `push`。
   - 目标项目由 `base` 的远端推导：`git remote get-url <base_remote>` → `<group>/<project>`（去掉协议前缀、用户名和 `.git` 后缀），不写死仓库路径。
   - head 不在目标项目时，同样从 `git remote get-url <head_remote>` 推导 head 项目。

2. **条件判定**
   - 先算 `ahead = git rev-list --count <base>..<head>`；`ahead == 0` 时无论其他条件如何都报告 **no-op（没有可合并的提交）**。
   - `when: always`：直接执行。
   - `when.ahead_by: N`：`ahead >= N` 才执行。
   - `when.idle_days: N`：head 分支最新提交距今 ≥ N 天才执行（`now - $(git log -1 --format=%ct <head>) >= N*86400`），用于「主干安静了一周，说明本轮开发已完成」的场景。
   - `when.any: [...]`：任一子条件成立即执行；`when.all: [...]`：全部成立才执行。子条件同上。
   - 条件不成立时报告 **no-op** 并给出实际值（当前领先 X 个提交、距上次提交 Y 天）。
   - 条件无法判定（远端或分支不存在、fetch 失败）：停止，不猜测。

3. **幂等**（按 `mr.tool` 选择命令）

   ```bash
   # glab
   glab mr list -R "<target_project>" -s "<head_branch>" -b "<base_branch>" -F json
   # gh
   gh pr list -R "<target_project>" --head "<head_branch>" --base "<base_branch>" --state open --json url
   # gitee
   gitee pr list -R "<target_project>" --head "<head_branch>" --base "<base_branch>" --json
   ```

   已有 open MR/PR 时报告链接并跳过该目标，不重复创建。

4. **生成标题与描述**
   - 标题：目标配置了 `title` 时按模板渲染（`{ahead}` = 领先提交数，`{feature}` = FEATURE）；否则用 `<type>: <FEATURE 的可读名称>`。
   - 描述：按 `mr.sections` 从 `description_from` 指定的产物提取；`ahead_by` 目标的描述改为列出 `git log --oneline <base>..<head>` 的提交主题。
   - 缺产物时标注「未提供」，不编造测试结果。

5. **创建（按 `mr.tool` 选择命令，不进入交互编辑）**

   ```bash
   # glab：head 与目标项目相同
   glab mr create -R "<target_project>" -s "<head_branch>" -b "<base_branch>" \
     -t "<title>" -d "<body>" -y
   # glab：head 在另一个项目（fork → upstream）
   glab mr create -R "<target_project>" -H "<head_project>" \
     -s "<head_branch>" -b "<base_branch>" -t "<title>" -d "<body>" -y

   # gh：fork 场景 head 用 <owner>:<branch>
   gh pr create -R "<target_project>" --head "<head_branch>" --base "<base_branch>" \
     -t "<title>" -b "<body>"

   # gitee：fork 场景 head 用 <owner>:<branch>
   gitee pr create -R "<target_project>" --head "<head_branch>" --base "<base_branch>" \
     -t "<title>" -b "<body>" --json --no-tui
   ```

   `glab -y` / `gitee --no-tui` 跳过交互；`gh` 在提供 `-t`/`-b` 后不再提示。

   `-H` 必须显式指定 head 项目，否则 glab 可能挑到错误项目。失败时停止并输出可手动点击的 MR 创建地址，不重复尝试。

6. 输出每个目标的 MR URL 或 no-op 原因。不合并、不设置审批、不修改目标分支。

## 强制规则

1. **profile 是唯一真源**：分支规范、远端、提交类型只从 profile 读取，不在本 skill 内硬编码任何项目约定。
2. **不做猜测**：profile 缺失、字段缺失、分支不匹配、远端不存在时一律停止并报告，不使用默认值兜底。
3. **范围可控**：只提交本次动作声明的变更；不顺手提交无关文件，不使用 `-f`。
4. **不可逆操作**：不 force push、不 rebase、不 `reset --hard`、不改写历史；需要时交由用户。
5. **失败即停**：任何一步失败都原样报告，不重试、不绕过钩子、不吞错误。
6. **幂等**：无变更、无待推送提交、MR 已存在都按 no-op 处理，不产生空提交或重复 MR。

## 完成输出

- 动作与结果：`commit <sha>` / `push <remote>/<branch>` / 每个 MR 目标的 URL 或 no-op 原因。
- 涉及文件（commit）或待推送提交数（push）。
- 未执行或失败的原因，以及下一步建议。
