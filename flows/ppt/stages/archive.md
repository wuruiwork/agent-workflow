# 阶段 8：归档（archive）

前置：`40-deck.pptx` 和 `60-deck.pdf` 均存在，review 已通过。

## 规则

1. 演示文件从 brief 阶段起就在 `presentations/<feature>/`，本阶段只做收尾。
2. 确认 `presentations/current` 指向本 feature。
3. 只加 `archived: YYYY-MM-DD`，不改正文结论。
4. 更新 `presentations/INDEX.md`，登记标题、日期、页数、PPTX/PDF 路径、摘要。
5. 不自动提交；给出建议命令。

## INDEX 行格式

```markdown
| <feature> | archived | YYYY-MM-DD | <页数> | pptx+pdf | 一句话摘要 |
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase archive
npx --yes @reneza/skillgate@0.16.0 check
```
