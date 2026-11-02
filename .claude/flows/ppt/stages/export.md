# 阶段 7：导出（export）

前置：`50-review.md` 的 `status` 为 `pass`。
产物：`presentations/current/60-deck.pdf`。

## 执行

```bash
soffice --headless --convert-to pdf \
  --outdir presentations/current \
  presentations/current/40-deck.pptx
mv presentations/current/40-deck.pdf \
   presentations/current/60-deck.pdf
```

如果上一步已经生成 `40-deck.pdf`，核对页数和版本后移动为 `60-deck.pdf`。

## 验证

```bash
pdfinfo presentations/current/60-deck.pdf | grep -E 'Pages|Page size'
pdftotext presentations/current/60-deck.pdf - | head -40
```

- 页数与 `40-deck.pptx` 一致。
- 封面、目录、数据页、结尾页无错位。
- `.pptx` 保留为可编辑最终版；PDF 作为分发版。
- 不改 PPTX 内容；发现问题退回 review/build。

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase export
```
