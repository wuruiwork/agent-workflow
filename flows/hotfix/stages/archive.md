# 阶段 5：归档（archive）

前置：`docs/specs/current/40-verify.md` 的 `status` 为 `pass`。

## 规则

1. 文档从 reproduce 阶段起就在 `docs/specs/<feature>/`，本阶段只做收尾，不移动。
2. 确认 `docs/specs/current` 指向本 feature。
3. 只加 `archived: YYYY-MM-DD`，不改正文结论。
4. 更新 `docs/specs/INDEX.md`，只追加本 feature 一行。
5. 不自动提交；给出建议命令。

## 完成

```bash
ln -sfn <feature> docs/specs/current
npx --yes @reneza/skillgate@0.16.0 phase archive
npx --yes @reneza/skillgate@0.16.0 check
```

全部通过后 `git push` 才会放行。

如果本次修复影响了 README、AGENTS.md 或 docs/ 中的命令、接口或目录，归档后调用 `docs-steward update` 同步。
