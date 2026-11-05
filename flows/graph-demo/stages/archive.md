# 阶段 6：归档（archive）

前置：`verify` 的 `status` 为 `pass`。本阶段做收尾，产物是归档目录
`docs/specs/<feature>/`；状态为 `done` 后流程结束。

## 只负责

- 给本 feature 的主文档增加 `archived: YYYY-MM-DD`。
- 更新 `docs/specs/INDEX.md`。
- 确认 `docs/specs/current` 指向本 feature。
- 把 `flow-trace.json` 纳入本次提交（由 runner 通过 `SCOPE` 传入）。

## 不负责

- 不改代码、不重新验证、不改文档正文结论。
- 不跑 git、不写 `.skillgate/flow-state.json` 或 `flow-trace.json`。

## 清理

归档前清理本 feature 的临时/冗余文件：

- 必须保留：`00-brief.md`、`10-design.md`、`15-research.md`、`20-tasks.md`、`30-impl.md`、`35-review.md`、`36-fix.md`（存在时）、`40-verify.md`、`flow-trace.json`、`docs/specs/INDEX.md`。
- 可以清理：`.tmp/` 下的草稿和验证脚本、重复草稿/旧版本、编辑器备份、空文件、构建或导出中间文件。
- 历史 feature 按项目 `retention.archive` 策略处理（默认保留最近 20 个以及 180 天内的记录，至少保留 5 个；mode: ask 时删除前询问）。
- 只处理 tracked 且工作区干净的目录；INDEX.md 缺失时拒绝删除；不得删除 `current` 指向的 feature 或被 README/AGENTS/docs 引用的文件。
- 清理后重新运行 `skillgate check`；失败时恢复被删文件并报告，不得绕过门禁。

## 完成

runner 调用 `flow-state complete --stage archive --outcome pass`，返回
`finished: true` 后执行 `skillgate check` 和 `finish` 钩子。
