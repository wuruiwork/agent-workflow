# doc-first 项目模板

把本目录的文件复制到目标项目根目录，即可获得：

- `.skillgate/done.yaml`：阶段门禁（brief → design → tasks → implement → review → verify → archive）
- `.claude/settings.json`：Claude Code `PreToolUse` hook，`git push` 前跑门禁
- `.github/workflows/skillgate.yml`：PR 上跑同一套门禁
- `scripts/pre-push`：git 级 pre-push 兜底

## 安装

1. 复制文件：

   ```bash
   cp -r ~/.claude/flows/doc-first/project-template/.skillgate .
   cp -r ~/.claude/flows/doc-first/project-template/.claude .
   cp -r ~/.claude/flows/doc-first/project-template/.github .
   mkdir -p scripts && cp ~/.claude/flows/doc-first/project-template/scripts/* scripts/
   ```

2. 修改 `.skillgate/done.yaml` 里的 `tests-pass`，换成项目真实测试命令。默认命令故意失败，避免没配置就放行。

3. 安装 git pre-push：

   ```bash
   sh scripts/install-pre-push.sh
   ```

4. 在 GitHub 仓库设置里，把 `skillgate` workflow 设为 required status check（分支保护）。

5. 在项目里启动流程：

   ```
   /flow-runner doc-first
   ```

   或者在 Claude Code 里说“走文档先行流程”。

## 门禁怎么工作

- `skillgate phase <id>`：`<id>` 是**刚完成的阶段**；只有该阶段及之前所有阶段的产物满足要求时才会写入 marker，失败退出码 2。
- `skillgate check`：检查全部门禁。
- `skillgate gate --command "git push"`：push 前检查；不通过就阻断。
- 本地 `git commit` 不拦，方便分阶段保存；`git push` 才拦。

产物从 brief 阶段起就写在 `docs/specs/<feature>/`，`docs/specs/current` 指向它。这些文档必须在 git 跟踪范围内，CI 才能校验；不要放进 `.tmp` 或 `.gitignore`。archive 阶段只更新 `INDEX.md` 和 `archived` 字段。

阶段与产物：

| 阶段 | 产物 | 推进条件 |
|---|---|---|
| brief | `docs/specs/current/00-brief.md` | `status: approved` |
| design | `docs/specs/current/10-design.md` | `status: approved` |
| tasks | `docs/specs/current/20-tasks.md` | `status: approved` |
| implement | `docs/specs/current/30-impl.md` | `status: done` |
| review | `docs/specs/current/35-review.md` | `status: pass` |
| verify | `docs/specs/current/40-verify.md` | `status: pass` + 测试通过 |
| archive | `docs/specs/<feature>/` | 归档完成 |

## 硬度的边界

| 层 | 强度 |
|---|---|
| Claude Code `PreToolUse` hook | 本地软约束；fail-closed，但用户可改配置 |
| git `pre-push` | 本地软约束；可用 `--no-verify` 绕过 |
| CI + 分支保护 | 服务端硬约束；合并前必须通过 |

真正不可绕过的是最后一层。前两层负责尽早反馈，减少无效 push。

## 多流程

每个流程一份 `policy.yaml`。`flow-runner` 启动或切换流程时，把对应策略复制到 `.skillgate/done.yaml`；切换前会要求确认。同一仓库同时只保留一个活跃流程。

新增流程：复制本目录结构，改 `flow.yaml` 的阶段、`policy.yaml` 的 gates/phases、以及 `stages/` 文档。
