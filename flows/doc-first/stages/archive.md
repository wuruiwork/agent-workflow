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

1. 只允许修改 frontmatter：增加 `archived: YYYY-MM-DD`，保持原 `status` 不变。
2. `INDEX.md` 只追加或更新本 feature 一行；没有该文件时创建。
3. 不改文档正文结论。
4. 不自动 git 提交；给出建议命令，由用户决定。
5. 归档后文档是历史记录；后续变更新建 feature，不直接改归档文档。
6. `docs/specs/current` 只指向一个 feature；归档后保持指向它，直到新 feature 启动。

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
