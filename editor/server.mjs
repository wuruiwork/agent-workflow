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
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const EXAMPLE_PROFILE = path.join(REPO_ROOT, 'examples', 'profile.yaml');
// 工作区（缓存区）放在仓库内，已加入 .gitignore，不影响发布仓库的干净状态。
const WORKSPACES_DIR = process.env.AGENT_WORKFLOW_WORKSPACES
  || path.join(REPO_ROOT, 'workspaces');
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
                   路径含空格时可以不加引号（会合并到下一个 --flag 之前）；支持 ~
  --workspace <name>  启动时载入指定工作区（缓存区）
  --port <n>       监听端口，默认 4173，占用时自动顺延
  --no-open        不自动打开浏览器
  --help           显示帮助

工作区目录: ${WORKSPACES_DIR}`);
  process.exit(0);
}

function expandHome(p) {
  return String(p || '').replace(/^~(?=$|\/)/, process.env.HOME || '~');
}

let projectRoot = args.project ? path.resolve(expandHome(args.project)) : null;
if (projectRoot && !fs.existsSync(projectRoot)) {
  console.error(`项目路径不存在: ${projectRoot}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { project: null, workspace: null, port: 4173, open: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--no-open') out.open = false;
    else if (a === '--project') {
      // 路径含空格且没加引号时，会被 shell 拆成多个参数；合并到下一个 --flag 之前。
      const parts = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) parts.push(argv[++i]);
      if (!parts.length) {
        console.error('--project 需要一个目录参数');
        process.exit(2);
      }
      out.project = parts.join(' ');
    } else if (a === '--workspace') out.workspace = argv[++i];
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a.startsWith('--project=')) out.project = a.slice(10);
    else if (a.startsWith('--workspace=')) out.workspace = a.slice(12);
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
const skillNameRe = /^[a-z0-9][a-z0-9-]*$/;
const workspaceNameRe = /^[a-z0-9][a-z0-9-]*$/;

let workspace = args.workspace ? String(args.workspace) : null;
if (workspace && (!workspaceNameRe.test(workspace) || !fs.existsSync(path.join(WORKSPACES_DIR, workspace)))) {
  console.error(`工作区不存在或名称非法: ${workspace}`);
  console.error(`工作区目录: ${WORKSPACES_DIR}`);
  process.exit(1);
}

function workspaceDir(name) {
  if (!workspaceNameRe.test(name || '')) throw new Error(`非法工作区名: ${name}`);
  return path.join(WORKSPACES_DIR, name);
}

function activeWorkspaceDir() {
  return workspace ? workspaceDir(workspace) : null;
}

function requireWorkspace() {
  const dir = activeWorkspaceDir();
  if (!dir) throw new Error('请先选择或新建工作区（缓存区）；发布仓库保持只读');
  return dir;
}

function listWorkspaces() {
  if (!fs.existsSync(WORKSPACES_DIR)) return [];
  const count = (dir) => (fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).length
    : 0);
  return fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && workspaceNameRe.test(d.name))
    .map((d) => {
      const dir = path.join(WORKSPACES_DIR, d.name);
      return {
        name: d.name,
        skills: count(path.join(dir, 'skills')),
        flows: count(path.join(dir, 'flows')),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function flowWritePath(name) {
  if (!flowNameRe.test(name)) throw new Error(`非法流程名: ${name}`);
  return path.join(requireWorkspace(), 'flows', name, 'flow.yaml');
}

function skillWriteDir(name) {
  if (!skillNameRe.test(name || '')) throw new Error(`非法 skill 名: ${name}`);
  return path.join(requireWorkspace(), 'skills', name);
}

function readSkillAt(file, name) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let meta = {};
  if (match) {
    try { meta = yaml.load(match[1]) || {}; } catch { meta = {}; }
  }
  return {
    name,
    description: String(meta.description || '').trim(),
    body: match ? text.slice(match[0].length) : text,
  };
}

function skillRoots() {
  const roots = [{ dir: SKILLS_DIR, source: 'repo' }];
  const ws = activeWorkspaceDir();
  if (ws) roots.push({ dir: path.join(ws, 'skills'), source: 'workspace' });
  return roots;
}

function readSkill(name) {
  if (!skillNameRe.test(name || '')) return null;
  // 工作区优先，仓库兜底
  for (const root of [...skillRoots()].reverse()) {
    const file = path.join(root.dir, name, 'SKILL.md');
    if (fs.existsSync(file)) return { ...readSkillAt(file, name), source: root.source };
  }
  return null;
}

function dumpSkill(name, description, body) {
  const meta = yaml.dump(
    { name, description: String(description || '').trim() },
    { noRefs: true, lineWidth: -1, sortKeys: false }
  );
  return `---\n${meta}---\n\n${String(body || '').trim()}\n`;
}

function loadSkills() {
  const byName = new Map();
  for (const root of skillRoots()) {
    if (!fs.existsSync(root.dir)) continue;
    for (const d of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!d.isDirectory() || !skillNameRe.test(d.name)) continue;
      const file = path.join(root.dir, d.name, 'SKILL.md');
      if (!fs.existsSync(file)) continue;
      let description = '';
      try { description = readSkillAt(file, d.name).description; } catch { description = ''; }
      byName.set(d.name, { name: d.name, description, source: root.source });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function profilePath(forWrite = false) {
  if (projectRoot) return path.join(projectRoot, '.claude', 'flows', 'profile.yaml');
  const ws = activeWorkspaceDir();
  if (ws) return path.join(ws, 'profile.yaml');
  if (forWrite) throw new Error('请连接项目或选择工作区后再保存 profile');
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

function flowRoots() {
  const roots = [{ dir: FLOWS_DIR, source: 'repo' }];
  const ws = activeWorkspaceDir();
  if (ws) roots.push({ dir: path.join(ws, 'flows'), source: 'workspace' });
  return roots;
}

function loadFlows() {
  const byName = new Map();
  for (const root of flowRoots()) {
    if (!fs.existsSync(root.dir)) continue;
    for (const d of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!d.isDirectory() || !flowNameRe.test(d.name)) continue;
      const file = path.join(root.dir, d.name, 'flow.yaml');
      if (!fs.existsSync(file)) continue;
      // 工作区后处理，覆盖同名仓库流程
      byName.set(d.name, { name: d.name, file, source: root.source });
    }
  }
  return [...byName.values()]
    .map(({ name, file, source }) => {
      try {
        const policyFile = path.join(path.dirname(file), 'policy.yaml');
        let policy = null;
        if (fs.existsSync(policyFile)) {
          try { policy = readYaml(policyFile); } catch { policy = null; }
        }
        return { name, path: file, source, data: readYaml(file), policy, error: null };
      } catch (err) {
        return { name, path: file, source, data: null, error: err.message };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function loadProfile() {
  const file = profilePath();
  if (!fs.existsSync(file)) {
    // 工作区还没有 profile 时，先用 examples/profile.yaml 的默认配置展示。
    let fallback = null;
    if (workspace && fs.existsSync(EXAMPLE_PROFILE)) {
      try { fallback = readYaml(EXAMPLE_PROFILE); } catch { fallback = null; }
    }
    return { path: file, exists: false, data: fallback };
  }
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
  if (data.flows !== undefined) {
    if (!Array.isArray(data.flows)) throw new Error('flows 必须是数组');
    const names = new Set(loadFlows().map((f) => f.name));
    for (const f of data.flows) {
      if (!names.has(f)) throw new Error(`flows 里包含未安装的流程: ${f}`);
    }
  }
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
      skills: loadSkills(),
      profile: loadProfile(),
      profileTarget: projectRoot ? 'project' : workspace ? 'workspace' : 'example',
      workspace,
      workspaceDir: activeWorkspaceDir(),
      workspaces: listWorkspaces(),
      workspacesDir: WORKSPACES_DIR,
    });
  }

  if (url.pathname === '/api/workspaces' && req.method === 'GET') {
    return sendJson(res, 200, { workspaces: listWorkspaces(), active: workspace, dir: WORKSPACES_DIR });
  }

  if (url.pathname === '/api/workspace' && req.method === 'POST') {
    const { name } = await readBody(req);
    if (!workspaceNameRe.test(name || '')) throw new Error('工作区名只能包含小写字母、数字和连字符');
    const dir = workspaceDir(name);
    await fsp.mkdir(path.join(dir, 'skills'), { recursive: true });
    await fsp.mkdir(path.join(dir, 'flows'), { recursive: true });
    if (fs.existsSync(EXAMPLE_PROFILE)) {
      await fsp.copyFile(EXAMPLE_PROFILE, path.join(dir, 'profile.yaml'));
    }
    await fsp.writeFile(
      path.join(dir, 'workspace.json'),
      JSON.stringify({ name, created: new Date().toISOString() }, null, 2) + '\n'
    );
    workspace = name;
    return sendJson(res, 200, { ok: true, workspace: name, dir });
  }

  if (url.pathname === '/api/workspace/select' && req.method === 'POST') {
    const { name } = await readBody(req);
    if (name) {
      if (!workspaceNameRe.test(name) || !fs.existsSync(workspaceDir(name))) {
        throw new Error(`工作区不存在: ${name}`);
      }
      workspace = name;
    } else {
      workspace = null;
    }
    return sendJson(res, 200, { workspace, workspaceDir: activeWorkspaceDir() });
  }

  if (url.pathname === '/api/project' && req.method === 'POST') {
    const { path: target } = await readBody(req);
    if (!target) throw new Error('缺少项目路径');
    const resolved = path.resolve(expandHome(target));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`目录不存在: ${resolved}`);
    }
    projectRoot = resolved;
    return sendJson(res, 200, { project: projectRoot, profile: loadProfile(), profileTarget: 'project' });
  }

  if (url.pathname === '/api/flow' && req.method === 'POST') {
    const { data } = await readBody(req);
    validateFlow(data);
    const file = flowWritePath(data.name);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, dumpFlow(data));
    return sendJson(res, 200, { ok: true, path: file });
  }

  if (url.pathname === '/api/flow/create' && req.method === 'POST') {
    const { name } = await readBody(req);
    if (!flowNameRe.test(name || '')) throw new Error('流程名只能包含小写字母、数字和连字符');
    const file = flowWritePath(name);
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
    if (!flowNameRe.test(flow || '')) throw new Error('非法流程名');
    const file = path.join(path.dirname(flowWritePath(flow)), 'policy.yaml');
    const text = withHeader(`流程策略: ${flow}`, yaml.dump(data, { noRefs: true, lineWidth: -1, sortKeys: false }));
    yaml.load(text);
    await fsp.writeFile(file, text);
    return sendJson(res, 200, { ok: true, path: file });
  }

  if (url.pathname === '/api/profile' && req.method === 'POST') {
    const { data } = await readBody(req);
    validateProfile(data);
    const file = profilePath(true);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, dumpProfile(data));
    return sendJson(res, 200, { ok: true, path: file, target: projectRoot ? 'project' : workspace ? 'workspace' : 'example' });
  }

  if (url.pathname === '/api/profile/raw' && req.method === 'GET') {
    return sendJson(res, 200, { path: profilePath(), text: fs.existsSync(profilePath()) ? fs.readFileSync(profilePath(), 'utf8') : '' });
  }

  if (url.pathname === '/api/skills' && req.method === 'GET') {
    return sendJson(res, 200, { skills: loadSkills() });
  }

  if (url.pathname === '/api/skill' && req.method === 'GET') {
    const skill = readSkill(url.searchParams.get('name') || '');
    if (!skill) throw new Error(`skill 不存在: ${url.searchParams.get('name')}`);
    return sendJson(res, 200, skill);
  }

  if (url.pathname === '/api/skill' && req.method === 'POST') {
    const { name, description, body } = await readBody(req);
    if (!skillNameRe.test(name || '')) throw new Error('skill 名只能包含小写字母、数字和连字符');
    const dir = skillWriteDir(name);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'SKILL.md'), dumpSkill(name, description, body));
    return sendJson(res, 200, { ok: true, name });
  }

  if (url.pathname === '/api/skill' && req.method === 'DELETE') {
    const { name } = await readBody(req);
    const dir = skillWriteDir(name);
    if (!fs.existsSync(dir)) {
      throw new Error(`工作区里没有 skill ${name}；仓库 skill 只读，请先「复制到工作区」`);
    }
    await fsp.rm(dir, { recursive: true, force: true });
    return sendJson(res, 200, { ok: true, name });
  }

  if (url.pathname === '/api/skill/copy' && req.method === 'POST') {
    const { name } = await readBody(req);
    if (!skillNameRe.test(name || '')) throw new Error('非法 skill 名');
    const src = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(src)) throw new Error(`仓库里没有 skill: ${name}`);
    const dest = skillWriteDir(name);
    if (fs.existsSync(dest)) throw new Error(`工作区已存在 skill: ${name}`);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.cp(src, dest, { recursive: true });
    return sendJson(res, 200, { ok: true, name });
  }

  if (url.pathname === '/api/skill/import' && req.method === 'POST') {
    const { name, files } = await readBody(req);
    if (!skillNameRe.test(name || '')) throw new Error('skill 名只能包含小写字母、数字和连字符');
    if (!Array.isArray(files) || files.length === 0) throw new Error('没有可导入的文件');
    const dir = skillWriteDir(name);
    const normalized = files.map((f) => {
      const rel = String(f.path || '').replace(/\\/g, '/');
      if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) throw new Error(`非法路径: ${rel}`);
      const dest = path.resolve(dir, rel);
      if (!isInside(dest, dir)) throw new Error(`非法路径: ${rel}`);
      return { rel, dest, content: f.content, encoding: f.encoding };
    });
    if (!normalized.some((f) => f.rel === 'SKILL.md')) throw new Error('导入内容必须包含 SKILL.md');
    await fsp.rm(dir, { recursive: true, force: true });
    for (const f of normalized) {
      await fsp.mkdir(path.dirname(f.dest), { recursive: true });
      const data = f.encoding === 'base64'
        ? Buffer.from(String(f.content || ''), 'base64')
        : String(f.content ?? '');
      await fsp.writeFile(f.dest, data);
    }
    return sendJson(res, 200, { ok: true, name });
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
