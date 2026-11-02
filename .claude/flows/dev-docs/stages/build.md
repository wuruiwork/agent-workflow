# 阶段 4：生成 Word（build）

前置：`20-review.md` 的 `status` 为 `pass`。
产物：`docs/deliverables/current/30-doc.docx`。

## 执行

调用官方 `docx` skill，把 `docs/deliverables/current/10-draft.md` 转成 Word。

要求：

- 使用真实标题样式（Heading 1/2/3），不要手工加粗模拟标题。
- 代码块用等宽字体和底纹；表格保留表头。
- 超过 5 页时生成目录和页码。
- 中文字体统一（正文宋体/思源宋体，代码等宽），不要混用默认西文字体。
- 不添加草稿里没有的内容；不删除“限制/非目标”。
- 封面包含标题、版本、日期、作者；不写未确认的版本号。
- 输出路径固定为 `docs/deliverables/current/30-doc.docx`。

## 验证

```bash
unzip -t docs/deliverables/current/30-doc.docx
python3 - <<'PY'
import zipfile,re
p='docs/deliverables/current/30-doc.docx'
x=zipfile.ZipFile(p).read('word/document.xml').decode('utf-8','ignore')
print('headings:', len(re.findall(r'<w:pStyle w:val="Heading',x)))
print('chars:', len(re.sub(r'<[^>]+>','',x)))
PY
```

- 文件必须能打开，标题数 >0，正文非空。
- 如果格式问题来自草稿内容，退回 draft，不要在本阶段改正文。

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase build
```
