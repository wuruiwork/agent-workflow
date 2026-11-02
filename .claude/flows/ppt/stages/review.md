# 阶段 6：视觉评审（review）

前置：`40-deck.pptx` 存在。
产物：`presentations/current/50-review.md`，状态 `pass`。

## 渲染

```bash
soffice --headless --convert-to pdf \
  --outdir presentations/current \
  presentations/current/40-deck.pptx
mkdir -p presentations/current/render
pdftoppm -png -r 110 \
  presentations/current/40-deck.pdf \
  presentations/current/render/slide
```

逐页查看 `presentations/current/render/slide-*.png`，再检查 PDF 全文。

## 检查项

1. **版式**：文字溢出、越界、遮挡、对齐、留白。
2. **可读性**：字号、对比度、色盲安全、深色/浅色投影。
3. **内容**：标题是否结论句、每页一个信息点、数据有来源。
4. **图表**：标签、单位、图例、数据标签是否可读；是否原生可编辑。
5. **占位符**：`Lorem ipsum`、`TODO`、`[待填]`、空图片框。
6. **字体**：是否发生替换；中文/西文是否一致。
7. **备注**：每页是否有演讲者备注。
8. **页数/时长**：与 brief 是否匹配。

## 规则

- 只评审，不改 PPTX；问题写清单，退回 build 或 design。
- 任一必检项失败 → `status: fail`。
- 通过后写 `pass`，并记录渲染命令和页数。

## 模板

```markdown
---
feature: <feature>
status: fail  # fail | pass
created: YYYY-MM-DD
reviewed_at: YYYY-MM-DD
slides: <n>
---

# <演示标题> 视觉评审

## 1. 渲染
- 命令：
- PDF：
- 图片目录：

## 2. 逐页检查

| 页 | 问题 | 严重度 | 处理 |
|---|---|---|---|
| 3 | 标题溢出 | P1 | 退回 build |

## 3. 结论
pass / fail

## 4. 残留风险
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase review
```
