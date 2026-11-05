# flows

流程定义目录。`flow-runner` 按以下顺序查找：项目 `.claude/flows/` → `$CLAUDE_CONFIG_DIR/flows/`（默认 `~/.claude/flows/`）→ `$CODEX_HOME/flows/`（默认 `~/.codex/flows/`）。

## 已安装的流程

| 流程 | 文件 | 适用 | 说明 |
|---|---|---|---|
| doc-first | `doc-first/flow.yaml` | 跨模块、需要分阶段确认 | 需求 → 设计 → 任务 → 实现 → 审查 → 验证 → 归档 |
| lite | `lite/flow.yaml` | 小型项目/小改动、单模块 ≤3 文件 | plan-code 设计 → 用户确认 → 实现 → 验证 → 归档 |
| hotfix | `hotfix/flow.yaml` | 线上缺陷 | 复现定位 → 单任务 → 实现 → 验证 → 归档 |
| dev-docs | `dev-docs/flow.yaml` | Word/PDF 开发文档 | 简报 → 草稿 → 评审 → Word → PDF → 归档 |
| ppt | `ppt/flow.yaml` | 项目演示文稿 | 简报 → 大纲 → 内容 → 设计 → PPTX → 视觉评审 → PDF → 归档 |
| graph-demo | `graph-demo/flow.yaml` | v3 图流程演示 | brief → 并发 design/research → tasks（join all）→ implement → review（pass→verify / fail→fix→review，limit 3）→ verify → archive |

`doc-first/project-template/` 是复制到目标项目的门禁模板（skillgate + Claude Code hook + CI + pre-push）。

## 图流程（v3）

`version: 3` 用 `edges` 作为唯一顺序来源；v2 仍然按 `stages` 数组顺序执行。

```yaml
version: 3
stages:
  - id: verify
    join: any        # any（默认）| all
edges:
  - { from: review, to: verify, when: pass }
  - { from: review, to: fix, when: fail }
  - { from: fix, to: review, limit: 3 }
```

- `when`：`always`（默认）/ `pass` / `fail` / `{ status: <value> }`。
- `join`：`all` 用于 fan-out 汇合；`any` 用于条件分支汇合。
- `limit`：回环必须有至少一条边带 `limit`，否则校验器拒绝。
- 执行：`flow-runner` 调用 `skills/flow-runner/scripts/flow-state.mjs`，本地状态在 `.skillgate/flow-state.json`；`<flow.artifacts>/flow-trace.json` 提交后由 CI 的 `flow-trace` gate 重放校验。
- v3 的 `policy.yaml` 不再有线性 `phases` gate，保留阶段产物 gate、`tests-pass` 和 `archive-indexed`。
- 并发：支持子 agent 的环境并发执行 ready 阶段；子 agent 不跑 git、不写状态；同一并发组的钩子在整组结束后由主 runner 串行执行，写集重叠时停止。

## 门禁引擎：skillgate

硬状态使用 [`@reneza/skillgate`](https://github.com/renezander030/skillgate) 0.16.0，不再自研状态 CLI。

每个项目安装一次：

```bash
# 1. 复制流程策略
mkdir -p .skillgate
cp ~/.claude/flows/doc-first/project-template/.skillgate/done.yaml .skillgate/done.yaml
#    lite 流程改用：cp ~/.claude/flows/lite/policy.yaml .skillgate/done.yaml
# 2. 改成项目测试命令
#    .skillgate/done.yaml -> gates -> tests-pass -> run
# 3. 安装 Claude Code hook（拒绝 git push）
npx --yes @reneza/skillgate@0.16.0 install claude-code
# 4. 安装 CI workflow
npx --yes @reneza/skillgate@0.16.0 install github-actions
# 5. 安装 git pre-push
sh ~/.claude/flows/doc-first/project-template/scripts/install-pre-push.sh
```

阶段语义：`.skillgate/phase` 记录**最近完成的阶段**。完成 brief 后执行
`skillgate phase brief`，skillgate 会重新校验 brief 及之前所有阶段的门禁；
通过才写入 marker。不是“移动到下一个阶段”。

`approval: true` 的 skill 阶段（lite 的 plan）分两遍执行同一阶段：
设计轮只产出 `status: draft` 的设计文档并停在用户确认点；用户确认后
把状态改为 `approved` 并重入同一阶段执行实现轮，完成后才是
`status: implemented`。设计轮不执行阶段钩子，也不推进 phase。

阶段门禁（`phases` gate）只在分支里出现流程产物（`docs/specs/**` 等）时启用；
不经过流程的普通改动不会被 brief 阶段卡住，流程内仍按阶段严格推进。

`git commit` 默认不拦，`git push` 拦；CI + 分支保护是最终硬层。

## 项目级 git 动作（profile）

流程只声明“哪里需要动作”，项目决定“动作怎么做”。`flow.yaml` 的每个 stage 可以带
`hooks`（`stage_end` / `finish`），项目在 `.claude/flows/profile.yaml` 的 `bindings`
里把 hook 映射到 `commit` / `push` / `mr`：

```yaml
# ~/.claude/flows/doc-first/flow.yaml（通用，不含 git 语法）
checkpoints: [stage_end, finish]
stages:
  - id: implement
    hooks: [stage_end]
  - id: archive
    hooks: [stage_end, finish]
```

```yaml
# <project>/.claude/flows/profile.yaml（项目级）
bindings:
  implement: { stage_end: [commit, push] }
  archive:   { stage_end: [commit], finish: [push, mr] }
```

- `git-action` 只按 profile 执行；没有 profile 时所有槽位 no-op，旧项目行为不变。
- 同一份 `flow.yaml` 在不同项目里可以有不同（或没有）的提交、推送、MR 时机，不需要分叉流程。
- 阶段边界允许 push（现场验证可能在流程中途）：产物 gate 用 `when.changed` 限定，
  只有对应产物进入本分支 diff 时才检查，尚未产生的产物不会阻断早期 push。
- `finish` 槽位在全部门禁通过后自动执行。`mr` 支持多个目标，按顺序判定并各自幂等：
  `head` 可以是当前分支或另一个远端的长期分支，`base` 决定 MR 建在哪个项目。
- 条件：`always` 每次都建；`ahead_by: N` 领先 N 个提交时建；`idle_days: N` head 分支 N 天没有新提交时建；
  `any` / `all` 组合多个条件。没有可合并提交时始终 no-op。
  典型用法：fork main → upstream main 在「领先 30 个提交」或「主干安静一周、本轮开发完成」时同步。
- 跨项目 MR 必须用 `-H` 显式指定 head 项目。
- 项目可以在 `.claude/flows/profile.local.yaml` 覆盖本机差异（远端名等），该文件不入库。
- 项目通过 profile 的 `flows` 决定启用哪些流程；不写或留空表示全部可用：

  ```yaml
  flows: [doc-first, hotfix]
  ```

## 产物位置

流程产物从第一阶段起就写在 `docs/specs/<feature>/`，`docs/specs/current` 指向当前 feature。
这些文档必须在 git 跟踪范围内，CI 才能校验；不要放进 `.tmp` 或被 `.gitignore` 忽略。
`.tmp/docfirst/scripts/` 只放临时验证脚本，不参与门禁。

归档阶段负责清理本 feature 和 `.tmp/` 下的临时/冗余文件：保留流程产物、`INDEX`、
被 README/AGENTS/docs 引用的文档和最终交付物；草稿、旧版本、编辑器备份和构建/导出
中间文件及时删除。删除 tracked 文件前先列出清单并等用户确认。

## 归档保留策略

项目可以在 profile 里配置历史 feature 的保留策略；归档阶段按此清理过旧的记录：

```yaml
retention:
  archive:
    keep_latest: 20
    keep_days: 180
    min_keep: 5
    mode: ask
```

- `keep_latest` / `keep_days`：至少保留最近 N 个或 N 天内归档的 feature（取并集）。
- `min_keep`：无论如何至少保留 N 个已归档 feature。
- `mode`：`report` 只报告；`ask`（默认）列清单等用户确认；`auto` 自动删除候选。
- 只处理 tracked 且工作区干净的目录；`INDEX.md` 缺失时拒绝删除；`current`、未归档 feature、被 README/AGENTS/docs 引用的 feature 永不清理。
- INDEX 不删行；清理后的 feature 状态改为 `purged`，保留归档日期和摘要。
- 删除后重新运行 `skillgate check`；失败时用 `git restore` 恢复。
- 仓库内可预演候选：`node scripts/archive-retention.mjs --project <dir> --flow <flow>`；
  加 `--delete` 才会删除（`mode: auto` 或同时传 `--yes`）。

## 当前 skills

本地自有 8 个：

| Skill | 用途 | 流程归属 |
|---|---|---|
| `flow-runner` | 流程入口：选流程、建 feature、调度阶段、调 skillgate 推进 phase、按 profile 调 git-action | 控制器 |
| `git-action` | 按项目 profile 执行 commit / push / mr，不硬编码项目规则 | 阶段钩子 |
| `df-implement` | 按任务实现，可单独使用 | doc-first / hotfix |
| `code-review` | 代码审查，可单独使用 | doc-first |
| `df-verify` | 验证门禁，可单独使用 | doc-first / hotfix |
| `plan-code` | 小型项目/小改动的设计 → 确认 → 实现，可单独使用 | lite |
| `docs-steward` | 文档治理调度：audit / init / update / verify | 独立，归档后可选 |
| `repository-docs` | README / AGENTS.md / docs 的写作规范（vendored MIT） | 由 docs-steward 调用 |

插件 skills：

| Skill | 来源 | 用途 |
|---|---|---|
| `docx` | `document-skills@anthropic-agent-skills` | 生成/编辑 Word |
| `pdf` | 同上 | PDF 处理 |
| `pptx` | 同上 | 原生 PPTX 兜底/校验 |
| `xlsx` | 同上 | Excel |
| `ppt-master` | `ppt-master@ppt-master` | 设计感更强的原生 PPTX |

dev-docs 依赖 `docx` + `soffice`；ppt 依赖 `ppt-master` + `soffice` + `pdftoppm`。

## 文档与演示流程

```bash
# Word/PDF 开发文档
/flow-runner dev-docs

# 项目演示文稿（设计感更强的原生 PPTX）
/flow-runner ppt
```

- `dev-docs` 产物在 `docs/deliverables/current/`：`00-brief.md`、`10-draft.md`、`20-review.md`、`30-doc.docx`、`40-doc.pdf`。
- `ppt` 产物在 `presentations/current/`：`00-brief.md`、`10-outline.md`、`20-content.md`、`30-design.md`、`40-deck.pptx`、`50-review.md`、`60-deck.pdf`。
- 首次安装插件后运行 `/reload-skills` 或重启会话，让 `docx`、`pdf`、`pptx`、`xlsx`、`ppt-master` 出现在 skills 列表。
- `ppt-master` 的 Python 依赖已装到用户目录；如果换机器，在插件目录执行 `python3 -m pip install --user -r requirements.txt`。

## 文档治理

- `docs-steward` 决定“写到哪、谁拥有、何时更新”，具体写作交给 `repository-docs`。
- `repository-docs` vendored 自 [`fmind/dot`](https://github.com/fmind/dot/tree/main/skills/repository-docs)，MIT，保留 LICENSE 和 SOURCE。
- 三个策略都已加入 `instruction-sync` 和 `instruction-refs`，默认 `level: warn`；文档清理完成后把 `level: warn` 改成 `block`，就能阻止指令文件漂移和失效引用。

用法：

```
/docs-steward audit
/docs-steward update
/docs-steward verify
```

原先的 `df-workflow`、`df-brainstorm`、`df-design-doc`、`df-tasks`、`df-archive` 已移到
`~/.claude/skills-archive/2026-10-29-doc-first/`，内容已整理进
`doc-first/stages/`。

## 新增流程

1. 建 `~/.claude/flows/<flow>/`。
2. 写 `flow.yaml`：阶段列表、每阶段类型（`doc` / `skill`）、产物、是否人工确认、`hooks` 槽位（顶层 `checkpoints` 要先声明）。
3. 写 `policy.yaml`：skillgate 的 gates + phase。
4. 写 `stages/*.md`：只放该流程独有的阶段；通用阶段可以用 `type: skill` 指向已有 skill。
5. 复制 `project-template/` 到目标项目，或让 `flow-runner` 安装策略。

## 设计原则

- 流程负责“下一步做什么”，skillgate 负责“能不能进入下一步”。
- 阶段 skill 不互相硬编码调用；流程清单决定顺序。
- 状态只由 `skillgate phase` 写，模型只能申请。
- 动作与门禁分离：`git-action` 负责执行，skillgate 只负责判定，互不替代。
- 本地 commit 由 profile 按阶段自动执行；push 由 profile 决定时机，CI + 分支保护是最终硬层。
- 归档即清理：流程产物作为记录保留，临时草稿、重复版本和构建中间文件在 archive 阶段清理；过旧的历史 feature 按 `retention.archive` 策略清理。
