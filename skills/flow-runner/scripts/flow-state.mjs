#!/usr/bin/env node
// v3 图流程的本地状态机 CLI。
// 由 flow-runner 调用：status / start / complete / init。
// 状态写入 .skillgate/flow-state.json（本地），完成事件同步写入 flow-trace.json（提交）。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  completeStage,
  createState,
  evaluateStageGate,
  isGraphFlow,
  readyStages,
  startStage,
  validateGraph,
} from './flow-graph.mjs';

const require = createRequire(import.meta.url);
const yaml = require('./vendor/js-yaml.umd.min.cjs');

function fail(message) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { cmd: argv[0] || '', flags: {} };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out.flags[key] = next;
      i += 1;
    } else {
      out.flags[key] = true;
    }
  }
  return out;
}

function requireFlag(flags, key, label) {
  const value = flags[key];
  if (value == null || value === true || value === '') fail(`缺少 --${key}${label ? `（${label}）` : ''}`);
  return String(value);
}

function nowIso() {
  return new Date().toISOString();
}

function readFlow(flowFile) {
  if (!fs.existsSync(flowFile)) fail(`找不到流程文件: ${flowFile}`);
  let flow;
  try {
    flow = yaml.load(fs.readFileSync(flowFile, 'utf8')) || {};
  } catch (error) {
    fail(`flow.yaml 解析失败: ${error.message}`);
  }
  if (!flow.name) fail('flow.yaml 缺少 name');
  const graph = validateGraph(flow);
  if (!graph.ok) fail(`流程结构不合法:\n- ${graph.errors.join('\n- ')}`);
  if (isGraphFlow(flow) && !flow.artifacts) fail('v3 流程需要 artifacts 目录，flow-trace.json 必须提交');
  return { flow, graph };
}

function statePathOf(flags, project) {
  return path.resolve(project, flags.state || '.skillgate/flow-state.json');
}

function tracePathOf(flags, project, flow) {
  if (flags.trace) return path.resolve(project, flags.trace);
  return path.resolve(project, flow.artifacts || '.', 'flow-trace.json');
}

function readState(file, flow) {
  if (!fs.existsSync(file)) return null;
  let state;
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`状态文件解析失败: ${error.message}`);
  }
  if (state.flow !== flow.name) {
    fail(`状态文件属于流程 ${state.flow || '(未知)'}，当前流程是 ${flow.name}；请用 init --force 重新开始`);
  }
  return state;
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function writeTrace(file, flow, state) {
  const trace = {
    flow: flow.name,
    version: Number(flow.version) || 2,
    started_at: state.startedAtRun || state.events?.[0]?.startedAt || null,
    finished_at: state.finished ? (state.finishedAt || nowIso()) : null,
    finished: !!state.finished,
    events: state.events || [],
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(trace, null, 2)}\n`);
  return trace;
}

function resolveArtifact(project, flow, stage) {
  const candidates = [];
  if (flow.artifacts) candidates.push(path.resolve(project, flow.artifacts, stage.artifact));
  candidates.push(path.resolve(project, stage.artifact));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found || candidates[0];
}

function isTextArtifact(file) {
  return /\.(md|markdown|txt|ya?ml)$/i.test(file);
}

function checkGate(project, flow, stage) {
  if (!stage.artifact) return { ok: true, status: null, reason: '阶段没有 artifact，跳过产物门禁', file: null };
  const file = resolveArtifact(project, flow, stage);
  const exists = fs.existsSync(file);
  let isDirectory = false;
  let artifactText = null;
  const isText = isTextArtifact(file);
  if (exists) {
    const stat = fs.statSync(file);
    isDirectory = stat.isDirectory();
    if (!isDirectory && isText && stat.size < 8 * 1024 * 1024) {
      artifactText = fs.readFileSync(file, 'utf8');
    }
  }
  return { ...evaluateStageGate(stage, { artifactText, exists, isDirectory, isText: !isDirectory && isText }), file };
}

function output(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function loadForCommand(flags, project) {
  const flowFile = path.resolve(requireFlag(flags, 'flow', 'flow.yaml 路径'));
  const { flow, graph } = readFlow(flowFile);
  const stateFile = statePathOf(flags, project);
  const traceFile = tracePathOf(flags, project, flow);
  return { flow, graph, stateFile, traceFile };
}

function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  const project = path.resolve(flags.project || process.cwd());
  if (!['init', 'status', 'start', 'complete'].includes(cmd)) {
    fail(`未知命令: ${cmd || '(空)'}；可用: init / status / start / complete`);
  }

  const { flow, graph, stateFile, traceFile } = loadForCommand(flags, project);

  if (cmd === 'init') {
    if (fs.existsSync(stateFile) && !flags.force) {
      fail(`状态文件已存在: ${stateFile}；继续请用 status，重新开始请加 --force`);
    }
    const state = createState(flow);
    state.startedAtRun = flags.at || nowIso();
    writeState(stateFile, state);
    writeTrace(traceFile, flow, state);
    output({
      ok: true,
      flow: flow.name,
      state: stateFile,
      trace: traceFile,
      ready: readyStages(state),
      active: state.active,
      finished: false,
    });
    return;
  }

  let state = readState(stateFile, flow);
  if (!state) {
    if (cmd !== 'status') fail(`状态文件不存在: ${stateFile}；请先运行 status 或 init`);
    state = createState(flow);
    state.startedAtRun = flags.at || nowIso();
    writeState(stateFile, state);
    writeTrace(traceFile, flow, state);
  }

  if (cmd === 'status') {
    output({
      ok: true,
      flow: flow.name,
      version: Number(flow.version) || 2,
      state: stateFile,
      trace: traceFile,
      ready: readyStages(state),
      active: state.active,
      completed: Object.keys(state.completed || {}),
      visits: state.visits || {},
      traversals: state.traversals || {},
      finished: !!state.finished,
      events: (state.events || []).length,
      warnings: graph.warnings,
    });
    return;
  }

  if (cmd === 'start') {
    const stageId = requireFlag(flags, 'stage');
    const result = startStage(state, flow, stageId, flags.at || nowIso());
    if (result.error) fail(result.error);
    writeState(stateFile, state);
    writeTrace(traceFile, flow, state);
    output({
      ok: true,
      flow: flow.name,
      stage: stageId,
      ready: readyStages(state),
      active: state.active,
      finished: false,
    });
    return;
  }

  // complete
  const stageId = requireFlag(flags, 'stage');
  const outcome = requireFlag(flags, 'outcome', 'pass 或 fail');
  if (outcome !== 'pass' && outcome !== 'fail') fail('--outcome 只能是 pass / fail');
  const stage = graph.graph?.stageMap?.get(stageId);
  if (!stage) fail(`未知阶段: ${stageId}`);

  const gate = checkGate(project, flow, stage);
  if (outcome === 'pass' && !gate.ok) fail(`阶段 ${stageId} 的产物门禁未通过: ${gate.reason}`);
  if (outcome === 'fail' && stage.artifact && gate.ok) {
    fail(`阶段 ${stageId} 的产物满足门禁（${gate.reason}），不能声明 fail`);
  }

  const result = completeStage(state, flow, {
    stageId,
    outcome,
    status: gate.status,
    parallelGroup: flags['parallel-group'] || null,
    changedPaths: flags.changed ? String(flags.changed).split(',').map((item) => item.trim()).filter(Boolean) : [],
    at: flags.at || nowIso(),
  });
  if (result.error) {
    fail(result.error);
  }

  if (state.finished && !state.finishedAt) state.finishedAt = flags.at || nowIso();
  writeState(stateFile, state);
  const done = state.finished ? state.finishedAt : null;
  const trace = writeTrace(traceFile, flow, state);
  output({
    ok: true,
    flow: flow.name,
    stage: stageId,
    outcome,
    status: gate.status,
    ready: readyStages(state),
    active: state.active,
    finished: !!state.finished,
    finished_at: done,
    gate: { ok: gate.ok, reason: gate.reason, file: gate.file },
    trace,
  });
}

try {
  main();
} catch (error) {
  fail(error?.stack || error?.message || String(error));
}
