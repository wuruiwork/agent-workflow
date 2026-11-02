# 阶段 7：归档（archive）

前置：

- `docs/specs/current/40-verify.md` 的 `status` 为 `pass`。
- 完整流程中 `35-review.md` 的 `status` 为 `pass`。

## 只负责

- 文档从 brief 阶段起就已经在 `docs/specs/<feature>/`，`docs/specs/current` 指向它；本阶段做收尾，不做移动。
- 给文档 frontmatter 增加 `archived: YYYY-MM-DD`。
- 更新 `docs/specs/INDEX.md`。
- 确认 `docs/specs/current` 指向本 feature。

## 不负责

- 不改代码、不重新验证、不修改文档正文结论。
- 不提交、不推送、不创建 MR。
- 不归档未通过验证或审查的文档。
- 不修改 `.skillgate/phase`。

## 规则

1. 只允许修改 frontmatter：在本 feature 的 `00-*.md` 主文档（doc-first 为 `00-brief.md`）增加 `archived: YYYY-MM-DD`，保持原 `status` 不变。
2. `INDEX.md` 只追加或更新本 feature 一行；没有该文件时创建。
3. 不改文档正文结论。
4. 不自动 git 提交；给出建议命令，由用户决定。
5. 归档后文档是历史记录；后续变更新建 feature，不直接改归档文档。
6. `docs/specs/current` 只指向一个 feature；归档后保持指向它，直到新 feature 启动。

## 清理

归档前清理本 feature 的临时/冗余文件，避免提交后的文档长期堆积。

- 必须保留：`00-brief.md`、`10-design.md`（存在时）、`20-tasks.md`、`30-impl.md`、`35-review.md`、`40-verify.md`、`docs/specs/INDEX.md`、被 README/AGENTS.md/docs/ 引用的文档。
- 可以清理：`.tmp/` 下的草稿和验证脚本、当前 feature 目录下未被引用的重复草稿/旧版本、编辑器备份（`*~`、`*.swp`、`.DS_Store`）、空文件、构建或导出中间文件。
- 历史 feature 按项目 `retention.archive` 策略处理（默认保留最近 20 个以及 180 天内的记录（取并集），至少保留 5 个，mode: ask）；只处理 tracked 且工作区干净的目录；INDEX.md 缺失时拒绝删除；非 `auto` 模式删除前列清单并确认，INDEX 行改为 `purged` 并保留摘要。用途不明确或无法确认是否必要的文件先保留。
- 永不清理 `current` 指向的 feature、未归档 feature，以及被 README/AGENTS/docs 引用的 feature。
- 非 `auto` 模式下，删除 tracked 文件前先列出路径和原因并等用户确认；未确认时保留，不阻塞归档。untracked 的临时文件可直接删除。
- 清理后重新运行 `skillgate check`；若因删除导致门禁失败，恢复被删文件并报告，不得绕过门禁。
- 不得以清理为由删除流程产物、验证报告或改写归档结论。清理结果写入归档完成输出。

## 目录

```
docs/specs/<feature>/
  00-brief.md
  10-design.md   # inline 时不存在
  20-tasks.md
  30-impl.md
  35-review.md
  40-verify.md
docs/specs/current -> <feature>
docs/specs/INDEX.md
```

`INDEX.md` 行格式：

```markdown
| Feature | 状态 | 归档日期 | 验证结论 | 摘要 |
|---|---|---|---|---|
| <feature> | archived | YYYY-MM-DD | pass | 一句话摘要 |
```

## 完成

runner 执行：

```bash
ln -sfn <feature> docs/specs/current
npx --yes @reneza/skillgate@0.16.0 phase archive
npx --yes @reneza/skillgate@0.16.0 check
```

全部通过后，`git push` 才会被放行。

如果本次改动影响了 README、AGENTS.md 或 docs/ 的职责边界、命令、目录，归档后调用 `docs-steward update` 同步。
