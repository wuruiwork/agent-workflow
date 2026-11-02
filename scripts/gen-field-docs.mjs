// 由 editor/fields.mjs 生成 docs/editor-fields.md。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELD_GROUPS } from '../editor/fields.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let md = '# 流程编辑器字段说明\n\n';
md += '> 本文件由 `editor/fields.mjs` 生成；修改说明后运行 `node scripts/gen-field-docs.mjs`。\n';
md += '> 编辑器里鼠标移到字段标题上也会显示同样的说明。\n\n';

for (const group of FIELD_GROUPS) {
  md += `## ${group.title}\n\n`;
  for (const field of group.fields) {
    md += `### ${field.label}\n\n${field.tip}\n\n`;
  }
}

const out = path.join(root, 'docs', 'editor-fields.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(`written ${path.relative(root, out)}`);
