# 阶段 3：归档（archive）

前置：`docs/specs/current/40-verify.md` 的 `status` 为 `pass`。

## 规则

1. 文档从 plan 阶段起就在 `docs/specs/<feature>/`，本阶段只做收尾，不移动。
2. 确认 `docs/specs/current` 指向本 feature。
3. 在本 feature 的 `00-*.md` 主文档（lite 为 `00-plan.md`）frontmatter 增加 `archived: YYYY-MM-DD`，不改正文结论。
4. 更新 `docs/specs/INDEX.md`，只追加本 feature 一行。
5. 不自动提交；给出建议命令。

## 清理

归档前清理本 feature 的临时/冗余文件，避免提交后的文档长期堆积。

- 必须保留：`00-plan.md`、`40-verify.md`、`docs/specs/INDEX.md`、被 README/AGENTS.md/docs/ 引用的文档。
- 可以清理：`.tmp/` 下的设计草稿和验证脚本、当前 feature 目录下未被引用的重复草稿/旧版本、编辑器备份（`*~`、`*.swp`、`.DS_Store`）、空文件、构建或导出中间文件。
- 历史 feature 按项目 `retention.archive` 策略处理（默认保留最近 20 个以及 180 天内的记录（取并集），至少保留 5 个，mode: ask）；只处理 tracked 且工作区干净的目录；INDEX.md 缺失时拒绝删除；非 `auto` 模式删除前列清单并确认，INDEX 行改为 `purged` 并保留摘要。用途不明确或无法确认是否必要的文件先保留。
- 永不清理 `current` 指向的 feature、未归档 feature，以及被 README/AGENTS/docs 引用的 feature。
- 非 `auto` 模式下，删除 tracked 文件前先列出路径和原因并等用户确认；未确认时保留，不阻塞归档。untracked 的临时文件可直接删除。
- 清理后重新运行 `skillgate check`；若因删除导致门禁失败，恢复被删文件并报告，不得绕过门禁。
- 不得以清理为由删除流程产物或改写归档结论。清理结果写入归档完成输出。

## INDEX 行格式

```markdown
| <feature> | archived | YYYY-MM-DD | pass | 一句话摘要 |
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase archive
npx --yes @reneza/skillgate@0.16.0 check
```

全部通过后 `git push` 才会放行。

如果本次改动影响了 README、AGENTS.md 或 docs/ 的职责边界、命令、目录，归档后调用 `docs-steward update` 同步。
