# 阶段 3：归档（archive）

前置：`docs/specs/current/40-verify.md` 的 `status` 为 `pass`。

## 规则

1. 文档从 plan 阶段起就在 `docs/specs/<feature>/`，本阶段只做收尾，不移动。
2. 确认 `docs/specs/current` 指向本 feature。
3. 只加 `archived: YYYY-MM-DD`，不改正文结论。
4. 更新 `docs/specs/INDEX.md`，只追加本 feature 一行。
5. 不自动提交；给出建议命令。

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
