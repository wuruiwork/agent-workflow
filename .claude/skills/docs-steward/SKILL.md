---
name: docs-steward
description: >
  仓库文档治理调度器。只负责判定文档该写到哪、何时更新、更新后如何校验：
  README.md（人类入口）、AGENTS.md（agent 专用、不可从代码推断的信息）、docs/（长文与索引）、CLAUDE.md（桥接）。
  具体写作委托给 repository-docs skill；本 skill 不写代码、不跑测试、不提交、不替代各文档的写作规范。
  当用户要求“整理文档”“AGENTS.md 该写什么”“README 和 docs 怎么分工”“文档同步/审计”时使用。
  只改一个文件、或纯代码任务时不要使用。
---
# 文档治理调度器（docs-steward）

## 职责边界

**只负责：**
- 判定 README.md、AGENTS.md、docs/、CLAUDE.md、skills 各自的职责边界。
- 选择模式：`audit` / `init` / `update` / `verify`。
- 盘点现有文档，找出职责重叠、复制、失效链接、缺失索引。
- 决定“哪个事实应该由哪个文件拥有”，然后委托 `repository-docs` 执行写作。
- 校验：调用 skillgate 的 `instruction-sync` / `instruction-refs`，以及项目已有的链接检查。

**不负责：**
- 不写 README、AGENTS.md、docs/ 的正文；写作交给 `repository-docs`。
- 不写代码、不跑功能测试、不提交、不推送。
- 不评价产品需求或架构决策。
- 不创建大量新文档；优先合并到现有 canonical owner。
- 不把项目事实写进 skills；skills 只放可复用流程。

## 输入

- 当前仓库根目录。
- 模式（未指定时先 `audit`）。
- 可选：目标文件或目录。
- 可选：本次改动摘要（`update` 模式用）。

## 文档职责矩阵

| 文件/目录 | 应该写 | 不应该写 |
|---|---|---|
| `README.md` | 这是什么、给谁用、快速开始、最小可用示例、限制、文档入口 | 完整 API 表、架构长文、agent 专用命令 |
| `AGENTS.md` | agent 无法从 README/代码/配置推断的命令、约束、invariant、目录职责、验证方式、坑 | README 的复制、营销文案、完整架构文档 |
| `docs/` | 架构、开发、测试、ADR、运行手册、功能长文 | 临时笔记、会话状态、重复的 README 内容 |
| `docs/README.md` | 文档索引：每篇文档一句话说明 + 何时读 | 正文内容 |
| `CLAUDE.md` | Claude 特有的桥接/覆盖，优先 `@AGENTS.md` | 和 AGENTS.md 重复的全量规则 |
| `skills/` | 可复用流程、操作手册、检查清单 | 项目背景、一次性任务说明 |

**核心规则：一个事实只有一个 canonical owner，其他地方用链接，不复制。**

## 模式

### 1. audit（默认）

1. 盘点：`README.md`、根/嵌套 `AGENTS.md`、`CLAUDE.md`、`docs/`、`CONTRIBUTING.md`、`RELEASE.md`、`.github/`、`skills/`。
2. 按职责矩阵检查：
   - README 是否混入 agent 命令或架构长文；
   - AGENTS.md 是否复制 README/架构文档；
   - docs/ 是否有索引、是否有重复主题；
   - CLAUDE.md 是否复制 AGENTS.md，而不是 `@AGENTS.md` 桥接；
   - 指令文件里的路径、命令、链接是否存在。
3. 输出问题清单：位置、问题、建议归属、是否阻塞。
4. 不修改文件；用户确认后再进入 `update` 或 `init`。

### 2. init

1. 先确认项目已有约定；没有时再用以下骨架：

   ```
   README.md
   AGENTS.md
   CONTRIBUTING.md
   RELEASE.md
   docs/
     README.md
     architecture.md
     development.md
     testing.md
     conventions.md
     features/
   ```

2. 读取 `~/.claude/skills/repository-docs/SKILL.md`，按其流程写作。
3. README 用 `repository-docs/templates/README.md` 起稿；AGENTS.md 遵守“可发现性过滤”。
4. 只创建缺失文件；已有文件先审计再增量改，不整篇覆盖。

### 3. update

1. 确认本次改动影响了哪些事实：命令、接口、架构、目录、依赖、发布流程。
2. 按职责矩阵找到 canonical owner。
3. 调用 `repository-docs` 更新；其他位置只改链接或一句话摘要。
4. 不把同一段内容复制到 README、AGENTS.md、docs/ 三处。

### 4. verify

1. 运行：

   ```bash
   npx --yes @reneza/skillgate@0.16.0 check
   ```

   重点看 `instruction-sync` 和 `instruction-refs`；如果项目里配了链接检查（如 lychee），一并运行。

2. 检查：
   - 指令文件之间是否一致；
   - 指令文件引用的路径/命令是否存在；
   - README 的 quickstart 是否仍可执行；
   - docs/ 索引是否覆盖所有文档。
3. 输出：通过项、失败项、未验证项、残留风险。

## 与 repository-docs 的分工

- `docs-steward` 决定“写到哪里、谁来拥有、何时更新”。
- `repository-docs` 提供 README 读者旅程、AGENTS.md 可发现性过滤、链接校验等写作规范。
- 写作前读取：
  - `~/.claude/skills/repository-docs/references/readme.md`
  - `~/.claude/skills/repository-docs/references/agents.md`
- 不要在本 skill 里复述这些规范。

## 强制规则

1. 先盘点再修改；没有用户确认不整篇重写。
2. README 面向人类，不放 agent 专用命令。
3. AGENTS.md 只放 agent 不可推断且影响执行的信息。
4. docs/ 放长文；多个文档时必须有 `docs/README.md` 索引。
5. CLAUDE.md 优先 `@AGENTS.md` 桥接，不复制全量规则。
6. 命令、路径、版本必须来自仓库实际配置；不猜、不编。
7. 保留现有锚点、语气和公开链接；迁移锚点要说明。
8. 不写密钥、凭证、会话状态。
9. 不自动提交；给出建议命令，由用户决定。
10. 文档改动不修改代码；需要代码验证时交给对应 skill 或用户。

## 与流程的衔接

- doc-first 归档后，可调用 `docs-steward update` 同步 README/AGENTS/docs。
- lite/hotfix 不强制文档更新；影响命令、接口或目录时再调用。
- 硬校验由 skillgate 策略里的 `instruction-sync` / `instruction-refs` 负责；docs-steward 只负责修复和解释。

## 完成输出

- 模式与范围。
- 盘点结果或修改文件列表。
- canonical owner 的变更。
- `instruction-sync` / `instruction-refs` 结果。
- 未验证项与残留风险。
- 建议的提交命令。
