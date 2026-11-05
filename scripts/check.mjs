// 本仓库自检：JS 语法、YAML 可解析、流程引用的阶段文档和 skill 存在。
// 由 `npm test` 调用；doc-first / lite / hotfix 的 tests-pass 门禁也执行它。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { validateGraph } from '../skills/flow-runner/scripts/flow-graph.mjs';

const require = createRequire(import.meta.url);
const yaml = require('../editor/vendor/js-yaml.umd.min.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['.git', 'node_modules']);
const rel = (file) => path.relative(root, file);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(root);
const errors = [];

// 1. JS 语法检查（vendor 是第三方压缩代码，跳过）。
const jsFiles = files.filter(
  (file) => /\.(mjs|js)$/.test(file) && !file.startsWith(path.join(root, 'editor', 'vendor') + path.sep),
);
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${rel(file)}: 语法错误\n${error.stderr}`);
  }
}

// 2. JSON 解析（package.json、.claude/settings.json 等）。
const jsonFiles = files.filter((file) => /\.json$/.test(file));
for (const file of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${rel(file)}: JSON 解析失败：${error.message}`);
  }
}

// 3. YAML 解析。
const yamlFiles = files.filter((file) => /\.ya?ml$/.test(file));
const docs = new Map();
for (const file of yamlFiles) {
  try {
    docs.set(file, yaml.load(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    errors.push(`${rel(file)}: YAML 解析失败：${error.message}`);
  }
}

// 4. 流程定义完整性：阶段文档存在、skill 存在、hook 已声明。
let flowCount = 0;
for (const [file, doc] of docs) {
  if (path.basename(file) !== 'flow.yaml' || !doc) continue;
  flowCount += 1;
  const dir = path.dirname(file);
  const flow = rel(dir);

  if (!doc.name) errors.push(`${flow}/flow.yaml: 缺少 name`);
  if (!Array.isArray(doc.stages) || doc.stages.length === 0) {
    errors.push(`${flow}/flow.yaml: stages 为空`);
    continue;
  }

  const checkpoints = new Set(doc.checkpoints || []);
  for (const stage of doc.stages) {
    const label = `${flow}:${stage.id || '(未命名阶段)'}`;
    if (!stage.id) errors.push(`${flow}/flow.yaml: 存在没有 id 的阶段`);

    if (stage.type === 'doc') {
      if (!stage.ref) errors.push(`${label}: type=doc 缺少 ref`);
      else if (!fs.existsSync(path.join(dir, stage.ref))) {
        errors.push(`${label}: 找不到阶段文档 ${stage.ref}`);
      }
    } else if (stage.type === 'skill') {
      if (!stage.ref) errors.push(`${label}: type=skill 缺少 ref`);
      else if (!fs.existsSync(path.join(root, 'skills', stage.ref, 'SKILL.md'))) {
        errors.push(`${label}: 找不到 skills/${stage.ref}/SKILL.md`);
      }
    } else {
      errors.push(`${label}: 未知 type ${stage.type}`);
    }

    for (const hook of stage.hooks || []) {
      if (!checkpoints.has(hook)) {
        errors.push(`${label}: hook ${hook} 未在 checkpoints 声明`);
      }
      if (hook === 'task_end' && stage.type !== 'skill') {
        errors.push(`${label}: task_end 只能用在 type=skill 阶段`);
      }
    }
  }

  if (Number(doc.version) >= 3) {
    for (const error of validateGraph(doc).errors) {
      errors.push(`${flow}/flow.yaml: ${error}`);
    }
  }
}

// 5. profile 动作约束：task_end 只允许 commit。
for (const [file, doc] of docs) {
  if (path.basename(file) !== 'profile.yaml' || !doc) continue;
  for (const [stage, binding] of Object.entries(doc.bindings || {})) {
    const actions = binding?.task_end;
    if (!actions) continue;
    const list = Array.isArray(actions) ? actions : [actions];
    const invalid = list.filter((action) => action !== 'commit');
    if (invalid.length) {
      errors.push(`${rel(file)}: ${stage}.task_end 只允许 commit，发现 ${invalid.join(', ')}`);
    }
  }
}

// 6. retention 配置校验（profile.yaml）。
for (const [file, doc] of docs) {
  if (path.basename(file) !== 'profile.yaml' || !doc) continue;
  const retention = doc.retention?.archive;
  if (!retention) continue;
  for (const key of ['keep_latest', 'keep_days', 'min_keep']) {
    if (retention[key] !== undefined && (!Number.isInteger(retention[key]) || retention[key] < 0)) {
      errors.push(`${rel(file)}: retention.archive.${key} 必须是非负整数`);
    }
  }
  if (retention.mode !== undefined && !['ask', 'report', 'auto'].includes(retention.mode)) {
    errors.push(`${rel(file)}: retention.archive.mode 只能是 ask / report / auto`);
  }
}

// 7. 流程/skill/阶段文档契约。
for (const [file, doc] of docs) {
  if (path.basename(file) !== 'flow.yaml' || !doc) continue;
  const dir = path.dirname(file);
  const flow = rel(dir);
  if (doc.name === 'lite') {
    const plan = (doc.stages || []).find((stage) => stage.id === 'plan');
    if (!plan?.approval) errors.push(`${flow}: lite plan 阶段必须 approval: true`);
  }
  for (const stage of doc.stages || []) {
    if (stage.type === 'skill' && stage.approval === true && stage.ref) {
      const skillFile = path.join(root, 'skills', stage.ref, 'SKILL.md');
      const text = fs.existsSync(skillFile) ? fs.readFileSync(skillFile, 'utf8') : '';
      if (!text.includes('PLAN_ROUND=design') || !text.includes('PLAN_ROUND=implement')) {
        errors.push(`${flow}:${stage.id}: approval skill 需要支持 PLAN_ROUND=design / implement`);
      }
    }
    if (stage.type === 'doc' && stage.id === 'archive' && stage.ref) {
      const stageFile = path.join(dir, stage.ref);
      const text = fs.existsSync(stageFile) ? fs.readFileSync(stageFile, 'utf8') : '';
      if (!text.includes('## 清理')) errors.push(`${rel(stageFile)}: 归档阶段缺少「## 清理」`);
      if (!text.includes('retention.archive')) errors.push(`${rel(stageFile)}: 归档阶段缺少 retention.archive 说明`);
    }
    if (stage.type === 'doc' && stage.id === 'verify' && stage.ref) {
      const stageFile = path.join(dir, stage.ref);
      const text = fs.existsSync(stageFile) ? fs.readFileSync(stageFile, 'utf8') : '';
      if (!text.includes('真实运行')) errors.push(`${rel(stageFile)}: 验证阶段缺少真实运行要求`);
    }
  }
}

const dfVerifyFile = path.join(root, 'skills', 'df-verify', 'SKILL.md');
const dfVerifyText = fs.existsSync(dfVerifyFile) ? fs.readFileSync(dfVerifyFile, 'utf8') : '';
if (!dfVerifyText.includes('行为变更必须真实运行')) {
  errors.push('skills/df-verify/SKILL.md: 缺少行为变更真实运行要求');
}

if (errors.length) {
  console.error(`自检失败（${errors.length} 项）：`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `自检通过：${jsFiles.length} 个 JS、${jsonFiles.length} 个 JSON、${yamlFiles.length} 个 YAML、${flowCount} 个流程`,
);
