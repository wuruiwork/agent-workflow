#!/usr/bin/env node
// v3 图流程的 CI 轨迹校验。
// 用法: node flow-trace-check.mjs <flow-name> <flow-trace.json> [--project <dir>] [--flow-file <path>]
// 由 policy.yaml 的 flow-trace command gate 调用。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function loadGraphModule() {
  const candidates = [
    './flow-graph.mjs',
    '../skills/flow-runner/scripts/flow-graph.mjs',
  ];
  for (const relative of candidates) {
    const file = path.resolve(here, relative);
    if (fs.existsSync(file)) return import(pathToFileURL(file).href);
  }
  throw new Error(`找不到 flow-graph.mjs；请运行 scripts/init-project.sh 安装校验脚本`);
}

function loadYaml() {
  const require = createRequire(import.meta.url);
  const candidates = [
    './vendor/js-yaml.umd.min.cjs',
    '../editor/vendor/js-yaml.umd.min.cjs',
  ];
  for (const relative of candidates) {
    const file = path.resolve(here, relative);
    if (fs.existsSync(file)) return require(file);
  }
  throw new Error(`找不到 js-yaml；请运行 scripts/init-project.sh 安装校验脚本`);
}

function parseArgs(argv) {
  const out = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) {
        out.flags[key] = next;
        i += 1;
      } else {
        out.flags[key] = true;
      }
    } else {
      out.positional.push(arg);
    }
  }
  return out;
}

function resolveFlowFile(flowName, project, explicit) {
  const candidates = [
    explicit,
    path.join(project, '.claude', 'flows', flowName, 'flow.yaml'),
    path.join(project, '.claude', 'flows', 'flow-graphs', flowName, 'flow.yaml'),
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || null;
}

function resolveArtifact(project, flow, stage) {
  const candidates = [];
  if (flow.artifacts) candidates.push(path.resolve(project, flow.artifacts, stage.artifact));
  candidates.push(path.resolve(project, stage.artifact));
  return candidates.find((file) => fs.existsSync(file)) || candidates[0];
}

function checkArtifact(project, flow, stage) {
  if (!stage.artifact) return { ok: true, text: null, isDirectory: false, isText: false, reason: '阶段没有 artifact' };
  const file = resolveArtifact(project, flow, stage);
  if (!fs.existsSync(file)) return { ok: false, text: null, isDirectory: false, isText: false, reason: `产物不存在: ${stage.artifact}` };
  const stat = fs.statSync(file);
  if (stat.isDirectory()) return { ok: true, text: null, isDirectory: true, isText: false, reason: '目录产物存在' };
  const isText = /\.(md|markdown|txt|ya?ml)$/i.test(file);
  if (!isText) return { ok: true, text: null, isDirectory: false, isText: false, reason: '非文本产物存在' };
  const text = fs.readFileSync(file, 'utf8');
  return { ok: true, text, isDirectory: false, isText: true, file, reason: '文本产物存在' };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const flowName = positional[0] || flags.flow;
  const traceArg = positional[1] || flags.trace;
  if (!flowName) throw new Error('用法: flow-trace-check.mjs <flow-name> <flow-trace.json> [--project <dir>] [--flow-file <path>]');
  if (!traceArg) throw new Error('缺少 flow-trace.json 路径');

  const project = path.resolve(flags.project || process.cwd());
  const traceFile = path.resolve(project, traceArg);
  if (!fs.existsSync(traceFile)) throw new Error(`轨迹文件不存在: ${traceFile}`);

  const flowFile = resolveFlowFile(flowName, project, flags['flow-file']);
  if (!flowFile) {
    throw new Error(`找不到流程定义 ${flowName}。请运行 scripts/init-project.sh，或把 flow.yaml 放到 .claude/flows/${flowName}/ 或 .claude/flows/flow-graphs/${flowName}/`);
  }

  const graphModulePromise = loadGraphModule();
  const yaml = loadYaml();

  return (async () => {
    const { replayTrace, evaluateStageGate } = await graphModulePromise;
    const flow = yaml.load(fs.readFileSync(flowFile, 'utf8')) || {};
    if (!flow.name) throw new Error(`流程定义缺少 name: ${flowFile}`);
    const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));

    if (trace.finished !== true) {
      throw new Error('flow-trace.json 未标记 finished；CI 只接受已完成的流程轨迹');
    }

    const replayed = replayTrace(flow, trace);
    const errors = [...replayed.errors];
    for (const warning of replayed.warnings) {
      console.error(`warning: ${warning}`);
    }

    // 回环会让同一阶段的产物被覆盖，只有每个阶段的最后一次完成事件能对照当前产物。
    const lastEventByStage = new Map();
    (trace.events || []).forEach((event, index) => lastEventByStage.set(event.stage, index));

    for (let i = 0; i < (trace.events || []).length; i++) {
      const event = trace.events[i];
      const stage = replayed.graph?.stageMap?.get(event.stage);
      if (!stage) continue;
      const artifact = checkArtifact(project, flow, stage);
      if (!artifact.ok) {
        errors.push(`事件 ${i + 1}（${event.stage}）: ${artifact.reason}`);
        continue;
      }
      if (lastEventByStage.get(event.stage) !== i) continue;
      const gate = evaluateStageGate(stage, {
        artifactText: artifact.text ?? null,
        exists: true,
        isDirectory: artifact.isDirectory,
        isText: artifact.isText,
      });
      if (event.outcome === 'pass' && !gate.ok) {
        errors.push(`事件 ${i + 1}（${event.stage}）声明 pass，但产物门禁未通过: ${gate.reason}`);
      }
      if (event.outcome === 'fail' && stage.artifact && artifact.isText && gate.ok) {
        errors.push(`事件 ${i + 1}（${event.stage}）声明 fail，但产物满足门禁: ${gate.reason}`);
      }
      if (event.status != null && gate.status != null && String(event.status) !== String(gate.status)) {
        errors.push(`事件 ${i + 1}（${event.stage}）记录的 status=${event.status}，产物实际是 ${gate.status}`);
      }
    }

    if (errors.length) {
      throw new Error(`flow-trace 校验失败:\n- ${errors.join('\n- ')}`);
    }
    console.log(`flow-trace ok: ${flow.name} · ${(trace.events || []).length} events · ${flowFile}`);
  })();
}

try {
  await main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
