# 本仓库的项目级流程配置

`skills/` 和 `flows/` 是 `install.sh` 发布的基础配置，保持通用，不写入本项目的提交 / MR 策略。
本仓库特有的流程、skill 和 git 动作策略放在这里和缓存区：

- `.claude/flows/profile.yaml`：启用 `doc-first`、`lite`、`hotfix`；git 动作策略为
  - `task_end`（每完成一个未验证的中间步骤）→ `commit`
  - `stage_end` → `commit`
  - `finish`（完整功能验证通过、归档收尾）→ `push + mr`
- `workspaces/selfhost/`（缓存区，已被 `.gitignore` 忽略）：保存本项目修改过的 skill 和 flow：
  - `skills/df-implement`、`skills/flow-runner`、`skills/plan-code`：支持 `task_end` 槽位
  - `flows/doc-first`、`flows/hotfix`、`flows/lite`：声明 `task_end` 槽位
  - `profile.yaml`：项目 profile 的副本，便于在编辑器里打开缓存区
- `.claude/skills/`、`.claude/flows/`：项目级覆盖，全部是真实目录副本，不使用符号链接（项目加载时符号链接不可靠）。修改过的 3 个 skill / 3 个 flow 来自缓存区，其余来自基础 `skills/`、`flows/`；在缓存区改完后用 `cp -R` 同步到 `.claude`。
- `.skillgate/done.yaml`：doc-first 阶段门禁，`tests-pass` = `npm test`。
- `.claude/settings.json`、`.github/workflows/skillgate.yml`、`scripts/pre-push`：Claude Code / CI / 本地 push 三层门禁。
- `scripts/check.mjs` + `npm test`：项目自检；`workspaces/` 不参与基础校验。

## 使用缓存区

项目 `.claude/skills` / `.claude/flows` 会优先加载缓存区里的版本，直接在本仓库走流程即可：

```
/flow-runner doc-first
```

如果需要把缓存区内容叠加到全局 agent 目录（先装基础版本，再用缓存区同名内容覆盖）：

```bash
./install.sh --workspace selfhost --agents claude,codex --yes
```

不带 `--workspace` 重新安装即可回到纯净的基础配置。缓存区不随仓库分发；新机器需要重新创建并放回自定义版本：

```bash
./scripts/workspace.sh new selfhost
```
