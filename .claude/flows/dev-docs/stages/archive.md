# 阶段 6：归档（archive）

前置：`40-doc.pdf` 存在，且 review 已通过。

## 规则

1. 文档从 brief 阶段起就在 `docs/deliverables/<feature>/`，本阶段只做收尾。
2. 确认 `docs/deliverables/current` 指向本 feature。
3. 只加 `archived: YYYY-MM-DD`，不改正文结论。
4. 更新 `docs/deliverables/INDEX.md`，登记 feature、日期、格式、摘要。
5. 不自动提交；给出建议命令。

## INDEX 行格式

```markdown
| <feature> | archived | YYYY-MM-DD | docx+pdf | 一句话摘要 |
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase archive
npx --yes @reneza/skillgate@0.16.0 check
```
