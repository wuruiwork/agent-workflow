#!/usr/bin/env node
// 计算并执行归档保留策略：找出符合 retention.archive 的旧 feature。
// 默认只报告候选；--delete 且 mode=auto 或显式 --yes 时才删除。
//
// 用法：
//   node scripts/archive-retention.mjs --project <dir> --flow <flow>
//   node scripts/archive-retention.mjs --project <dir> --flow lite --delete --yes
//   node scripts/archive-retention.mjs --project <dir> --flow lite --now 2026-01-01 --json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('../editor/vendor/js-yaml.umd.min.cjs');

export const DEFAULTS = {
  keep_latest: 20,
  keep_days: 180,
  min_keep: 5,
  mode: 'ask',
};

const MODES = new Set(['ask', 'report', 'auto']);
const DAY_MS = 24 * 60 * 60 * 1000;

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateOrdinal(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return Math.floor(date.getTime() / DAY_MS);
}

function readYamlFile(file) {
  if (!fs.existsSync(file)) return null;
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

export function readProfile(project) {
  const base = readYamlFile(path.join(project, '.claude', 'flows', 'profile.yaml'));
  const local = readYamlFile(path.join(project, '.claude', 'flows', 'profile.local.yaml'));
  const baseArchive = base?.retention?.archive || {};
  const localArchive = local?.retention?.archive || {};
  return { ...DEFAULTS, ...baseArchive, ...localArchive };
}

function flowCandidates(project, flow) {
  const dirs = [
    path.join(project, '.claude', 'flows', flow),
    process.env.CLAUDE_CONFIG_DIR
      ? path.join(process.env.CLAUDE_CONFIG_DIR, 'flows', flow)
      : path.join(os.homedir(), '.claude', 'flows', flow),
    process.env.CODEX_HOME
      ? path.join(process.env.CODEX_HOME, 'flows', flow)
      : path.join(os.homedir(), '.codex', 'flows', flow),
  ];
  return dirs;
}

export function loadFlow(project, flow) {
  for (const dir of flowCandidates(project, flow)) {
    const file = path.join(dir, 'flow.yaml');
    const doc = readYamlFile(file);
    if (doc) {
      if (!doc.archive) throw new Error(`flow.yaml 缺少 archive: ${file}`);
      return { flow: doc, file, archive: String(doc.archive).replace(/[\\/]+$/, '') };
    }
  }
  throw new Error(`找不到流程 ${flow} 的 flow.yaml（已查找项目 .claude/flows 与全局 flows）`);
}

function normalizeConfig(config = {}) {
  const merged = { ...DEFAULTS, ...config };
  for (const key of ['keep_latest', 'keep_days', 'min_keep']) {
    if (!Number.isInteger(merged[key]) || merged[key] < 0) {
      throw new Error(`retention.archive.${key} 必须是非负整数`);
    }
  }
  if (!MODES.has(merged.mode)) {
    throw new Error('retention.archive.mode 只能是 ask / report / auto');
  }
  return merged;
}

function readArchived(featureDir) {
  const files = fs.readdirSync(featureDir)
    .filter((name) => /^00-.*\.md$/.test(name))
    .sort();
  const candidates = files.length
    ? files
    : fs.readdirSync(featureDir).filter((name) => name.endsWith('.md')).sort();
  for (const name of candidates) {
    const file = path.join(featureDir, name);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) continue;
    const archived = frontmatter[1].match(/^archived:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
    if (archived && dateOrdinal(archived[1]) != null) return archived[1];
  }
  return null;
}

function currentFeature(project, archiveDir) {
  try {
    return path.basename(fs.readlinkSync(path.join(project, archiveDir, 'current')));
  } catch {
    return null;
  }
}

function isTracked(project, relPath) {
  try {
    const out = execFileSync('git', ['-C', project, 'ls-files', '--', relPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function hasLocalChanges(project, relPath) {
  try {
    const out = execFileSync('git', ['-C', project, 'status', '--porcelain=v1', '--', relPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    // 无法确认工作区状态时按有本地改动处理，宁可不删。
    return true;
  }
}

function listMarkdown(dir, skipAbs) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (skipAbs && (abs === skipAbs || abs.startsWith(skipAbs + path.sep))) continue;
    if (entry.isDirectory()) out.push(...listMarkdown(abs, skipAbs));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

function isReferenced(project, feature, archiveDir) {
  const archiveAbs = path.join(project, archiveDir);
  const files = [
    ...['README.md', 'AGENTS.md', 'CLAUDE.md'].map((name) => path.join(project, name)),
    ...listMarkdown(path.join(project, 'docs'), archiveAbs),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    if (path.basename(file) === 'INDEX.md') continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (text.includes(feature)) return true;
  }
  return false;
}

export function selectRetention({ project, archiveDir, config, now = today() }) {
  const cfg = normalizeConfig(config);
  const nowOrdinal = dateOrdinal(now);
  if (nowOrdinal == null) throw new Error(`--now 必须是 YYYY-MM-DD：${now}`);

  const archiveAbs = path.join(project, archiveDir);
  if (!fs.existsSync(archiveAbs)) {
    return { archive: archiveDir, config: cfg, now, kept: [], candidates: [], skipped: [] };
  }

  const current = currentFeature(project, archiveDir);
  const features = [];
  const skipped = [];
  for (const entry of fs.readdirSync(archiveAbs, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'current') continue;
    const rel = path.posix.join(archiveDir, entry.name);
    const abs = path.join(archiveAbs, entry.name);
    const isCurrent = entry.name === current;
    const archived = readArchived(abs);
    if (!archived) {
      skipped.push({ feature: entry.name, reason: 'missing archived' });
      continue;
    }
    if (!isCurrent && !isTracked(project, rel)) {
      skipped.push({ feature: entry.name, reason: 'untracked' });
      continue;
    }
    if (!isCurrent && hasLocalChanges(project, rel)) {
      skipped.push({ feature: entry.name, reason: 'dirty' });
      continue;
    }
    if (!isCurrent && isReferenced(project, entry.name, archiveDir)) {
      skipped.push({ feature: entry.name, reason: 'referenced' });
      continue;
    }
    features.push({ feature: entry.name, archived, ordinal: dateOrdinal(archived), current: isCurrent });
  }

  features.sort((a, b) => b.ordinal - a.ordinal || b.feature.localeCompare(a.feature));
  const kept = [];
  const candidates = [];
  features.forEach((item, index) => {
    if (item.current) {
      kept.push(item);
      return;
    }
    const age = nowOrdinal - item.ordinal;
    const inLatest = index < cfg.keep_latest;
    const withinDays = age <= cfg.keep_days;
    if (inLatest || withinDays) kept.push(item);
    else candidates.push(item);
  });

  // min_keep 是下限：从最新的候选开始补回，保证至少保留 min_keep 个。
  while (kept.length < cfg.min_keep && candidates.length) {
    kept.push(candidates.shift());
  }

  return { archive: archiveDir, config: cfg, now, kept, candidates, skipped };
}

export function updateIndexRow(text, feature, purgeDate) {
  const lines = text.split('\n');
  let changed = false;
  let found = false;
  const next = lines.map((line) => {
    const parts = line.split('|');
    if (parts.length < 3 || parts[1].trim() !== feature) return line;
    found = true;
    if (parts[2].trim() === 'purged') return line;
    parts[2] = ' purged ';
    const last = parts.length - 2;
    const summary = parts[last].trim();
    if (!summary.includes('docs 已于')) {
      parts[last] = ` ${summary}（docs 已于 ${purgeDate} 清理） `;
    }
    changed = true;
    return parts.join('|');
  });
  return { text: next.join('\n'), changed, found };
}

export function applyRetention({ project, result, now = result.now || today(), yes = false }) {
  const allowed = result.config.mode === 'auto' || (result.config.mode === 'ask' && yes);
  if (!allowed) {
    return {
      deleted: [],
      indexUpdated: [],
      skipped: result.candidates.map((c) => c.feature),
      reason: 'confirmation required',
    };
  }
  if (!result.candidates.length) return { deleted: [], indexUpdated: [], skipped: [] };

  const indexFile = path.join(project, result.archive, 'INDEX.md');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`找不到 ${path.relative(project, indexFile)}，拒绝删除候选；请先生成 INDEX.md`);
  }
  let indexText = fs.readFileSync(indexFile, 'utf8');
  const deleted = [];
  const indexUpdated = [];
  const skipped = [];
  for (const item of result.candidates) {
    const abs = path.join(project, result.archive, item.feature);
    if (!fs.existsSync(abs)) continue;
    const updated = updateIndexRow(indexText, item.feature, now);
    if (!updated.found) {
      skipped.push(item.feature);
      continue;
    }
    fs.rmSync(abs, { recursive: true, force: false });
    deleted.push(item.feature);
    if (updated.changed) {
      indexText = updated.text;
      fs.writeFileSync(indexFile, indexText);
      indexUpdated.push(item.feature);
    }
  }
  return { deleted, indexUpdated, skipped };
}

function parseArgs(argv) {
  const out = {
    project: process.cwd(),
    flow: null,
    now: today(),
    json: false,
    delete: false,
    yes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--delete') out.delete = true;
    else if (arg === '--yes' || arg === '-y') out.yes = true;
    else if (arg === '--project') out.project = argv[++i];
    else if (arg === '--flow') out.flow = argv[++i];
    else if (arg === '--now') out.now = argv[++i];
    else if (arg.startsWith('--project=')) out.project = arg.slice(10);
    else if (arg.startsWith('--flow=')) out.flow = arg.slice(7);
    else if (arg.startsWith('--now=')) out.now = arg.slice(6);
    else throw new Error(`未知参数：${arg}`);
  }
  if (!out.project) throw new Error('缺少 --project');
  if (!out.flow) throw new Error('缺少 --flow');
  return out;
}

function help() {
  console.log(`用法: node scripts/archive-retention.mjs --project <dir> --flow <flow> [选项]

  --now <YYYY-MM-DD>  按指定日期计算（默认今天）
  --json              输出 JSON
  --delete            删除候选（mode=auto，或同时传 --yes）
  --yes, -y           确认删除 ask 模式的候选
  --help              显示帮助
`);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    if (args.help) { help(); return; }
    const project = path.resolve(args.project);
    const flow = loadFlow(project, args.flow);
    const config = readProfile(project);
    const result = selectRetention({ project, archiveDir: flow.archive, config, now: args.now });
    let applied = null;
    if (args.delete) {
      applied = applyRetention({ project, result, now: args.now, yes: args.yes });
    }
    if (args.json) {
      console.log(JSON.stringify({ ...result, ...(applied ? { applied } : {}) }, null, 2));
      return;
    }
    console.log(`流程: ${args.flow}`);
    console.log(`归档: ${result.archive}`);
    console.log(`策略: keep_latest=${result.config.keep_latest} keep_days=${result.config.keep_days} min_keep=${result.config.min_keep} mode=${result.config.mode}`);
    console.log(`保留: ${result.kept.length}，候选: ${result.candidates.length}，跳过: ${result.skipped.length}`);
    for (const item of result.candidates) console.log(`- 候选 ${item.feature}（archived ${item.archived}）`);
    for (const item of result.skipped) console.log(`- 跳过 ${item.feature}（${item.reason}）`);
    if (applied) {
      console.log(`已删除: ${applied.deleted.length ? applied.deleted.join(', ') : '无'}（mode=${result.config.mode}）`);
      console.log(`INDEX 已更新: ${applied.indexUpdated.length ? applied.indexUpdated.join(', ') : '无'}`);
      if (applied.skipped?.length) {
        console.log(`未处理: ${applied.skipped.join(', ')}（需要确认或 INDEX 无对应行）`);
      }
    } else if (args.delete === false) {
      console.log('未删除：默认只报告；加 --delete 才会清理（ask 模式还需要 --yes 或 mode=auto）。');
    }
  } catch (error) {
    console.error(`archive-retention: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
