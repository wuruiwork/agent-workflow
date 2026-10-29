#!/usr/bin/env node
// agent-workflow 流程编辑器本地服务。
// 只读写本仓库的 flows/ 和指定项目的 .claude/flows/，不碰其它路径。

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const yaml = require('./vendor/js-yaml.umd.min.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const FLOWS_DIR = path.join(REPO_ROOT, 'flows');
const EXAMPLE_PROFILE = path.join(REPO_ROOT, 'examples', 'profile.yaml');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`用法: node editor/server.mjs [选项]

  --project <dir>  同时编辑该项目的 .claude/flows/profile.yaml
  --port <n>       监听端口，默认 4173，占用时自动顺延
  --no-open        不自动打开浏览器
  --help           显示帮助`);
  process.exit(0);
}

let projectRoot = args.project ? path.resolve(args.project) : null;
if (projectRoot && !fs.existsSync(projectRoot)) {
  console.error(`项目路径不存在: ${projectRoot}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { project: null, port: 4173, open: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--no-open') out.open = false;
    else if (a === '--project') out.project = argv[++i];
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a.startsWith('--project=')) out.project = a.slice(10);
    else if (a.startsWith('--port=')) out.port = Number(a.slice(7));
    else { console.error(`未知参数: ${a}`); process.exit(2); }
  }
  return out;
}

const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const flowNameRe = /^[a-z0-9][a-z0-9-]*$/;

function flowPath(name) {
  if (!flowNameRe.test(name)) throw new Error(`非法流程名: ${name}`);
  return path.join(FLOWS_DIR, name, 'flow.yaml');
}

function profilePath() {
  if (projectRoot) return path.join(projectRoot, '.claude', 'flows', 'profile.yaml');
  return EXAMPLE_PROFILE;
}

function withHeader(comment, body) {
  return `# ${comment}\n# 本文件由 agent-workflow 流程编辑器生成，手改后仍可继续用编辑器打开。\n\n${body}`;
}

function dumpFlow(data) {
  return withHeader(`流程定义: ${data.name || ''}`, yaml.dump(data, { noRefs: true, lineWidth: -1, sortKeys: false }));
}

function dumpProfile(data) {
  return withHeader('项目级 git 动作档案', yaml.dump(data, { noRefs: true, lineWidth: -1, sortKeys: false }));
}

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, 'utf8')) || {};
}

function loadFlows() {
  if (!fs.existsSync(FLOWS_DIR)) return [];
  return fs.readdirSync(FLOWS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && flowNameRe.test(d.name))
    .map((d) => {
      const file = path.join(FLOWS_DIR, d.name, 'flow.yaml');
      if (!fs.existsSync(file)) return null;
      try {
        return { name: d.name, path: file, data: readYaml(file), error: null };
      } catch (err) {
        return { name: d.name, path: file, data: null, error: err.message };
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function loadProfile() {
  const file = profilePath();
  if (!fs.existsSync(file)) return { path: file, exists: false, data: null };
  try {
    return { path: file, exists: true, data: readYaml(file) };
  } catch (err) {
    return { path: file, exists: true, data: null, error: err.message };
  }
}

function validateFlow(data) {
  if (!data || typeof data !== 'object') throw new Error('flow 必须是对象');
  if (!data.name || !flowNameRe.test(data.name)) throw new Error('name 只能包含小写字母、数字和连字符');
  if (!Array.isArray(data.stages) || data.stages.length === 0) throw new Error('至少需要一个 stage');
  const ids = new Set();
  for (const s of data.stages) {
    if (!s.id || !flowNameRe.test(s.id)) throw new Error(`stage id 非法: ${s.id}`);
    if (ids.has(s.id)) throw new Error(`stage id 重复: ${s.id}`);
    ids.add(s.id);
    if (!['doc', 'skill'].includes(s.type)) throw new Error(`stage ${s.id} 的 type 必须是 doc 或 skill`);
    for (const h of s.hooks || []) {
      if (!Array.isArray(data.checkpoints) || !data.checkpoints.includes(h)) {
        throw new Error(`stage ${s.id} 使用了未声明的 hook: ${h}`);
      }
    }
  }
  return data;
}

function validateProfile(data) {
  if (!data || typeof data !== 'object') throw new Error('profile 必须是对象');
  if (data.actions?.mr?.targets !== undefined && !Array.isArray(data.actions.mr.targets)) {
    throw new Error('actions.mr.targets 必须是数组');
  }
  for (const [stage, hooks] of Object.entries(data.bindings || {})) {
    if (typeof hooks !== 'object' || hooks === null) throw new Error(`bindings.${stage} 必须是对象`);
    for (const [hook, actions] of Object.entries(hooks)) {
      if (!Array.isArray(actions)) throw new Error(`bindings.${stage}.${hook} 必须是数组`);
      for (const a of actions) {
        if (!['commit', 'push', 'mr'].includes(a)) throw new Error(`未知动作: ${a}`);
      }
    }
  }
  return data;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('请求体超过 2MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, {
      repo: REPO_ROOT,
      project: projectRoot,
      flows: loadFlows(),
      profile: loadProfile(),
      profileTarget: projectRoot ? 'project' : 'example',
    });
  }

  if (url.pathname === '/api/project' && req.method === 'POST') {
    const { path: target } = await readBody(req);
    if (!target) throw new Error('缺少项目路径');
    const resolved = path.resolve(String(target).replace(/^~(?=$|\/)/, process.env.HOME || '~'));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`目录不存在: ${resolved}`);
    }
    projectRoot = resolved;
    return sendJson(res, 200, { project: projectRoot, profile: loadProfile(), profileTarget: 'project' });
  }

  if (url.pathname === '/api/flow' && req.method === 'POST') {
    const { data } = await readBody(req);
    validateFlow(data);
    const file = flowPath(data.name);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, dumpFlow(data));
    return sendJson(res, 200, { ok: true, path: file });
  }

  if (url.pathname === '/api/flow/create' && req.method === 'POST') {
    const { name } = await readBody(req);
    if (!flowNameRe.test(name || '')) throw new Error('流程名只能包含小写字母、数字和连字符');
    const file = flowPath(name);
    if (fs.existsSync(file)) throw new Error(`流程已存在: ${name}`);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.mkdir(path.join(path.dirname(file), 'stages'), { recursive: true });
    const flow = {
      name,
      version: 2,
      description: '新流程',
      policy: 'policy.yaml',
      artifacts: 'docs/specs/current',
      archive: 'docs/specs',
      checkpoints: ['stage_end', 'finish'],
      stages: [
        { id: 'brief', type: 'doc', ref: 'stages/brief.md', artifact: '00-brief.md', gate: 'approved', approval: true, hooks: ['stage_end'] },
      ],
    };
    await fsp.writeFile(file, dumpFlow(flow));
    return sendJson(res, 200, { ok: true, path: file });
  }

  if (url.pathname === '/api/policy' && req.method === 'POST') {
    const { flow, data } = await readBody(req);
    const file = path.join(FLOWS_DIR, flow, 'policy.yaml');
    if (!flowNameRe.test(flow || '')) throw new Error('非法流程名');
    const text = withHeader(`流程策略: ${flow}`, yaml.dump(data, { noRefs: true, lineWidth: -1, sortKeys: false }));
    yaml.load(text);
    await fsp.writeFile(file, text);
    return sendJson(res, 200, { ok: true, path: file });
  }

  if (url.pathname === '/api/profile' && req.method === 'POST') {
    const { data } = await readBody(req);
    validateProfile(data);
    const file = profilePath();
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, dumpProfile(data));
    return sendJson(res, 200, { ok: true, path: file, target: projectRoot ? 'project' : 'example' });
  }

  if (url.pathname === '/api/profile/raw' && req.method === 'GET') {
    return sendJson(res, 200, { path: profilePath(), text: fs.existsSync(profilePath()) ? fs.readFileSync(profilePath(), 'utf8') : '' });
  }

  sendJson(res, 404, { error: 'unknown api' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(__dirname, '.' + rel);
  if (!isInside(file, __dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

function listen(port, tries = 0) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries < 20) return listen(port + 1, tries + 1);
    console.error(err.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`流程编辑器: ${url}`);
    console.log(`仓库: ${REPO_ROOT}`);
    console.log(`项目: ${projectRoot || '（未连接）'}`);
    if (args.open) {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      try {
        spawn(cmd, [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
      } catch { /* 浏览器打开失败时用户可手动访问 */ }
    }
  });
}

listen(Number.isFinite(args.port) ? args.port : 4173);
