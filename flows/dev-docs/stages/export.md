# 阶段 5：导出 PDF（export）

前置：`docs/deliverables/current/30-doc.docx` 存在。
产物：`docs/deliverables/current/40-doc.pdf`。

## 执行

```bash
soffice --headless --convert-to pdf \
  --outdir docs/deliverables/current \
  docs/deliverables/current/30-doc.docx
mv docs/deliverables/current/30-doc.pdf \
   docs/deliverables/current/40-doc.pdf
```

## 验证

```bash
pdfinfo docs/deliverables/current/40-doc.pdf | grep -E 'Pages|Page size'
pdftotext docs/deliverables/current/40-doc.pdf - | head -40
```

- PDF 页数 >0，能提取到正文。
- 抽查封面、目录、代码块、表格没有明显错位。
- 如果 PDF 与 Word 不一致，先修 Word 源文件，再重新导出；不要把 PDF 当源文件改。

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase export
```
