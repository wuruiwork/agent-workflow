# 阶段 6：归档（archive）

前置：`40-doc.pdf` 存在，且 review 已通过。

## 规则

1. 文档从 brief 阶段起就在 `docs/deliverables/<feature>/`，本阶段只做收尾。
2. 确认 `docs/deliverables/current` 指向本 feature。
3. 在本 feature 的 `00-*.md` 主文档（dev-docs 为 `00-brief.md`）frontmatter 增加 `archived: YYYY-MM-DD`，不改正文结论。
4. 更新 `docs/deliverables/INDEX.md`，登记 feature、日期、格式、摘要。
5. 不自动提交；给出建议命令。

## 清理

归档前清理本 feature 的临时/冗余文件，避免交付物目录长期堆积。

- 必须保留：`00-brief.md`、`10-draft.md`、`20-review.md`、`30-doc.docx`、`40-doc.pdf`、`docs/deliverables/INDEX.md`、被 README/AGENTS.md/docs/ 引用的文档。
- 可以清理：`.tmp/` 下的草稿、LibreOffice/转换中间文件、旧版本导出、编辑器备份（`*~`、`*.swp`、`.DS_Store`）、空文件。
- 不得删除最终交付的 docx/pdf。历史 feature 按项目 `retention.archive` 策略处理（默认保留最近 20 个以及 180 天内的记录（取并集），至少保留 5 个，mode: ask）；只处理 tracked 且工作区干净的目录；INDEX.md 缺失时拒绝删除；非 `auto` 模式删除前列清单并确认，INDEX 行改为 `purged` 并保留摘要。
- 永不清理 `current` 指向的 feature、未归档 feature，以及被 README/AGENTS/docs 引用的 feature。
- 非 `auto` 模式下，删除 tracked 文件前先列出路径和原因并等用户确认；未确认时保留，不阻塞归档。untracked 的临时文件可直接删除。
- 清理后重新运行 `skillgate check`；若因删除导致门禁失败，恢复被删文件并报告，不得绕过门禁。
- 清理结果写入归档完成输出。

## INDEX 行格式

```markdown
| <feature> | archived | YYYY-MM-DD | docx+pdf | 一句话摘要 |
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase archive
npx --yes @reneza/skillgate@0.16.0 check
```
