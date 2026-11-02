import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  selectRetention,
  applyRetention,
  readProfile,
  loadFlow,
  updateIndexRow,
} from './archive-retention.mjs';

const require = createRequire(import.meta.url);
const yaml = require('../editor/vendor/js-yaml.umd.min.cjs');
const scriptPath = fileURLToPath(new URL('./archive-retention.mjs', import.meta.url));
const BASE_CONFIG = { keep_latest: 20, keep_days: 180, min_keep: 5, mode: 'ask' };

function writeFeature(specDir, name, archived) {
  const dir = path.join(specDir, name);
  fs.mkdirSync(dir, { recursive: true });
  const archivedLine = archived ? `archived: ${archived}\n` : '';
  fs.writeFileSync(
    path.join(dir, '00-plan.md'),
    `---\nfeature: ${name}\nstatus: implemented\n${archivedLine}---\n\n# ${name}\n`,
  );
}

function makeRepo({ features = [], config = BASE_CONFIG, current = null, references = {}, index = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-retention-'));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);

  const flowDir = path.join(root, '.claude', 'flows', 'lite');
  fs.mkdirSync(flowDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, 'flow.yaml'), 'name: lite\narchive: docs/specs\n');
  fs.writeFileSync(
    path.join(root, '.claude', 'flows', 'profile.yaml'),
    yaml.dump({ retention: { archive: config } }),
  );

  const specDir = path.join(root, 'docs', 'specs');
  fs.mkdirSync(specDir, { recursive: true });
  const rows = [];
  for (const item of features) {
    writeFeature(specDir, item.name, item.archived);
    rows.push(`| ${item.name} | ${item.archived ? 'archived' : 'draft'} | ${item.archived || '-'} | pass | summary |`);
  }
  if (current) fs.symlinkSync(current, path.join(specDir, 'current'));
  if (index) {
    fs.writeFileSync(
      path.join(specDir, 'INDEX.md'),
      `# INDEX\n\n| Feature | 状态 | 归档日期 | 验证结论 | 摘要 |\n|---|---|---|---|---|\n${rows.join('\n')}\n`,
    );
  }
  for (const [file, content] of Object.entries(references)) {
    const abs = path.join(root, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'init']);
  return root;
}

function cleanup(t, root) {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
}

test('保留最近 N 个和最近 N 天，返回更老的候选', (t) => {
  const root = makeRepo({
    features: [
      { name: '2024-01-01-old', archived: '2024-01-01' },
      { name: '2024-06-01-mid', archived: '2024-06-01' },
      { name: '2024-12-01-new', archived: '2024-12-01' },
      { name: '2025-01-01-latest', archived: '2025-01-01' },
    ],
    config: { keep_latest: 2, keep_days: 90, min_keep: 1, mode: 'report' },
    current: '2025-01-01-latest',
  });
  cleanup(t, root);

  const result = selectRetention({
    project: root,
    archiveDir: 'docs/specs',
    config: readProfile(root),
    now: '2025-06-01',
  });
  assert.deepEqual(result.candidates.map((item) => item.feature), ['2024-06-01-mid', '2024-01-01-old']);
  assert.ok(result.kept.some((item) => item.feature === '2025-01-01-latest'));
  assert.ok(!result.candidates.some((item) => item.feature === '2025-01-01-latest'));
});

test('min_keep 保证至少保留指定数量', (t) => {
  const root = makeRepo({
    features: [
      { name: '2024-01-01-a', archived: '2024-01-01' },
      { name: '2024-02-01-b', archived: '2024-02-01' },
      { name: '2024-03-01-c', archived: '2024-03-01' },
      { name: '2024-04-01-d', archived: '2024-04-01' },
    ],
    config: { keep_latest: 1, keep_days: 0, min_keep: 3, mode: 'report' },
  });
  cleanup(t, root);

  const result = selectRetention({
    project: root,
    archiveDir: 'docs/specs',
    config: readProfile(root),
    now: '2025-01-01',
  });
  assert.equal(result.kept.length, 3);
  assert.deepEqual(result.candidates.map((item) => item.feature), ['2024-01-01-a']);
});

test('current、被引用、未跟踪和缺少 archived 的记录被跳过', (t) => {
  const root = makeRepo({
    features: [
      { name: '2024-01-01-current', archived: '2024-01-01' },
      { name: '2024-02-01-referenced', archived: '2024-02-01' },
      { name: '2024-03-01-missing' },
      { name: '2024-04-01-old', archived: '2024-04-01' },
    ],
    config: { keep_latest: 0, keep_days: 0, min_keep: 0, mode: 'report' },
    current: '2024-01-01-current',
    references: { 'README.md': 'see 2024-02-01-referenced for details\n' },
  });
  writeFeature(path.join(root, 'docs', 'specs'), '2024-05-01-untracked', '2024-05-01');
  cleanup(t, root);

  const result = selectRetention({
    project: root,
    archiveDir: 'docs/specs',
    config: readProfile(root),
    now: '2025-01-01',
  });
  assert.deepEqual(result.candidates.map((item) => item.feature), ['2024-04-01-old']);
  assert.ok(result.kept.some((item) => item.feature === '2024-01-01-current'));
  const reasons = Object.fromEntries(result.skipped.map((item) => [item.feature, item.reason]));
  assert.equal(reasons['2024-02-01-referenced'], 'referenced');
  assert.equal(reasons['2024-03-01-missing'], 'missing archived');
  assert.equal(reasons['2024-05-01-untracked'], 'untracked');
});

test('候选目录有未跟踪文件时跳过，不删除本地内容', (t) => {
  const root = makeRepo({
    features: [{ name: '2024-01-01-old', archived: '2024-01-01' }],
    config: { keep_latest: 0, keep_days: 0, min_keep: 0, mode: 'report' },
  });
  cleanup(t, root);
  fs.writeFileSync(path.join(root, 'docs/specs/2024-01-01-old/notes.md'), 'local notes\n');

  const result = selectRetention({
    project: root,
    archiveDir: 'docs/specs',
    config: readProfile(root),
    now: '2025-01-01',
  });
  assert.deepEqual(result.candidates, []);
  assert.equal(result.skipped.find((item) => item.feature === '2024-01-01-old')?.reason, 'dirty');
});

test('INDEX.md 缺失时拒绝删除候选', (t) => {
  const root = makeRepo({
    features: [{ name: '2024-01-01-old', archived: '2024-01-01' }],
    config: { keep_latest: 0, keep_days: 0, min_keep: 0, mode: 'auto' },
    index: false,
  });
  cleanup(t, root);

  const result = selectRetention({
    project: root,
    archiveDir: 'docs/specs',
    config: readProfile(root),
    now: '2025-01-01',
  });
  assert.equal(result.candidates.length, 1);
  assert.throws(
    () => applyRetention({ project: root, result, now: '2025-01-01' }),
    /INDEX\.md/,
  );
  assert.ok(fs.existsSync(path.join(root, 'docs/specs/2024-01-01-old')));
});

test('INDEX 没有对应行时不删除', (t) => {
  const root = makeRepo({
    features: [{ name: '2024-01-01-old', archived: '2024-01-01' }],
    config: { keep_latest: 0, keep_days: 0, min_keep: 0, mode: 'auto' },
  });
  cleanup(t, root);
  fs.writeFileSync(path.join(root, 'docs/specs/INDEX.md'), '# INDEX\n\n| Feature | 状态 | 归档日期 | 验证结论 | 摘要 |\n|---|---|---|---|---|\n');

  const result = selectRetention({
    project: root,
    archiveDir: 'docs/specs',
    config: readProfile(root),
    now: '2025-01-01',
  });
  const applied = applyRetention({ project: root, result, now: '2025-01-01' });
  assert.deepEqual(applied.deleted, []);
  assert.deepEqual(applied.skipped, ['2024-01-01-old']);
  assert.ok(fs.existsSync(path.join(root, 'docs/specs/2024-01-01-old')));
});

test('report 模式只报告，ask 需要 --yes，auto 自动删除并更新 INDEX', (t) => {
  const root = makeRepo({
    features: [
      { name: '2024-01-01-old', archived: '2024-01-01' },
      { name: '2024-02-01-mid', archived: '2024-02-01' },
      { name: '2024-03-01-new', archived: '2024-03-01' },
    ],
    config: { keep_latest: 1, keep_days: 0, min_keep: 1, mode: 'report' },
  });
  cleanup(t, root);

  const base = selectRetention({
    project: root,
    archiveDir: 'docs/specs',
    config: readProfile(root),
    now: '2025-01-01',
  });
  assert.equal(base.candidates.length, 2);
  assert.deepEqual(applyRetention({ project: root, result: base, now: '2025-01-01' }).deleted, []);
  assert.ok(fs.existsSync(path.join(root, 'docs/specs/2024-01-01-old')));

  const ask = { ...base, config: { ...base.config, mode: 'ask' } };
  assert.deepEqual(applyRetention({ project: root, result: ask, now: '2025-01-01' }).deleted, []);
  assert.ok(fs.existsSync(path.join(root, 'docs/specs/2024-01-01-old')));
  assert.deepEqual(
    applyRetention({ project: root, result: ask, now: '2025-01-01', yes: true }).deleted,
    ['2024-02-01-mid', '2024-01-01-old'],
  );

  const auto = makeRepo({
    features: [
      { name: '2024-01-01-old', archived: '2024-01-01' },
      { name: '2024-02-01-mid', archived: '2024-02-01' },
      { name: '2024-03-01-new', archived: '2024-03-01' },
    ],
    config: { keep_latest: 1, keep_days: 0, min_keep: 1, mode: 'auto' },
  });
  t.after(() => fs.rmSync(auto, { recursive: true, force: true }));
  const autoResult = selectRetention({
    project: auto,
    archiveDir: 'docs/specs',
    config: readProfile(auto),
    now: '2025-01-01',
  });
  const applied = applyRetention({ project: auto, result: autoResult, now: '2025-01-01' });
  assert.deepEqual(applied.deleted, ['2024-02-01-mid', '2024-01-01-old']);
  assert.deepEqual(applied.indexUpdated, ['2024-02-01-mid', '2024-01-01-old']);
  const index = fs.readFileSync(path.join(auto, 'docs/specs/INDEX.md'), 'utf8');
  assert.match(index, /\| 2024-01-01-old \| purged \|/);
  assert.match(index, /docs 已于 2025-01-01 清理/);
  assert.ok(!fs.existsSync(path.join(auto, 'docs/specs/2024-01-01-old')));
  assert.ok(fs.existsSync(path.join(auto, 'docs/specs/2024-03-01-new')));
});

test('命令行按 profile 和 flow.yaml 计算候选', (t) => {
  const root = makeRepo({
    features: [
      { name: '2024-01-01-old', archived: '2024-01-01' },
      { name: '2024-02-01-mid', archived: '2024-02-01' },
      { name: '2024-03-01-new', archived: '2024-03-01' },
    ],
    config: { keep_latest: 1, keep_days: 0, min_keep: 1, mode: 'report' },
  });
  cleanup(t, root);

  const stdout = execFileSync(
    process.execPath,
    [scriptPath, '--project', root, '--flow', 'lite', '--now', '2025-01-01', '--json'],
    { encoding: 'utf8' },
  );
  const result = JSON.parse(stdout);
  assert.deepEqual(result.candidates.map((item) => item.feature), ['2024-02-01-mid', '2024-01-01-old']);
});

test('profile.local.yaml 覆盖 retention 配置', (t) => {
  const root = makeRepo({
    features: [{ name: '2024-01-01-old', archived: '2024-01-01' }],
    config: { keep_latest: 20, keep_days: 180, min_keep: 5, mode: 'report' },
  });
  cleanup(t, root);
  fs.writeFileSync(
    path.join(root, '.claude', 'flows', 'profile.local.yaml'),
    yaml.dump({ retention: { archive: { keep_latest: 1 } } }),
  );
  assert.equal(readProfile(root).keep_latest, 1);
});

test('flow.yaml 的 archive 被正确读取', (t) => {
  const root = makeRepo();
  cleanup(t, root);
  const flow = loadFlow(root, 'lite');
  assert.equal(flow.archive, 'docs/specs');
});

test('updateIndexRow 只改状态和摘要', () => {
  const text = '| a | archived | 2024-01-01 | pass | summary |\n| b | archived | 2024-02-01 | pass | other |\n';
  const result = updateIndexRow(text, 'a', '2025-01-01');
  assert.equal(result.changed, true);
  assert.equal(result.found, true);
  assert.match(result.text, /\| a \| purged \| 2024-01-01 \| pass \| summary（docs 已于 2025-01-01 清理） \|/);
  assert.match(result.text, /\| b \| archived \|/);
  const missing = updateIndexRow(text, 'missing', '2025-01-01');
  assert.equal(missing.found, false);
  assert.equal(missing.changed, false);
});
