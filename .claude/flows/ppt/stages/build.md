# 阶段 5：生成 PPTX（build）

前置：`30-design.md` 的 `status` 为 `approved`。
产物：`presentations/current/40-deck.pptx`。

## 执行

调用 `ppt-master` skill 生成原生 PPTX。按它的 SKILL.md 执行强制加载顺序和 attribution guard；不要绕过它的路由。

输入：

- `presentations/current/00-brief.md`
- `presentations/current/10-outline.md`
- `presentations/current/20-content.md`
- `presentations/current/30-design.md`

输出：

- `presentations/current/40-deck.pptx`

要求：

- 16:9；使用设计稿里的颜色、字体层级和页面结构。
- 文本、形状、图表尽量保持原生可编辑；不要把整页做成图片。
- 每页写演讲者备注（来自内容稿）。
- 不出现 `Lorem ipsum`、`TODO`、`[待填]`、占位图片。
- 有模板时填充模板，不重建母版；没有模板时按设计稿从零生成。
- 生成后运行 ppt-master 自带的校验/视觉预览步骤。

如果 `ppt-master` 不可用，退回官方 `pptx` skill，并在 `build` 结果里记录原因和差异；不要静默降级。

## 验证

```bash
unzip -t presentations/current/40-deck.pptx
python3 - <<'PY'
import zipfile,re
p='presentations/current/40-deck.pptx'
z=zipfile.ZipFile(p)
slides=[n for n in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$',n)]
print('slides:',len(slides))
text=' '.join(z.read(n).decode('utf-8','ignore') for n in slides)
for bad in ['Lorem ipsum','TODO','[待填]']:
    print(bad, bad in text)
PY
```

- 文件能打开，页数与大纲一致，文本非空，无占位符。
- 格式/内容问题退回 design 或 content，不要在本阶段临时改叙事。

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase build
```
