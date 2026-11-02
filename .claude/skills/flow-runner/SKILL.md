---
name: flow-runner
description: >
  流程调度器。只负责选择流程、创建 feature 目录、安装/切换 skillgate 策略、按流程清单调度阶段、
  按项目 profile 在任务/阶段边界调用 git-action 执行提交/推送/MR，并调用 skillgate 推进 phase；
  不写 brief/设计/任务内容，不写代码、不审查、不验证、不自己拼 git 命令。
  当用户要求“走文档先行流程”“按流程做”“启动/继续 doc-first”，或需要把多个 skill 串成流程时使用；
  小型项目/小改动走 lite（plan-code），线上缺陷走 hotfix，Word/PDF 开发文档走 dev-docs，项目 PPT 走 ppt。
  普通单文件修改、只想单独跑某个阶段（直接用对应 skill）时不要使用。
---
# 流程调度器（flow-runner）

## 职责边界

**只负责：**
- 根据用户意图选择流程（`<flows>/<flow>/flow.yaml`，解析规则见「流程目录解析」）。
- 创建 feature 目录和 `current` 符号链接。
- 把流程的 skillgate 策略安装为项目的 `.skillgate/done.yaml`（或按用户确认切换）。
- 按 flow.yaml 顺序调度阶段：`type: doc` 读取阶段文档，`type: skill` 调用对应 skill。
- 按 flow.yaml 的 `hooks` 和项目 profile 的 `bindings` 在阶段边界调用 `git-action`；`task_end` 由阶段 skill 在任务间执行，runner 负责把绑定传下去。
- 在每个阶段结束后调用 `skillgate phase <刚完成的阶段>`，由 skillgate 判定能否推进。
- 停止在人工确认点，向用户报告状态。

**不负责：**
- 不写 brief、设计、任务清单、审查报告、验证报告。
- 不写代码、不跑测试、不做代码审查、不归档。
- 不自己执行 git 命令；提交、推送、创建 MR 只能经 `git-action` 按项目 profile 执行。
- 不手动修改 `.skillgate/phase` 或 `.skillgate/done.yaml` 来让门禁通过。
- 不替代阶段 skill 的职责和模板。

## 输入

- 流程名（如 `doc-first`）或自然语言需求。
- 当前项目根目录（git 仓库）。
- 可选 feature slug；未提供时按 `YYYY-MM-DD-<kebab-name>` 生成。

## 前置条件

- 当前目录是 git 仓库。
- Node.js ≥18，可用 `npx`。
- 项目有或允许创建 `.skillgate/done.yaml`。
- 流程目录存在：按「流程目录解析」能找到 `<flow>/flow.yaml`。
- 可选：项目 `.claude/flows/profile.yaml` 定义启用的流程（`flows`）、git 动作与阶段绑定；不存在时所有槽位 no-op。
- `dev-docs` 需要官方 `docx` skill 和 `soffice`；`ppt` 需要 `ppt-master` skill、`soffice`、`pdftoppm`。

## 流程目录解析

按以下顺序查找流程目录，命中即用；下文 `<flows>/<flow>/` 均指这个结果：

1. 项目内 `.claude/flows/<flow>/`（项目覆盖）
2. `$CLAUDE_CONFIG_DIR/flows/<flow>/`（默认 `~/.claude/flows/<flow>/`）
3. `$CODEX_HOME/flows/<flow>/`（默认 `~/.codex/flows/<flow>/`）

`install.sh` 会把同一份流程同时装到选中的 agent 目录；项目覆盖仍然是最高优先级。

## 项目启用的流程

不同项目适用的流程不同（例如 `ppt`、`dev-docs` 只对特定项目有意义），由项目自己决定启用哪些：

```yaml
# <project>/.claude/flows/profile.yaml
flows: [doc-first, hotfix]
```

- 列表存在：只能选择列表内的流程；用户点名列表外的流程时停止，列出已启用流程，不自动启用。
- 列表不存在或为空：可选用所有已安装流程（向后兼容）。
- 列表里的流程找不到对应目录：报告缺失，不自动安装；由用户决定是否更新 agent-workflow。

## 启动

1. **选流程**
   - 先读取项目 `.claude/flows/profile.yaml` 的 `flows`，把可选流程限制在启用列表内（规则见「项目启用的流程」）。
   - `$ARGUMENTS` 以流程名开头时直接用该流程；不在启用列表内则停止并列出可用流程。
   - 否则根据请求判断：
     - 单模块、预计 ≤3 个文件、不需要独立的 brief/design/tasks → `lite`（plan-code 负责设计 + 实现，设计需用户确认）。
     - 跨模块、需要分阶段确认 → `doc-first`。
     - 线上缺陷、需要先复现定位 → `hotfix`。
     - 需要交付 Word/PDF 开发文档 → `dev-docs`（官方 docx skill + LibreOffice）。
     - 需要项目演示文稿/PPT → `ppt`（ppt-master skill）。
   - 无法判断时只问一个问题：“走哪条流程：doc-first、lite、hotfix、dev-docs 还是 ppt？”
   - 当前仓库同时只允许一个活跃流程；切换前必须得到用户确认。

2. **建 feature 目录**

   以 flow.yaml 的 `artifacts` 为准。例如 doc-first 的 `artifacts: docs/specs/current`：

   ```bash
   mkdir -p docs/specs/<feature>
   ln -sfn <feature> docs/specs/current
   ```

   hotfix 同样使用 `docs/specs/current`。产物必须在 git 跟踪范围内，CI 才能校验；不要放进 `.tmp` 或被 `.gitignore` 忽略。

3. **安装策略**
   - `.skillgate/done.yaml` 不存在：复制 `<flows>/<flow>/policy.yaml`。
   - 已存在且与目标策略不同：先判断是否包含项目自有 gate（文档治理、git 规范等）。有自有 gate 时**合并**流程 gate，保留原有 id 和内容，不要整文件覆盖；没有自有 gate 时才展示差异并询问是否切换。
   - 复制或合并后检查 `tests-pass`：如果还是模板里的 TODO 占位命令，询问用户项目的测试命令并替换；不要保留必然失败的占位。
   - 不得为了让某个门禁通过而删改策略内容。

4. **查看状态**

   ```bash
   npx --yes @reneza/skillgate@0.16.0 phase
   ```

   `.skillgate/phase` 记录的是**最近完成的阶段**；没有该文件表示还未完成任何阶段，从 flow.yaml 的第一个 stage 开始。

## 执行循环

1. 确定待执行阶段：`cat .skillgate/phase` 得到最近完成的阶段；flow.yaml 中它的下一个 stage 就是当前要做的阶段。没有 marker 时从第一个 stage 开始。
2. 在 flow.yaml 中找到该 stage。
3. 执行：
   - `type: doc`：读取 `<flows>/<flow>/<ref>`，按文档执行。
   - `type: skill`：调用 `ref` 对应的 skill（Claude Code 用 `Skill` 工具；Codex 读取并执行该 skill 的 `SKILL.md`）。
     - 该阶段 `approval: true` 时，先读产物当前 `status`，按「审批阶段的两遍执行」决定本次是设计轮还是实现轮。
     - 从 profile 取 `bindings.<stage>.task_end`；非空时在调用提示中声明，并把 `FLOW`、`FEATURE`、`STAGE` 和动作列表传给 skill。`task_end` 只允许 `commit`；出现 `push` / `mr` 时停止并报告。设计轮不执行 `task_end`，实现轮才传入。
     - 没有声明时明确告诉 skill：本阶段不做任务级提交，由 `stage_end` 统一处理。
   - 调用 `plan-code` 时，要求它把设计文档写到 `docs/specs/current/00-plan.md`；设计轮传 `PLAN_ROUND=design` 并要求 `status: draft`，实现轮传 `PLAN_ROUND=implement` 并要求完成后 `status: implemented`。如果它写到 `.tmp`，复制到目标路径。
4. 阶段产物完成后的处理：
   - 检查产物路径和 frontmatter 状态。
   - `approval: true` 的 `type: doc` 阶段：产物为草案时停止并询问用户；用户确认后只把 frontmatter `status` 改为 `approved`，不改正文。
   - `approval: true` 的 `type: skill` 阶段：设计轮产物为 `draft` 时停止并询问用户，不执行钩子、不推进 phase；用户确认后只把 `status` 改为 `approved`，立即重新进入同一阶段执行实现轮。
   - 实现轮产物达到阶段 gate 后，才继续执行钩子和 `skillgate phase`。
5. 执行阶段钩子：
   - 读取项目 `.claude/flows/profile.yaml`（`profile.local.yaml` 覆盖本机差异）；不存在时跳过本步骤，行为与旧版一致。
   - 取 flow.yaml 中该 stage 的 `hooks`；每个 hook 必须是 flow.yaml 顶层 `checkpoints` 声明过的值。
   - `task_end` 已在第 3 步交给阶段 skill 执行，runner 不重复执行；如果 `bindings.<stage>.task_end` 含 `push` / `mr`，停止并报告（未验证代码不得推送）。
   - 对其余 hook（`stage_end` / `finish`），在 profile 的 `bindings.<stage>.<hook>` 取动作列表，按顺序对每个动作调用 `Skill(git-action)`，传入 `ACTION`、`STAGE`、`FLOW`、`FEATURE`。
   - 任一动作失败：原样报告并停在当前阶段，不推进 phase、不自动重试、不跳过。
   - 没有 profile、没有绑定或动作为空：no-op，继续。
6. 标记该阶段完成：

   ```bash
   npx --yes @reneza/skillgate@0.16.0 phase <刚完成的-stage-id>
   ```

   注意：参数是**刚完成的阶段**，不是下一个阶段。skillgate 会重新校验该阶段及其之前所有阶段的门禁。
   - exit 0：进入 flow.yaml 的下一个阶段。
   - exit 2：报告缺失的门禁，停在当前阶段；不得手动写 `.skillgate/phase`。
7. 最后一个阶段（archive）完成后：

   ```bash
   npx --yes @reneza/skillgate@0.16.0 check
   ```

   全部通过后执行该 stage 的 `finish` 钩子（典型绑定是 push + mr）；没有绑定则提示用户可以 `git push`。push 时由 hook / CI 再次校验。

### 审批阶段的两遍执行

`approval: true` 的 `type: skill` 阶段用两遍执行同一个阶段；`.skillgate/phase` 只在实现轮完成后推进。

| 轮次 | 判断依据 | 传给 skill | 产物状态 | runner 行为 |
|---|---|---|---|---|
| 设计轮 | 产物不存在，或 `status: draft` 且用户尚未确认 | `PLAN_ROUND=design`：只出设计，不写代码 | `draft` | 展示设计、请求用户确认；不执行 `task_end` / `stage_end`，不推进 phase |
| 实现轮 | `status: approved`（或用户本轮明确确认） | `PLAN_ROUND=implement`：按已确认文档实现 | `implemented` | 检查产物后执行阶段钩子，再 `skillgate phase <stage>` |

- 用户确认时，runner 只修改 frontmatter 的 `status: draft` → `approved`，不改正文；随后重入同一阶段。
- 恢复会话时按产物状态续跑：`draft` → 先问用户是否确认；`approved` → 直接实现轮；`implemented` → 直接执行阶段钩子和 `phase`。
- 设计轮禁止写功能代码；实现轮要求 `status` 已为 `approved`，否则退回设计轮等待确认。
- 未声明 `approval: true` 的 `type: skill` 阶段保持一遍执行。

### 归档清理

`archive` 阶段必须执行阶段文档中的「清理」清单：清理本 feature 和 `.tmp/` 下的临时文件、重复草稿、旧版本与构建/导出中间产物；保留流程产物、`INDEX`、被 README/AGENTS/docs/ 引用的文件和最终交付物。删除 tracked 文件前先列出路径和原因并等用户确认（`mode: auto` 除外，见「归档保留策略」）；未确认时保留，不阻塞归档。清理后重新执行 `skillgate check`；因删除导致门禁失败时恢复文件并报告，不得绕过门禁。清理结果写入归档完成输出，并在 `stage_end` 提交中体现（如有删除）。不得以清理为由删除流程产物或改写归档结论。

### 归档保留策略

归档清理完成后，按项目 profile 的 `retention.archive` 处理历史 feature；字段缺省时使用默认值。

```yaml
retention:
  archive:
    keep_latest: 20   # 至少保留最近 N 个已归档 feature
    keep_days: 180    # 至少保留最近 N 天内归档的 feature
    min_keep: 5       # 无论如何至少保留 N 个
    mode: ask         # ask | report | auto
```

- 作用范围：flow.yaml 的 `archive` 目录（如 `docs/specs`、`docs/deliverables`、`presentations`），不含 `current` 符号链接和 INDEX 文件。
- 候选必须同时满足：目录已被 git 跟踪且工作区干净（无未提交/未跟踪文件）；`00-*.md` 主文档 frontmatter 有 `archived: YYYY-MM-DD`（找不到时扫描目录内其他 `.md`）；不是 `current` 指向的 feature；不在最近 `keep_latest` 个已归档 feature 中；归档日期早于 `keep_days` 天；未被 README.md、AGENTS.md 或 `docs/`（不含归档目录和 INDEX）引用。
- 永不清理：`current` 指向的 feature、未归档 feature、缺少 `archived` 字段的 feature、工作区不干净的 feature、保留数量低于 `min_keep` 时、用途不明确或无法确认是否必要的文件。缺少 `archived` 时先补归档字段，不要猜测。
- `mode`：
  - `report`：只列出候选，不删除。
  - `ask`（默认）：列出候选路径、归档日期和原因，等用户确认后删除。
  - `auto`：项目显式启用后自动删除候选；删除前仍打印清单。
- INDEX：删除前必须存在 `INDEX.md`，且每个候选都能在 INDEX 找到对应行；缺失时拒绝删除并报告。不删除行；把状态改为 `purged`，保留原归档日期，并在摘要后追加 `（docs 已于 YYYY-MM-DD 清理）`。
- 删除后运行 `skillgate check`；失败时用 `git restore` 恢复被删目录并报告，不得绕过门禁。
- 完成输出记录：保留数量、清理数量、跳过数量及原因。
- agent-workflow 仓库内可用 `node scripts/archive-retention.mjs --project <dir> --flow <flow>` 预演候选；目标项目没有该脚本时按本节规则手工执行。

## doc-first 阶段表

| 阶段 | 类型 | 执行 | 产物 | 推进条件 |
|---|---|---|---|---|
| brief | doc | `stages/brief.md` | `00-brief.md` | `status: approved` |
| design | doc | `stages/design.md` | `10-design.md` | `status: approved` |
| tasks | doc | `stages/tasks.md` | `20-tasks.md` | `status: approved` |
| implement | skill | `df-implement` | `30-impl.md` | `status: done` |
| review | skill | `code-review` | `35-review.md` | `status: pass` |
| verify | skill | `df-verify` | `40-verify.md` | `status: pass` + 测试命令通过 |
| archive | doc | `stages/archive.md` | `docs/specs/<feature>/` | 归档完成 |

lite 流程（小型项目/小改动）：

| 阶段 | 类型 | 执行 | 产物 | 推进条件 |
|---|---|---|---|---|
| plan | skill | `plan-code`（设计轮 → 用户确认 → 实现轮） | `00-plan.md` | 确认后 `status: implemented` |
| verify | doc | `stages/verify.md` | `40-verify.md` | `status: pass` + 测试命令通过 |
| archive | doc | `stages/archive.md` | `docs/specs/<feature>/` | 归档完成 |

plan 阶段 `approval: true`：设计轮产物为 `draft` 时停在用户确认点；确认后把状态改为 `approved` 并重入同一阶段实现，直到 `implemented` 才执行阶段钩子和 `skillgate phase plan`。

hotfix 流程见 `<flows>/hotfix/flow.yaml`：reproduce → tasks → implement → verify → archive，阶段数量和 doc-first 不同，复用 `df-implement` 和 `df-verify`。

dev-docs 流程（Word/PDF 开发文档）：

| 阶段 | 类型 | 执行 | 产物 | 推进条件 |
|---|---|---|---|---|
| brief | doc | `stages/brief.md` | `00-brief.md` | `status: approved` |
| draft | doc | `stages/draft.md` | `10-draft.md` | `status: approved` |
| review | doc | `stages/review.md` | `20-review.md` | `status: pass` |
| build | doc | `stages/build.md`（调用 `docx`） | `30-doc.docx` | 文件存在 |
| export | doc | `stages/export.md`（LibreOffice） | `40-doc.pdf` | 文件存在 |
| archive | doc | `stages/archive.md` | `docs/deliverables/<feature>/` | 归档完成 |

ppt 流程（设计感更强的 .pptx）：

| 阶段 | 类型 | 执行 | 产物 | 推进条件 |
|---|---|---|---|---|
| brief | doc | `stages/brief.md` | `00-brief.md` | `status: approved` |
| outline | doc | `stages/outline.md` | `10-outline.md` | `status: approved` |
| content | doc | `stages/content.md` | `20-content.md` | `status: done` |
| design | doc | `stages/design.md` | `30-design.md` | `status: approved` |
| build | doc | `stages/build.md`（调用 `ppt-master`） | `40-deck.pptx` | 文件存在 |
| review | doc | `stages/review.md` | `50-review.md` | `status: pass` |
| export | doc | `stages/export.md` | `60-deck.pdf` | 文件存在 |
| archive | doc | `stages/archive.md` | `presentations/<feature>/` | 归档完成 |

所有流程的阶段都可带 `hooks` 槽位，实际执行什么由项目 `.claude/flows/profile.yaml` 的 `bindings` 决定。同一份 flow.yaml 在不同项目里可以有不同（或没有）的提交、推送、MR 时机，不需要分叉流程定义。

- `task_end`：`type: skill` 阶段内每完成一个任务触发，由阶段 skill 执行；只应绑定 `commit`。提交边界是“未验证的中间步骤”，与改动大小无关。
- `stage_end`：阶段结束时由 runner 执行；通常只绑定 `commit`。
- `finish`：全部门禁通过后由 runner 执行；通常绑定 `push + mr`。

## 强制规则

1. **不改状态**：`.skillgate/phase` 只能由 `skillgate phase` 写；`.skillgate/done.yaml` 只能由用户确认后切换。
2. **不跳阶段**：`skillgate phase` 失败就是失败，不允许绕过。
3. **不越权**：`type: skill` 阶段把工作交给对应 skill；不要在本 skill 里重写它的步骤。
4. **不自己执行 git**：runner 不拼 `git add` / `git commit` / `git push`；提交、推送、MR 只能调用 `git-action`，且必须由 profile 绑定驱动。没有 profile 时只提示用户，不替代执行。
5. **人工确认**：brief、design、tasks 三个阶段必须等用户确认后才能改 `approved`；`approval: true` 的 skill 阶段必须先完成设计轮并等待用户确认，才能进入实现轮。
6. **单一活跃 feature**：`current` 符号链接指向当前 feature；切换 feature 前确认旧 feature 已归档或明确暂停。
7. **策略可审计**：切换流程时保留原 `.skillgate/done.yaml` 的 diff，必要时提交到分支。
8. **钩子不改门禁**：`git-action` 成功不等于门禁通过，失败也不能被忽略；钩子只执行动作，不能替代 `skillgate phase`。
9. **钩子顺序固定**：任务完成后执行 `task_end`，阶段产物完成后执行 `stage_end`，最后推进 phase；`finish` 动作只在全部门禁通过后执行。`task_end` 只允许 `commit`；`push` / `mr` 默认放在 `finish`，项目确需中途发布时才绑定到 `stage_end`。
10. **归档清理与保留**：`archive` 阶段必须按阶段文档执行清理，并遵守 `retention.archive`；只删除临时/冗余文件或符合保留策略的历史 feature。删除 tracked 文件前必须让用户确认（`mode: auto` 除外），不得删除流程产物或改写归档结论。

## 完成输出

- 当前流程与 feature。
- 当前阶段与状态。
- 产物路径与状态。
- skillgate 门禁结果（通过/缺失）。
- git 动作结果：任务级 commit sha、阶段 commit sha、推送目标、MR 链接，或 no-op 原因。
- 下一步：继续某阶段、等待用户确认、或 `git push`。
- 风险与未决项。
