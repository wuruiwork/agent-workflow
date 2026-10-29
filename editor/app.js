'use strict';

import { generatePolicy } from '/policy.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const DUMP_OPTS = { noRefs: true, lineWidth: -1, sortKeys: false };
const COMMIT_TYPES = ['', 'auto', 'feat', 'fix', 'docs', 'test', 'chore', 'refactor', 'build'];
const ACTIONS = ['commit', 'push', 'mr'];

const state = {
  repo: '',
  project: null,
  flows: [],
  flowName: null,
  flow: null,
  profile: null,
  profilePath: '',
  profileTarget: 'example',
  tab: 'bindings',
  dirty: false,
};

/* ---------------- 基础工具 ---------------- */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setStatus(text, kind = '') {
  const el = $('#status');
  el.textContent = text;
  el.className = `status ${kind}`;
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = state.dirty ? '未保存' : ''; }, 3000);
}

function markDirty() {
  state.dirty = true;
  updateDirty();
}

function updateDirty() {
  if (state.dirty) { $('#status').textContent = '未保存'; $('#status').className = 'status'; }
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function pairsText(obj) {
  return Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function parsePairs(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- 默认值 ---------------- */

function defaultProfile() {
  return {
    version: 1,
    git: {
      provider: 'gitlab',
      push_remote: 'origin',
      upstream_remote: 'upstream',
      base_branch: 'main',
      protected: ['main'],
      on_base_branch: 'refuse',
      branch: {
        pattern: '^(feat|fix|docs|test|chore|refactor)/[a-z0-9._-]+$',
        create_from: 'upstream/main',
      },
    },
    actions: {
      commit: {
        add: { deny: ['.env', '.env.*', '*.key', '*.pem', '.tmp/', '.skillgate/phase', '.skillgate/evidence/'] },
        message: { format: 'conventional', language: 'zh', type_by_stage: {}, scope_by_stage: {} },
      },
      push: { remote: 'origin', set_upstream: true, forbid_force: true },
      mr: {
        tool: 'glab',
        targets: [{ id: 'review', head: 'current_branch', base: 'origin/main', when: 'always' }],
        sections: ['变更目的', '影响范围', '测试结果', '关联 Issue', '脱敏情况'],
      },
    },
    bindings: {},
  };
}

/* ---------------- 状态加载 ---------------- */

async function init() {
  try {
    const s = await api('/api/state');
    applyState(s);
    if (state.flows.length) selectFlow(state.flows[0].name);
    renderAll();
    bindEvents();
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  } catch (err) {
    setStatus(err.message, 'err');
  }
}

function applyState(s) {
  state.repo = s.repo || '';
  state.project = s.project || null;
  state.flows = s.flows || [];
  state.profileTarget = s.profileTarget || 'example';
  state.profilePath = s.profile?.path || '';
  state.profile = s.profile?.data ? clone(s.profile.data) : defaultProfile();
}

function selectFlow(name) {
  const item = state.flows.find((f) => f.name === name);
  if (!item) return;
  state.flowName = name;
  state.flow = item.data ? clone(item.data) : null;
}

/* ---------------- 渲染 ---------------- */

function renderAll() {
  renderEnv();
  renderFlowList();
  renderFlow();
  renderInspector();
  updateDirty();
}

function renderEnv() {
  $('#env').textContent = `仓库 ${state.repo}${state.project ? ` · 项目 ${state.project}` : ' · 未连接项目'}`;
  $('#project-info').textContent = state.project || '（未连接）';
  if (state.project) $('#project-input').value = state.project;
}

function renderFlowList() {
  $('#flow-list').innerHTML = state.flows.length
    ? state.flows.map((f) => `
      <div class="flow-item ${f.name === state.flowName ? 'active' : ''}" data-flow="${esc(f.name)}">
        <span>${esc(f.name)}</span>
        ${f.error ? `<span class="err" title="${esc(f.error)}">解析失败</span>` : ''}
      </div>`).join('')
    : '<p class="hint">仓库里还没有流程</p>';
}

function renderFlow() {
  const meta = $('#flow-meta');
  const stages = $('#stages');
  if (!state.flow) {
    meta.innerHTML = '<p class="hint">选择左侧流程，或新建一个。</p>';
    stages.innerHTML = '';
    return;
  }
  const f = state.flow;
  meta.innerHTML = `
    <label>流程名<input class="input" value="${esc(f.name)}" disabled></label>
    <label>产物目录<input class="input" data-meta="artifacts" value="${esc(f.artifacts || '')}"></label>
    <label class="span-2">描述<input class="input" data-meta="description" value="${esc(f.description || '')}"></label>
    <label>归档目录<input class="input" data-meta="archive" value="${esc(f.archive || '')}"></label>
    <label>checkpoints（逗号分隔）<input class="input" data-meta="checkpoints" value="${esc((f.checkpoints || []).join(', '))}"></label>
    <datalist id="gate-options">
      ${['approved', 'done', 'pass', 'confirmed', 'implemented', 'draft'].map((g) => `<option value="${g}">`).join('')}
    </datalist>
  `;
  renderStages();
}

function renderStages() {
  $('#stages').innerHTML = (state.flow?.stages || []).map(stageCard).join('');
}

function stageCard(s, i) {
  const hooks = state.flow.checkpoints || [];
  return `
    <div class="stage-card" draggable="true" data-index="${i}">
      <div class="stage-head">
        <input class="input" data-field="id" value="${esc(s.id)}" spellcheck="false" title="stage id">
        <button class="icon" data-action="del-stage" title="删除阶段">×</button>
      </div>
      <label>类型
        <select data-field="type">
          ${['doc', 'skill'].map((t) => `<option ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
      <label>ref<input class="input" data-field="ref" value="${esc(s.ref || '')}"></label>
      <label>产物<input class="input" data-field="artifact" value="${esc(s.artifact || '')}"></label>
      <label>状态 gate<input class="input" data-field="gate" list="gate-options" value="${esc(s.gate || '')}"></label>
      <label class="check"><input type="checkbox" data-field="approval" ${s.approval ? 'checked' : ''}> 人工确认</label>
      <div class="stage-hooks">
        ${hooks.map((h) => `<label class="check"><input type="checkbox" data-hook="${esc(h)}" ${(s.hooks || []).includes(h) ? 'checked' : ''}> ${esc(h)}</label>`).join('')}
      </div>
      <div class="stage-actions">${bindingChips(s.id)}</div>
    </div>`;
}

function bindingChips(stageId) {
  const b = state.profile?.bindings?.[stageId] || {};
  const chips = [];
  for (const [hook, actions] of Object.entries(b)) {
    for (const a of actions || []) chips.push(`<span class="chip ${a === 'push' ? 'push' : a === 'mr' ? 'mr' : ''}">${esc(hook)} · ${esc(a)}</span>`);
  }
  return chips.join('') || '<span class="hint">无 git 动作</span>';
}

function renderInspector() {
  $('#tab-bindings').innerHTML = bindingsHtml();
  $('#tab-profile').innerHTML = profileHtml();
  $('#tab-yaml').innerHTML = yamlHtml();
  updateTabs();
}

function updateTabs() {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${state.tab}`));
}

/* ---------------- 阶段动作 ---------------- */

function bindingsHtml() {
  if (!state.flow) return '<p class="hint">先选择一个流程。</p>';
  const stages = state.flow.stages || [];
  const hooks = state.flow.checkpoints || [];
  const rows = stages.map((s) => {
    const b = state.profile?.bindings?.[s.id] || {};
    const cells = hooks.map((h) => `
      <td><div class="checks">
        ${ACTIONS.map((a) => `<label><input type="checkbox" data-bind="${esc(s.id)}|${esc(h)}|${a}" ${(b[h] || []).includes(a) ? 'checked' : ''}>${a}</label>`).join('')}
      </div></td>`).join('');
    const type = state.profile?.actions?.commit?.message?.type_by_stage?.[s.id] || '';
    const options = COMMIT_TYPES.map((v) => `<option value="${v}" ${v === type ? 'selected' : ''}>${v || '（默认）'}</option>`).join('');
    return `<tr><td><strong>${esc(s.id)}</strong></td><td><select class="input" data-bindtype="${esc(s.id)}">${options}</select></td>${cells}</tr>`;
  }).join('');
  return `
    <p class="hint">勾选后写入 profile 的 <code>bindings</code>：阶段 × hook → 动作。流程只声明槽位，动作由项目决定。</p>
    <table>
      <thead><tr><th>阶段</th><th>commit 类型</th>${hooks.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function setBinding(stage, hook, action, on) {
  const bindings = (state.profile.bindings ||= {});
  const stageBind = (bindings[stage] ||= {});
  const set = new Set(stageBind[hook] || []);
  if (on) set.add(action); else set.delete(action);
  const arr = ACTIONS.filter((a) => set.has(a));
  if (arr.length) stageBind[hook] = arr; else delete stageBind[hook];
  if (!Object.keys(stageBind).length) delete bindings[stage];
  markDirty();
}

function renameBindingKey(from, to) {
  if (!from || !to || from === to) return;
  for (const holder of [state.profile.bindings, state.profile.actions?.commit?.message?.type_by_stage]) {
    if (holder && Object.prototype.hasOwnProperty.call(holder, from)) {
      holder[to] = holder[from];
      delete holder[from];
    }
  }
}

/* ---------------- 项目配置 ---------------- */

function whenParts(when) {
  if (!when || when === 'always') return { always: true, ahead: '', idle: '' };
  if (Array.isArray(when.any)) {
    const parts = { always: false, ahead: '', idle: '' };
    for (const c of when.any) {
      if (c.ahead_by != null) parts.ahead = c.ahead_by;
      if (c.idle_days != null) parts.idle = c.idle_days;
    }
    return parts;
  }
  if (when.ahead_by != null) return { always: false, ahead: when.ahead_by, idle: '' };
  if (when.idle_days != null) return { always: false, ahead: '', idle: when.idle_days };
  return { always: true, ahead: '', idle: '' };
}

function buildWhen(always, ahead, idle) {
  if (always) return 'always';
  const conds = [];
  if (ahead !== '' && ahead != null) conds.push({ ahead_by: Number(ahead) });
  if (idle !== '' && idle != null) conds.push({ idle_days: Number(idle) });
  if (!conds.length) return 'always';
  return conds.length === 1 ? conds[0] : { any: conds };
}

function targetCard(t, i) {
  const w = whenParts(t.when);
  return `
    <div class="target-card" data-target-index="${i}">
      <div class="target-head">
        <strong>目标 ${i + 1}</strong>
        <button class="icon" data-action="del-target" title="删除目标">×</button>
      </div>
      <label>id<input class="input" data-target="id" value="${esc(t.id || '')}"></label>
      <div class="grid-2">
        <label>head<input class="input" data-target="head" value="${esc(t.head || '')}" placeholder="current_branch / origin/main"></label>
        <label>base<input class="input" data-target="base" value="${esc(t.base || '')}" placeholder="origin/main"></label>
      </div>
      <div class="target-when">
        <label class="check"><input type="checkbox" data-target-when="always" ${w.always ? 'checked' : ''}> 总是</label>
        <label>领先提交数<input class="input" type="number" min="1" data-target-when="ahead" value="${esc(w.ahead)}"></label>
        <label>主干空闲天数<input class="input" type="number" min="1" data-target-when="idle" value="${esc(w.idle)}"></label>
      </div>
      <label>标题模板<input class="input" data-target="title" value="${esc(t.title || '')}" placeholder="chore: 同步（{ahead} 个提交）"></label>
    </div>`;
}

function profileHtml() {
  const p = state.profile;
  const g = (p.git ||= {});
  const br = (g.branch ||= {});
  const actions = (p.actions ||= {});
  const commit = (actions.commit ||= {});
  const msg = (commit.message ||= {});
  const add = (commit.add ||= {});
  const push = (actions.push ||= {});
  const mr = (actions.mr ||= {});
  const targets = (mr.targets ||= []);
  return `
    <div class="profile-form">
      <section>
        <h3>远端与分支</h3>
        <div class="grid-2">
          <label>push 远端<input class="input" data-p="git.push_remote" value="${esc(g.push_remote || '')}"></label>
          <label>上游远端<input class="input" data-p="git.upstream_remote" value="${esc(g.upstream_remote || '')}"></label>
          <label>默认分支<input class="input" data-p="git.base_branch" value="${esc(g.base_branch || '')}"></label>
          <label>在默认分支上
            <select data-p="git.on_base_branch">
              <option value="refuse" ${g.on_base_branch === 'refuse' ? 'selected' : ''}>refuse（拒绝，先切分支）</option>
              <option value="create" ${g.on_base_branch === 'create' ? 'selected' : ''}>create（自动建分支）</option>
            </select>
          </label>
        </div>
        <label>分支正则<input class="input" data-p="git.branch.pattern" value="${esc(br.pattern || '')}"></label>
        <label>分支创建来源<input class="input" data-p="git.branch.create_from" value="${esc(br.create_from || '')}"></label>
      </section>

      <section>
        <h3>提交</h3>
        <label>允许的 commit 类型（逗号分隔）<input class="input" data-p="actions.commit.message.types" data-list="csv" value="${esc((msg.types || []).join(', '))}"></label>
        <label>禁止提交的路径（每行一个）<textarea data-p="actions.commit.add.deny" data-list="lines">${esc((add.deny || []).join('\n'))}</textarea></label>
        <label>scope 映射（每行 stage: scope）<textarea data-p="actions.commit.message.scope_by_stage" data-list="pairs">${esc(pairsText(msg.scope_by_stage))}</textarea></label>
      </section>

      <section>
        <h3>推送</h3>
        <div class="grid-2">
          <label>远端<input class="input" data-p="actions.push.remote" value="${esc(push.remote || '')}"></label>
          <label class="check"><input type="checkbox" data-p="actions.push.set_upstream" ${push.set_upstream ? 'checked' : ''}> 首次推送设置 upstream</label>
        </div>
      </section>

      <section>
        <h3>MR 目标</h3>
        ${targets.map(targetCard).join('') || '<p class="hint">还没有 MR 目标</p>'}
        <button class="btn ghost" data-action="add-target">＋ 添加目标</button>
      </section>

      <section>
        <h3>MR 描述章节</h3>
        <label>章节（逗号分隔）<input class="input" data-p="actions.mr.sections" data-list="csv" value="${esc((mr.sections || []).join(', '))}"></label>
      </section>
    </div>`;
}

/* ---------------- YAML ---------------- */

function flowYamlText() {
  if (!state.flow) return '';
  try { return jsyaml.dump(state.flow, DUMP_OPTS); } catch (err) { return String(err); }
}

function profileYamlText() {
  try { return jsyaml.dump(state.profile, DUMP_OPTS); } catch (err) { return String(err); }
}


function policyText() {
  const p = generatePolicy(state.flow);
  if (!p) return '';
  try { return jsyaml.dump(p, DUMP_OPTS); } catch (err) { return String(err); }
}

function yamlHtml() {
  return `
    <div class="yaml-actions">
      <button class="btn" data-action="download-flow">下载 flow.yaml</button>
      <button class="btn" data-action="download-profile">下载 profile.yaml</button>
      <button class="btn" data-action="download-policy">下载 policy.yaml</button>
      <button class="btn primary" data-action="save-policy">保存 policy</button>
    </div>
    <h3>flow.yaml</h3>
    <pre class="yaml" id="yaml-flow">${esc(flowYamlText())}</pre>
    <h3>profile.yaml</h3>
    <pre class="yaml" id="yaml-profile">${esc(profileYamlText())}</pre>
    <h3>policy.yaml（由阶段生成，保存前请核对）</h3>
    <pre class="yaml" id="yaml-policy">${esc(policyText())}</pre>`;
}

function refreshYaml() {
  const f = $('#yaml-flow');
  const p = $('#yaml-profile');
  const pol = $('#yaml-policy');
  if (f) f.textContent = flowYamlText();
  if (p) p.textContent = profileYamlText();
  if (pol) pol.textContent = policyText();
}

function refreshChips() {
  for (const card of $$('.stage-card')) {
    const id = state.flow.stages[+card.dataset.index]?.id;
    const box = card.querySelector('.stage-actions');
    if (id && box) box.innerHTML = bindingChips(id);
  }
}

/* ---------------- 事件 ---------------- */

function bindEvents() {
  $('#flow-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-flow]');
    if (!item) return;
    if (state.dirty && !confirm('当前修改未保存，切换流程会丢失，继续？')) return;
    selectFlow(item.dataset.flow);
    state.dirty = false;
    renderAll();
  });

  $('#btn-new-flow').addEventListener('click', async () => {
    const name = prompt('新流程名（小写字母、数字、连字符）');
    if (!name) return;
    try {
      await api('/api/flow/create', { method: 'POST', body: { name } });
      const s = await api('/api/state');
      applyState(s);
      selectFlow(name);
      state.dirty = false;
      renderAll();
      setStatus('流程已创建', 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-connect').addEventListener('click', async () => {
    const target = $('#project-input').value.trim();
    if (!target) return;
    try {
      const r = await api('/api/project', { method: 'POST', body: { path: target } });
      state.project = r.project;
      state.profileTarget = 'project';
      state.profilePath = r.profile?.path || '';
      if (r.profile?.data) state.profile = clone(r.profile.data);
      renderEnv();
      renderInspector();
      setStatus('已连接项目', 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-save-flow').addEventListener('click', async () => {
    if (!state.flow) return;
    try {
      await api('/api/flow', { method: 'POST', body: { data: state.flow } });
      const item = state.flows.find((f) => f.name === state.flow.name);
      if (item) item.data = clone(state.flow);
      state.dirty = false;
      setStatus('流程已保存', 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-save-profile').addEventListener('click', async () => {
    try {
      const r = await api('/api/profile', { method: 'POST', body: { data: state.profile } });
      state.profilePath = r.path;
      state.dirty = false;
      setStatus('profile 已保存', 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-add-stage').addEventListener('click', () => {
    if (!state.flow) return;
    const used = new Set((state.flow.stages || []).map((s) => s.id));
    let n = used.size + 1;
    while (used.has(`stage${n}`)) n++;
    state.flow.stages.push({
      id: `stage${n}`,
      type: 'doc',
      ref: 'stages/stage.md',
      artifact: '',
      gate: 'done',
      hooks: [(state.flow.checkpoints || ['stage_end'])[0]],
    });
    markDirty();
    renderFlow();
    renderInspector();
  });

  $('#flow-meta').addEventListener('input', (e) => {
    const key = e.target.dataset.meta;
    if (!key || !state.flow) return;
    state.flow[key] = key === 'checkpoints'
      ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
      : e.target.value;
    if (key === 'checkpoints') {
      for (const s of state.flow.stages || []) {
        s.hooks = (s.hooks || []).filter((h) => state.flow.checkpoints.includes(h));
      }
      renderStages();
      renderInspector();
    }
    markDirty();
    refreshYaml();
  });

  const stagesEl = $('#stages');
  stagesEl.addEventListener('input', onStageEdit);
  stagesEl.addEventListener('change', onStageEdit);
  stagesEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="del-stage"]')) {
      const card = e.target.closest('.stage-card');
      const i = +card.dataset.index;
      const stage = state.flow.stages[i];
      if (!confirm(`删除阶段 ${stage.id}？`)) return;
      state.flow.stages.splice(i, 1);
      if (state.profile.bindings) delete state.profile.bindings[stage.id];
      markDirty();
      renderFlow();
      renderInspector();
    }
  });

  let dragIndex = null;
  stagesEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.stage-card');
    if (!card) return;
    dragIndex = +card.dataset.index;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  stagesEl.addEventListener('dragend', () => {
    dragIndex = null;
    $$('.stage-card').forEach((c) => c.classList.remove('dragging', 'drag-over'));
  });
  stagesEl.addEventListener('dragover', (e) => {
    const card = e.target.closest('.stage-card');
    if (!card || dragIndex == null) return;
    e.preventDefault();
    $$('.stage-card').forEach((c) => c.classList.remove('drag-over'));
    card.classList.add('drag-over');
  });
  stagesEl.addEventListener('drop', (e) => {
    const card = e.target.closest('.stage-card');
    if (!card || dragIndex == null) return;
    e.preventDefault();
    const to = +card.dataset.index;
    const arr = state.flow.stages;
    const [moved] = arr.splice(dragIndex, 1);
    arr.splice(to, 0, moved);
    dragIndex = null;
    markDirty();
    renderFlow();
    renderInspector();
  });

  $('.tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]')?.dataset.tab;
    if (!tab) return;
    state.tab = tab;
    updateTabs();
  });

  const inspector = $('.inspector');
  inspector.addEventListener('change', onInspectorChange);
  inspector.addEventListener('input', onInspectorChange);
  inspector.addEventListener('click', onInspectorClick);
}

function onStageEdit(e) {
  const card = e.target.closest('.stage-card');
  if (!card || !state.flow) return;
  const stage = state.flow.stages[+card.dataset.index];
  if (!stage) return;

  if (e.target.dataset.field) {
    const field = e.target.dataset.field;
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (field === 'id') {
      const old = stage.id;
      stage.id = value;
      renameBindingKey(old, value);
    } else {
      stage[field] = value;
    }
    markDirty();
    renderInspector();
    return;
  }

  if (e.target.dataset.hook) {
    const hook = e.target.dataset.hook;
    const set = new Set(stage.hooks || []);
    if (e.target.checked) set.add(hook); else set.delete(hook);
    stage.hooks = (state.flow.checkpoints || []).filter((h) => set.has(h));
    markDirty();
    renderInspector();
  }
}

function onInspectorChange(e) {
  const t = e.target;

  if (t.dataset.bind) {
    const [stage, hook, action] = t.dataset.bind.split('|');
    setBinding(stage, hook, action, t.checked);
    refreshChips();
    refreshYaml();
    return;
  }

  if (t.dataset.bindtype) {
    const stage = t.dataset.bindtype;
    state.profile.actions ||= {};
    state.profile.actions.commit ||= {};
    state.profile.actions.commit.message ||= {};
    const msg = state.profile.actions.commit.message;
    msg.type_by_stage ||= {};
    if (t.value) msg.type_by_stage[stage] = t.value;
    else delete msg.type_by_stage[stage];
    markDirty();
    refreshYaml();
    return;
  }

  if (t.dataset.p) {
    let value;
    if (t.type === 'checkbox') value = t.checked;
    else if (t.dataset.list === 'lines') value = t.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else if (t.dataset.list === 'csv') value = t.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (t.dataset.list === 'pairs') value = parsePairs(t.value);
    else value = t.value;
    setPath(state.profile, t.dataset.p, value);
    markDirty();
    refreshYaml();
    return;
  }

  const card = t.closest('.target-card');
  if (!card) return;
  const target = state.profile.actions.mr.targets[+card.dataset.targetIndex];
  if (!target) return;

  if (t.dataset.target) {
    target[t.dataset.target] = t.value;
    markDirty();
    refreshYaml();
    return;
  }

  if (t.dataset.targetWhen) {
    const alwaysEl = card.querySelector('[data-target-when="always"]');
    const aheadEl = card.querySelector('[data-target-when="ahead"]');
    const idleEl = card.querySelector('[data-target-when="idle"]');
    if (t.dataset.targetWhen === 'always') {
      if (t.checked) { aheadEl.value = ''; idleEl.value = ''; }
    } else if (t.value) {
      alwaysEl.checked = false;
    }
    target.when = buildWhen(alwaysEl.checked, aheadEl.value, idleEl.value);
    markDirty();
    refreshYaml();
  }
}

async function onInspectorClick(e) {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  if (action === 'add-target') {
    state.profile.actions ||= {};
    state.profile.actions.mr ||= {};
    state.profile.actions.mr.targets ||= [];
    const targets = state.profile.actions.mr.targets;
    targets.push({ id: `target${targets.length + 1}`, head: 'current_branch', base: '', when: 'always' });
    markDirty();
    renderInspector();
    return;
  }

  if (action === 'del-target') {
    const card = e.target.closest('.target-card');
    state.profile.actions.mr.targets.splice(+card.dataset.targetIndex, 1);
    markDirty();
    renderInspector();
    return;
  }

  if (action === 'download-flow') { download(`${state.flow?.name || 'flow'}-flow.yaml`, flowYamlText()); return; }
  if (action === 'download-profile') { download('profile.yaml', profileYamlText()); return; }
  if (action === 'download-policy') { download(`${state.flow?.name || 'flow'}-policy.yaml`, policyText()); return; }

  if (action === 'save-policy') {
    if (!state.flow) return;
    try {
      await api('/api/policy', { method: 'POST', body: { flow: state.flow.name, data: generatePolicy(state.flow) } });
      setStatus('policy 已保存', 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  }
}

init();
