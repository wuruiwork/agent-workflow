'use strict';

import { generatePolicy } from '/policy.mjs';
import { translate } from '/i18n.mjs';
import { FIELD_GROUPS, FIELD_LABELS, FIELD_LABELS_EN, FIELD_TIPS, FIELD_TIPS_EN } from '/fields.mjs';
import { isGraphFlow, layoutGraph, normalizeWhen, validateGraph, whenLabel } from '/flow-graph.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const DUMP_OPTS = { noRefs: true, lineWidth: -1, sortKeys: false };
let graphDrag = null;
const COMMIT_TYPES = ['', 'auto', 'feat', 'fix', 'docs', 'test', 'chore', 'refactor', 'build'];
const ACTIONS = ['commit', 'push', 'mr'];
const ACTION_I18N = { commit: 'action.commit', push: 'action.push', mr: 'action.mr' };
const ACTION_TIP_KEY = { commit: 'binding.commit', push: 'binding.push', mr: 'binding.mr' };

const L = (key, vars) => translate(state.lang, key, vars);

// 带悬浮说明的字段标题，按当前语言显示
function lbl(key, zhText, enText) {
  const text = state.lang === 'zh'
    ? (zhText || FIELD_LABELS[key] || key)
    : (enText || FIELD_LABELS_EN[key] || FIELD_LABELS[key] || key);
  const tip = state.lang === 'zh' ? FIELD_TIPS[key] : FIELD_TIPS_EN[key];
  return `<span class="tip" data-tip="${esc(tip || '')}">${esc(text)}</span>`;
}

const state = {
  repo: '',
  project: null,
  flows: [],
  flowName: null,
  flow: null,
  selectedStage: null,
  selectedEdge: null,
  profile: null,
  profilePath: '',
  profileTarget: 'example',
  skills: [],
  policyTests: '',
  workspace: null,
  workspaceDir: '',
  workspaces: [],
  workspacesDir: '',
  tab: 'bindings',
  dirty: false,
  lang: (() => {
    try {
      const fromQuery = new URLSearchParams(location.search).get('lang');
      if (fromQuery === 'zh' || fromQuery === 'en') return fromQuery;
      return localStorage.getItem('agent-workflow-lang') || 'en';
    } catch {
      return 'en';
    }
  })(),
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
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = state.dirty ? L('status.dirty') : ''; }, 3000);
}

function markDirty() {
  state.dirty = true;
  updateDirty();
}

function updateDirty() {
  if (state.dirty) { $('#status').textContent = L('status.dirty'); $('#status').className = 'status'; }
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
    if (state.flows.length) {
      const wanted = new URLSearchParams(location.hash.slice(1)).get('flow');
      const initial = state.flows.some((f) => f.name === wanted) ? wanted : state.flows[0].name;
      selectFlow(initial);
    }
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
  state.skills = s.skills || [];
  state.workspace = s.workspace || null;
  state.workspaceDir = s.workspaceDir || '';
  state.workspaces = s.workspaces || [];
  state.workspacesDir = s.workspacesDir || '';
  state.profileTarget = s.profileTarget || 'example';
  state.profilePath = s.profile?.path || '';
  state.profile = s.profile?.data ? clone(s.profile.data) : defaultProfile();
}

async function reloadAll() {
  const s = await api('/api/state');
  applyState(s);
  if (state.flows.length) {
    const keep = state.flows.some((f) => f.name === state.flowName) ? state.flowName : state.flows[0].name;
    selectFlow(keep);
  } else {
    state.flowName = null;
    state.flow = null;
  }
  state.dirty = false;
  renderAll();
}

function selectFlow(name) {
  const item = state.flows.find((f) => f.name === name);
  if (!item) return;
  state.flowName = name;
  state.flow = item.data ? clone(item.data) : null;
  state.selectedStage = state.flow?.stages?.[0]?.id || null;
  state.selectedEdge = null;
  const testsGate = item.policy?.gates?.find((g) => g.id === 'tests-pass');
  state.policyTests = testsGate?.run || '';
}

/* ---------------- 渲染 ---------------- */

function renderAll() {
  applyLang();
  renderEnv();
  renderWorkspaceSelect();
  renderFlowList();
  renderFlow();
  renderInspector();
  updateDirty();
}

function applyLang() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = state.lang === 'zh' ? '流程编辑器 · agent-workflow' : 'Workflow editor · agent-workflow';
  $$('[data-i18n]').forEach((el) => { el.textContent = L(el.dataset.i18n); });
  $$('[data-i18n-html]').forEach((el) => { el.innerHTML = L(el.dataset.i18nHtml); });
  const sel = $('#lang-select');
  if (sel) sel.value = state.lang;
}

function renderEnv() {
  const ws = state.workspace ? `${L('side.workspaceBadge')}: ${state.workspace}` : L('side.noWorkspace');
  const parts = [`repo ${state.repo}`, ws];
  if (state.project) parts.push(`${L('side.project')}: ${state.project}`);
  $('#env').textContent = parts.join(' · ');
  $('#project-info').textContent = state.project || L('side.notConnected');
  if (state.project) $('#project-input').value = state.project;
}

function renderWorkspaceSelect() {
  const sel = $('#workspace-select');
  if (!sel) return;
  sel.innerHTML = `<option value="">${esc(L('side.noWorkspace'))}</option>` + state.workspaces.map((w) =>
    `<option value="${esc(w.name)}" ${w.name === state.workspace ? 'selected' : ''}>${esc(w.name)} (${w.skills} skills / ${w.flows} flows)</option>`
  ).join('');
}

function renderFlowList() {
  $('#flow-list').innerHTML = state.flows.length
    ? state.flows.map((f) => `
      <div class="flow-item ${f.name === state.flowName ? 'active' : ''}" data-flow="${esc(f.name)}">
        <span>${esc(f.name)} ${f.source === 'workspace' ? `<span class="chip">${esc(L('side.workspaceBadge'))}</span>` : ''}</span>
        ${f.error ? `<span class="err" title="${esc(f.error)}">${esc(L('side.parseError'))}</span>` : ''}
      </div>`).join('')
    : `<p class="hint">${esc(L('side.noFlows'))}</p>`;
}

function renderFlow() {
  const meta = $('#flow-meta');
  const stages = $('#stages');
  if (!state.flow) {
    meta.innerHTML = `<p class="hint">${esc(L('canvas.noFlow'))}</p>`;
    stages.innerHTML = '';
    $('#flowchart').innerHTML = '';
    return;
  }
  const f = state.flow;
  meta.innerHTML = `
    ${state.workspace ? '' : `<p class="hint warn span-2">${esc(L('canvas.readonlyBanner'))}</p>`}
    <label>${lbl('flow.name', '流程名', 'Flow name')}<input class="input" value="${esc(f.name)}" disabled></label>
    <label>${lbl('flow.artifacts', '产物目录', 'Artifact directory')}<input class="input" data-meta="artifacts" value="${esc(f.artifacts || '')}"></label>
    <label class="span-2">${lbl('flow.description', '描述', 'Description')}<input class="input" data-meta="description" value="${esc(f.description || '')}"></label>
    <label>${lbl('flow.archive', '归档目录', 'Archive directory')}<input class="input" data-meta="archive" value="${esc(f.archive || '')}"></label>
    <label>${lbl('flow.checkpoints', '动作槽位（逗号分隔）', 'Checkpoints (comma separated)')}<input class="input" data-meta="checkpoints" value="${esc((f.checkpoints || []).join(', '))}"></label>
    <datalist id="gate-options">
      ${['approved', 'done', 'pass', 'confirmed', 'implemented', 'draft'].map((g) => `<option value="${g}">`).join('')}
    </datalist>
  `;
  renderFlowchart();
  renderStages();
}

// 流程图：v2 是线性链（拖动排序），v3 是可编辑 DAG（拖端口连线、点边改条件）。
function renderFlowchart() {
  const el = $('#flowchart');
  if (!el) return;
  if (!state.flow) { el.innerHTML = ''; return; }
  el.innerHTML = isGraphFlow(state.flow) ? graphFlowchart() : linearFlowchart();
}

function linearFlowchart() {
  const stages = state.flow.stages || [];
  const parts = [];
  stages.forEach((stage, i) => {
    parts.push(flowNode(stage, i));
    if (i < stages.length - 1) parts.push(flowLink(i + 1));
  });
  const addLabel = L('canvas.addStage');
  parts.push(`<button class="flow-append" data-insert-stage="${stages.length}" title="${esc(addLabel)}" aria-label="${esc(addLabel)}">＋</button>`);
  return `
    <div class="graph-toolbar">
      <button class="btn ghost" data-action="convert-graph">${esc(L('graph.convert'))}</button>
    </div>
    <div class="flow-line">${parts.join('')}</div>`;
}

function graphFlowchart() {
  const layout = layoutGraph(state.flow);
  const stages = state.flow.stages || [];
  if (state.selectedEdge != null && !(state.flow.edges || [])[state.selectedEdge]) state.selectedEdge = null;
  const stageIndex = (id) => stages.findIndex((stage) => stage.id === id);

  const edgeMarkup = layout.edges.map((edge, i) => {
    const label = whenLabel(edge.when);
    const selected = state.selectedEdge === i;
    const marker = selected ? 'graph-arrow-selected' : (edge.isBack ? 'graph-arrow-back' : 'graph-arrow');
    return `
      <path class="edge-hit" data-edge-index="${i}" d="${esc(edge.path)}"></path>
      <path class="flow-edge${edge.isBack ? ' back' : ''}${selected ? ' selected' : ''}" data-edge-index="${i}" d="${esc(edge.path)}" marker-end="url(#${marker})"></path>
      ${label ? `<text class="flow-edge-label" x="${edge.labelX}" y="${edge.labelY}">${esc(label)}</text>` : ''}`;
  }).join('');
  const edgeButtons = layout.edges.map((edge, i) =>
    `<button class="edge-add" data-split-edge="${i}" style="left:${edge.addX}px;top:${edge.addY}px" title="${esc(L('canvas.insertStage'))}" aria-label="${esc(L('canvas.insertStage'))}">＋</button>`
  ).join('');

  const nodeMarkup = layout.nodes.map((node) => {
    const index = stageIndex(node.id);
    const selected = state.selectedStage === node.id ? ' selected' : '';
    const del = L('stage.delete');
    return `
      <div class="flow-node graph-node${selected}" data-index="${index}" data-stage-id="${esc(node.id)}" style="left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px">
        <span class="flow-node-name">${esc(node.id)}</span>
        <button class="flow-node-del" data-del-stage="${index}" draggable="false" title="${esc(del)}" aria-label="${esc(del)}">×</button>
        <span class="flow-port" data-port="${esc(node.id)}" title="${esc(L('graph.portHint'))}" aria-label="${esc(L('graph.portHint'))}"></span>
      </div>`;
  }).join('');

  const validation = validateGraph(state.flow);
  const warnings = [
    ...validation.errors.map((text) => `<div class="error">${esc(text)}</div>`),
    ...validation.warnings.map((text) => `<div>${esc(text)}</div>`),
  ].join('');

  return `
    <div class="graph-toolbar">
      <button class="btn ghost" data-action="add-successor">${esc(L('graph.addStage'))}</button>
    </div>
    <div class="flow-graph" style="width:${layout.width}px;height:${layout.height}px">
      <svg class="graph-edges" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
        <defs>
          <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border)"/></marker>
          <marker id="graph-arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"/></marker>
          <marker id="graph-arrow-back" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--warn)"/></marker>
        </defs>
        ${edgeMarkup}
        <path class="temp-edge" id="temp-edge" d=""></path>
      </svg>
      ${edgeButtons}
      ${nodeMarkup}
    </div>
    ${edgeEditorHtml()}
    ${warnings ? `<div class="graph-warnings">${warnings}</div>` : ''}`;
}

function edgeEditorHtml() {
  const edge = (state.flow?.edges || [])[state.selectedEdge];
  if (!edge) return '';
  const when = normalizeWhen(edge.when);
  const isStatus = typeof when === 'object' && when.status != null;
  const selectedValue = isStatus ? 'status' : when;
  const options = [
    ['always', L('graph.conditionAlways')],
    ['pass', L('graph.conditionPass')],
    ['fail', L('graph.conditionFail')],
    ['status', L('graph.conditionStatus')],
  ].map(([value, label]) => `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
  return `
    <div class="edge-editor" data-edge-editor="${state.selectedEdge}">
      <div class="edge-editor-head">
        <strong>${esc(edge.from)} → ${esc(edge.to)}</strong>
        <button class="btn danger" data-action="delete-edge">${esc(L('graph.deleteEdge'))}</button>
      </div>
      <label>${lbl('edge.when', '条件', 'Condition')}<select class="input" data-edge-when>${options}</select></label>
      ${isStatus ? `<label>${lbl('edge.status', '状态值', 'Status value')}<input class="input" data-edge-status value="${esc(when.status || '')}" placeholder="pass"></label>` : ''}
      <label>${lbl('edge.limit', '回环上限', 'Loop limit')}<input class="input" type="number" min="1" data-edge-limit value="${edge.limit ?? ''}" placeholder="${esc(L('graph.noLimit'))}"></label>
    </div>`;
}

function flowNode(stage, index) {
  const selected = state.selectedStage === stage.id ? ' selected' : '';
  const del = L('stage.delete');
  return `
    <div class="flow-node${selected}" draggable="true" data-index="${index}">
      <span class="flow-node-name">${esc(stage.id)}</span>
      <button class="flow-node-del" data-del-stage="${index}" draggable="false" title="${esc(del)}" aria-label="${esc(del)}">×</button>
    </div>`;
}

function flowLink(index) {
  const label = L('canvas.insertStage');
  return `
    <div class="flow-link">
      <span class="flow-arrow"></span>
      <button class="flow-insert" data-insert-stage="${index}" title="${esc(label)}" aria-label="${esc(label)}">＋</button>
    </div>`;
}

function renderStages() {
  $('#stages').innerHTML = (state.flow?.stages || []).map(stageCard).join('');
}

function selectStage(id, scroll = false) {
  state.selectedStage = id || null;
  $$('#flowchart .flow-node').forEach((node) => {
    const stage = state.flow?.stages?.[+node.dataset.index];
    node.classList.toggle('selected', !!stage && stage.id === state.selectedStage);
  });
  $$('#stages .stage-card').forEach((card) => {
    const stage = state.flow?.stages?.[+card.dataset.index];
    card.classList.toggle('selected', !!stage && stage.id === state.selectedStage);
  });
  if (scroll && state.selectedStage) {
    const card = $$('#stages .stage-card')
      .find((c) => state.flow?.stages?.[+c.dataset.index]?.id === state.selectedStage);
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function skillMeta(name) {
  return state.skills.find((k) => k.name === name) || null;
}

function shortText(text, max = 48) {
  const plain = String(text || '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

function skillOptions(current) {
  const names = state.skills.map((k) => k.name);
  const options = state.skills
    .map((k) => {
      const desc = shortText(k.description);
      const label = desc ? `${k.name} — ${desc}` : k.name;
      return `<option value="${esc(k.name)}" title="${esc(k.description || '')}" ${k.name === current ? 'selected' : ''}>${esc(label)}</option>`;
    })
    .join('');
  if (current && !names.includes(current)) {
    const suffix = state.lang === 'zh' ? '（未在仓库中）' : ' (not in repo)';
    return `<option value="${esc(current)}" selected>${esc(current + suffix)}</option>${options}`;
  }
  if (!current) return `<option value="" selected>${esc(L('canvas.selectSkill'))}</option>${options}`;
  return options || `<option value="${esc(current)}" selected>${esc(current)}</option>`;
}

function skillDescHtml(ref) {
  if (!ref) return `<span class="hint">${esc(L('stage.skillHint'))}</span>`;
  const meta = skillMeta(ref);
  if (!meta) return `<span class="hint warn">${esc(L('stage.skillMissing', { name: ref }))}</span>`;
  const badge = esc(L(meta.source === 'workspace' ? 'skills.workspaceBadge' : 'skills.repoBadge'));
  const desc = meta.description ? esc(shortText(meta.description, 120)) : esc(L('skills.noDesc'));
  return `<span class="chip">${badge}</span><span>${desc}</span>
    <button class="link" data-view-skill="${esc(meta.name)}">${esc(L('skills.view'))}</button>`;
}

function stageCard(s, i) {
  const hooks = state.flow.checkpoints || [];
  const refField = s.type === 'skill'
    ? `<select data-field="ref">${skillOptions(s.ref)}</select>`
    : `<input class="input" data-field="ref" value="${esc(s.ref || '')}">`;
  const skillHint = s.type === 'skill'
    ? `<p class="hint stage-skill-desc" data-skill-desc>${skillDescHtml(s.ref)}</p>`
    : '';
  return `
    <div class="stage-card ${state.selectedStage === s.id ? 'selected' : ''}" data-index="${i}">
      <div class="stage-head">
        <input class="input" data-field="id" value="${esc(s.id)}" spellcheck="false" title="stage id">
      </div>
      <label>${lbl('stage.type', '类型', 'Type')}
        <select data-field="type">
          ${['doc', 'skill'].map((t) => `<option value="${t}" ${s.type === t ? 'selected' : ''}>${esc(L(t === 'doc' ? 'stage.typeDoc' : 'stage.typeSkill'))}</option>`).join('')}
        </select>
      </label>
      <label>${lbl('stage.ref', '引用', 'Reference')}${refField}</label>
      ${skillHint}
      <label>${lbl('stage.artifact', '产物文件', 'Artifact file')}<input class="input" data-field="artifact" value="${esc(s.artifact || '')}"></label>
      <label>${lbl('stage.gate', '状态门禁', 'Status gate')}<input class="input" data-field="gate" list="gate-options" value="${esc(s.gate || '')}"></label>
      <label class="check"><input type="checkbox" data-field="approval" ${s.approval ? 'checked' : ''}> ${lbl('stage.approval', '人工确认', 'Manual approval')}</label>
      ${isGraphFlow(state.flow) ? `<label>${lbl('stage.join', '汇合方式', 'Join')}
        <select data-field="join">
          <option value="any" ${(s.join || 'any') === 'any' ? 'selected' : ''}>any</option>
          <option value="all" ${s.join === 'all' ? 'selected' : ''}>all</option>
        </select>
      </label>` : ''}
      <div class="stage-hooks">
        <span class="stage-hooks-title">${lbl('stage.hooks', '动作槽位', 'Checkpoints')}</span>
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
  return chips.join('') || `<span class="hint">${esc(L('bindings.none'))}</span>`;
}

function renderInspector() {
  $('#tab-bindings').innerHTML = bindingsHtml();
  $('#tab-profile').innerHTML = profileHtml();
  $('#tab-skills').innerHTML = skillsHtml();
  $('#tab-help').innerHTML = helpHtml();
  $('#tab-yaml').innerHTML = yamlHtml();
  updateTabs();
}

function helpHtml() {
  return `
    <p class="hint">${L('help.hint')}</p>
    ${FIELD_GROUPS.map((group) => {
      const title = state.lang === 'zh' ? group.title : (group.title_en || group.title);
      return `
        <div class="help-group">
          <h3>${esc(title)}</h3>
          ${group.fields.map((f) => {
            const label = state.lang === 'zh' ? f.label : (f.en?.label || f.label);
            const tip = state.lang === 'zh' ? f.tip : (f.en?.tip || f.tip);
            return `
              <div class="help-item">
                <strong>${esc(label)}</strong>
                <span>${esc(tip)}</span>
              </div>`;
          }).join('')}
        </div>`;
    }).join('')}`;
}

function updateTabs() {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${state.tab}`));
}

/* ---------------- 阶段动作 ---------------- */

function bindingsHtml() {
  if (!state.flow) return `<p class="hint">${esc(L('bindings.selectFlow'))}</p>`;
  const stages = state.flow.stages || [];
  const hooks = state.flow.checkpoints || [];
  const rows = stages.map((s) => {
    const b = state.profile?.bindings?.[s.id] || {};
    const cells = hooks.map((h) => `
      <td><div class="checks">
        ${ACTIONS.map((a) => {
          const tipKey = ACTION_TIP_KEY[a];
          const tip = state.lang === 'zh' ? FIELD_TIPS[tipKey] : FIELD_TIPS_EN[tipKey];
          return `<label class="tip" data-tip="${esc(tip || '')}"><input type="checkbox" data-bind="${esc(s.id)}|${esc(h)}|${a}" ${(b[h] || []).includes(a) ? 'checked' : ''}>${esc(L(ACTION_I18N[a]))}</label>`;
        }).join('')}
      </div></td>`).join('');
    const type = state.profile?.actions?.commit?.message?.type_by_stage?.[s.id] || '';
    const options = COMMIT_TYPES.map((v) => `<option value="${v}" ${v === type ? 'selected' : ''}>${esc(v || L('bindings.defaultType'))}</option>`).join('');
    return `<tr><td><strong>${esc(s.id)}</strong></td><td><select class="input" data-bindtype="${esc(s.id)}">${options}</select></td>${cells}</tr>`;
  }).join('');
  return `
    <p class="hint">${esc(L('bindings.hint'))}</p>
    <table>
      <thead><tr><th>${lbl('stage.id', '阶段', 'Stage')}</th><th>${lbl('binding.commitType', '提交类型', 'Commit type')}</th>${hooks.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
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
        <strong>${esc(L('profile.target', { n: i + 1 }))}</strong>
        <button class="icon" data-action="del-target" title="${esc(L('profile.deleteTarget'))}">×</button>
      </div>
      <label>${lbl('project.mrId', '目标标识', 'Target ID')}<input class="input" data-target="id" value="${esc(t.id || '')}"></label>
      <div class="grid-2">
        <label>${lbl('project.mrHead', '源分支', 'Source branch')}<input class="input" data-target="head" value="${esc(t.head || '')}" placeholder="current_branch / origin/main"></label>
        <label>${lbl('project.mrBase', '目标分支', 'Target branch')}<input class="input" data-target="base" value="${esc(t.base || '')}" placeholder="origin/main"></label>
      </div>
      <div class="target-when">
        <label class="check"><input type="checkbox" data-target-when="always" ${w.always ? 'checked' : ''}> ${lbl('project.mrWhen', '总是', 'Always')}</label>
        <label>${esc(L('profile.ahead'))}<input class="input" type="number" min="1" data-target-when="ahead" value="${esc(w.ahead)}"></label>
        <label>${esc(L('profile.idle'))}<input class="input" type="number" min="1" data-target-when="idle" value="${esc(w.idle)}"></label>
      </div>
      <label>${lbl('project.mrTitle', '标题模板', 'Title template')}<input class="input" data-target="title" value="${esc(t.title || '')}" placeholder="${esc(state.lang === 'zh' ? 'chore: 同步（{ahead} 个提交）' : 'chore: sync ({ahead} commits)')}"></label>
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
  const retention = p.retention?.archive || {};
  return `
    <div class="profile-form">
      <section>
        <h3>${lbl('project.flows', '本项目启用的流程', 'Flows enabled for this project')}</h3>
        <div class="checks">
          ${state.flows.map((f) => `<label><input type="checkbox" data-flow-enabled="${esc(f.name)}" ${(p.flows || []).includes(f.name) ? 'checked' : ''}> ${esc(f.name)}</label>`).join('') || `<span class="hint">${esc(L('side.noFlows'))}</span>`}
        </div>
        <p class="hint">${esc(L('profile.flowsHint'))}</p>
      </section>

      <section>
        <h3>${esc(L('profile.retention'))}</h3>
        <p class="hint">${esc(L('profile.retentionHint'))}</p>
        <div class="grid-2">
          <label>${lbl('project.keepLatest', '保留最近 N 个', 'Keep latest')}<input class="input" type="number" min="0" step="1" data-number data-p="retention.archive.keep_latest" value="${esc(retention.keep_latest ?? 20)}"></label>
          <label>${lbl('project.keepDays', '保留最近 N 天', 'Keep days')}<input class="input" type="number" min="0" step="1" data-number data-p="retention.archive.keep_days" value="${esc(retention.keep_days ?? 180)}"></label>
          <label>${lbl('project.minKeep', '至少保留 N 个', 'Minimum kept')}<input class="input" type="number" min="0" step="1" data-number data-p="retention.archive.min_keep" value="${esc(retention.min_keep ?? 5)}"></label>
          <label>${lbl('project.retentionMode', '清理模式', 'Cleanup mode')}
            <select data-p="retention.archive.mode">
              <option value="ask" ${(retention.mode || 'ask') === 'ask' ? 'selected' : ''}>ask</option>
              <option value="report" ${retention.mode === 'report' ? 'selected' : ''}>report</option>
              <option value="auto" ${retention.mode === 'auto' ? 'selected' : ''}>auto</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <h3>${esc(L('profile.remotes'))}</h3>
        <div class="grid-2">
          <label>${lbl('project.pushRemote', '推送远端', 'Push remote')}<input class="input" data-p="git.push_remote" value="${esc(g.push_remote || '')}"></label>
          <label>${lbl('project.upstreamRemote', '上游远端', 'Upstream remote')}<input class="input" data-p="git.upstream_remote" value="${esc(g.upstream_remote || '')}"></label>
          <label>${lbl('project.baseBranch', '默认分支', 'Base branch')}<input class="input" data-p="git.base_branch" value="${esc(g.base_branch || '')}"></label>
          <label>${lbl('project.onBaseBranch', '在主分支上', 'On base branch')}
            <select data-p="git.on_base_branch">
              <option value="refuse" ${g.on_base_branch === 'refuse' ? 'selected' : ''}>${esc(L('profile.onBaseRefuse'))}</option>
              <option value="create" ${g.on_base_branch === 'create' ? 'selected' : ''}>${esc(L('profile.onBaseCreate'))}</option>
            </select>
          </label>
        </div>
        <label>${lbl('project.branchPattern', '分支命名规则', 'Branch pattern')}<input class="input" data-p="git.branch.pattern" value="${esc(br.pattern || '')}"></label>
        <label>${lbl('project.createFrom', '分支来源', 'Branch source')}<input class="input" data-p="git.branch.create_from" value="${esc(br.create_from || '')}"></label>
      </section>

      <section>
        <h3>${esc(L('profile.commit'))}</h3>
        <label>${lbl('project.commitDeny', '禁止提交的路径（每行一个）', 'Excluded paths (one per line)')}<textarea data-p="actions.commit.add.deny" data-list="lines">${esc((add.deny || []).join('\n'))}</textarea></label>
        <label>${lbl('project.scopeMap', 'scope 映射（每行 stage: scope）', 'Scope map (one "stage: scope" per line)')}<textarea data-p="actions.commit.message.scope_by_stage" data-list="pairs">${esc(pairsText(msg.scope_by_stage))}</textarea></label>
      </section>

      <section>
        <h3>${esc(L('profile.push'))}</h3>
        <div class="grid-2">
          <label>${lbl('project.actionPushRemote', '推送远端', 'Push remote')}<input class="input" data-p="actions.push.remote" value="${esc(push.remote || '')}"></label>
          <label class="check">${lbl('project.setUpstream', '首次推送设置 upstream', 'Set upstream on first push')}<input type="checkbox" data-p="actions.push.set_upstream" ${push.set_upstream ? 'checked' : ''}></label>
        </div>
      </section>

      <section>
        <h3>${lbl('project.mrTargets', '合并请求目标', 'Merge request targets')}</h3>
        ${targets.map(targetCard).join('') || `<p class="hint">${esc(L('profile.noTargets'))}</p>`}
        <button class="btn ghost" data-action="add-target">${esc(L('profile.addTarget'))}</button>
      </section>

      <section>
        <h3>${lbl('project.mrSections', 'MR 描述章节', 'MR description sections')}</h3>
        <label>${lbl('project.mrSections', '章节（逗号分隔）', 'Sections (comma separated)')}<input class="input" data-p="actions.mr.sections" data-list="csv" value="${esc((mr.sections || []).join(', '))}"></label>
      </section>
    </div>`;
}

/* ---------------- Skills ---------------- */

function skillsHtml() {
  const rows = state.skills.map((s) => {
    const isRepo = s.source !== 'workspace';
    const view = `<button class="btn ghost" data-skill-action="view" data-skill="${esc(s.name)}">${esc(L('skills.view'))}</button>`;
    const actions = isRepo
      ? `${view}
         <button class="btn ghost" data-skill-action="copy" data-skill="${esc(s.name)}">${esc(L('skills.copy'))}</button>`
      : `${view}
         <button class="btn ghost" data-skill-action="edit" data-skill="${esc(s.name)}">${esc(L('skills.edit'))}</button>
         <button class="btn danger" data-skill-action="delete" data-skill="${esc(s.name)}">${esc(L('skills.delete'))}</button>`;
    return `
      <div class="skill-row">
        <div class="skill-main">
          <strong>${esc(s.name)} <span class="chip">${esc(L(isRepo ? 'skills.repoBadge' : 'skills.workspaceBadge'))}</span></strong>
          <span class="hint">${esc(s.description || L('skills.noDesc'))}</span>
        </div>
        <div class="skill-actions">${actions}</div>
      </div>`;
  }).join('');
  const disabled = state.workspace ? '' : 'disabled';
  const hint = state.workspace
    ? L('skills.hintWorkspace', { name: esc(state.workspace) })
    : esc(L('skills.hintReadonly'));
  return `
    <div class="yaml-actions">
      <button class="btn primary" data-skill-action="new" ${disabled}>${esc(L('skills.new'))}</button>
      <button class="btn" data-skill-action="import" ${disabled}>${esc(L('skills.import'))}</button>
    </div>
    <p class="hint">${hint}</p>
    <div class="skill-list">${rows || `<p class="hint">${esc(L('skills.empty'))}</p>`}</div>`;
}

function openSkillModal(skill, isNew, readOnly = false) {
  const title = readOnly
    ? L('modal.viewSkill', { name: skill.name })
    : isNew ? L('modal.newSkill') : L('modal.editSkill', { name: skill.name });
  const ro = readOnly ? ' readonly' : '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${esc(title)}</h3>
      <label>${lbl('skill.name', '名称（小写字母、数字、连字符）', 'Name (lowercase letters, digits, hyphens)')}
        <input class="input" id="skill-name" value="${esc(skill.name || '')}" ${isNew || readOnly ? 'disabled' : ''}>
      </label>
      <label>${lbl('skill.description', '描述（告诉 agent 何时使用）', 'Description (tells the agent when to use it)')}
        <textarea id="skill-desc" rows="3"${ro}>${esc(skill.description || '')}</textarea>
      </label>
      <label>${lbl('skill.body', 'SKILL.md 正文（Markdown）', 'SKILL.md body (Markdown)')}
        <textarea id="skill-body" rows="16" spellcheck="false"${ro}>${esc(skill.body || '')}</textarea>
      </label>
      <div class="modal-actions">
        <span class="hint" id="modal-error"></span>
        <button class="btn" data-modal="cancel">${esc(readOnly ? L('modal.close') : L('modal.cancel'))}</button>
        ${readOnly ? '' : `<button class="btn primary" data-modal="save">${esc(L('modal.save'))}</button>`}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', async (e) => {
    if (e.target === overlay || e.target.dataset.modal === 'cancel') {
      overlay.remove();
      return;
    }
    if (readOnly || e.target.dataset.modal !== 'save') return;
    const name = $('#skill-name', overlay).value.trim();
    const description = $('#skill-desc', overlay).value.trim();
    const body = $('#skill-body', overlay).value;
    try {
      await api('/api/skill', { method: 'POST', body: { name, description, body } });
      overlay.remove();
      await reloadSkills();
      setStatus(L('status.skillSaved', { name }), 'ok');
    } catch (err) {
      $('#modal-error', overlay).textContent = err.message;
    }
  });
}

async function reloadSkills() {
  const r = await api('/api/skills');
  state.skills = r.skills || [];
  renderStages();
  renderInspector();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function importSkillFolder() {
  const input = document.createElement('input');
  input.type = 'file';
  input.webkitdirectory = true;
  input.multiple = true;
  input.addEventListener('change', async () => {
    const files = [...input.files];
    if (!files.length) return;
    const folder = files[0].webkitRelativePath.split('/')[0];
    const suggested = folder.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    const name = prompt(L('prompt.skillName'), suggested);
    if (!name) return;
    const payload = [];
    for (const f of files) {
      const rel = f.webkitRelativePath.split('/').slice(1).join('/');
      if (!rel) continue;
      const isText = /\.(md|txt|ya?ml|json|sh|py|js|mjs|cjs|css|html)$/i.test(rel);
      payload.push({
        path: rel,
        content: isText ? await f.text() : await fileToBase64(f),
        encoding: isText ? 'text' : 'base64',
      });
    }
    try {
      await api('/api/skill/import', { method: 'POST', body: { name, files: payload } });
      await reloadSkills();
      setStatus(L('status.skillImported', { name }), 'ok');
    } catch (err) {
      setStatus(err.message, 'err');
    }
  });
  input.click();
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
  const p = generatePolicy(state.flow, { testsCommand: state.policyTests });
  if (!p) return '';
  try { return jsyaml.dump(p, DUMP_OPTS); } catch (err) { return String(err); }
}

function yamlHtml() {
  return `
    <div class="yaml-actions">
      <button class="btn" data-action="download-flow">${esc(L('advanced.downloadFlow'))}</button>
      <button class="btn" data-action="download-profile">${esc(L('advanced.downloadProfile'))}</button>
      <button class="btn" data-action="download-policy">${esc(L('advanced.downloadPolicy'))}</button>
      <button class="btn primary" data-action="save-policy">${esc(L('advanced.savePolicy'))}</button>
    </div>
    <p class="hint">${esc(L('advanced.hint'))}</p>
    <label>${lbl('advanced.tests', '测试命令（验证阶段执行）', 'Test command (run by verification)')}
      <textarea id="policy-tests" rows="3" placeholder="${esc(L('advanced.testPlaceholder'))}">${esc(state.policyTests)}</textarea>
    </label>
    <h3>${esc(L('advanced.flowTitle'))}</h3>
    <pre class="yaml" id="yaml-flow">${esc(flowYamlText())}</pre>
    <h3>${esc(L('advanced.profileTitle'))}</h3>
    <pre class="yaml" id="yaml-profile">${esc(profileYamlText())}</pre>
    <h3>${esc(L('advanced.policyTitle'))}</h3>
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

/* ---------------- 阶段插入与图编辑 ---------------- */

function makeStage() {
  const stages = (state.flow.stages ||= []);
  const used = new Set(stages.map((s) => s.id));
  let n = used.size + 1;
  while (used.has(`stage${n}`)) n++;
  return {
    id: `stage${n}`,
    type: 'doc',
    ref: 'stages/stage.md',
    artifact: '',
    gate: 'done',
    hooks: [(state.flow.checkpoints || ['stage_end'])[0]],
  };
}

function focusStageCard(index) {
  const card = $$('#stages .stage-card')[index];
  card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  card?.querySelector('[data-field="id"]')?.focus();
}

function insertStageAt(index) {
  if (!state.flow) return;
  const stages = (state.flow.stages ||= []);
  const stage = makeStage();
  stages.splice(index, 0, stage);
  state.selectedStage = stage.id;
  state.selectedEdge = null;
  markDirty();
  renderFlow();
  renderInspector();
  focusStageCard(index);
}

// 在一条边上插入节点：from -> new（保留原条件）-> to（always，保留原 limit）。
function insertStageOnEdge(index) {
  if (!state.flow) return;
  const edges = (state.flow.edges ||= []);
  const edge = edges[index];
  if (!edge) return;
  const stage = makeStage();
  state.flow.stages.push(stage);
  const incoming = { from: edge.from, to: stage.id, when: normalizeWhen(edge.when) };
  const outgoing = { from: stage.id, to: edge.to, when: 'always' };
  if (edge.limit != null) outgoing.limit = edge.limit;
  edges.splice(index, 1, incoming, outgoing);
  state.selectedStage = stage.id;
  state.selectedEdge = null;
  markDirty();
  renderFlow();
  renderInspector();
  refreshYaml();
  focusStageCard((state.flow.stages || []).length - 1);
}

function addSuccessor() {
  if (!state.flow) return;
  const from = state.selectedStage || state.flow.stages?.[0]?.id;
  const stage = makeStage();
  state.flow.stages = [...(state.flow.stages || []), stage];
  if (from) {
    state.flow.edges = [...(state.flow.edges || []), { from, to: stage.id, when: 'always' }];
  }
  state.selectedStage = stage.id;
  state.selectedEdge = null;
  markDirty();
  renderFlow();
  renderInspector();
  refreshYaml();
  focusStageCard((state.flow.stages || []).length - 1);
}

function convertToGraph() {
  if (!state.flow || isGraphFlow(state.flow)) return;
  const stages = state.flow.stages || [];
  state.flow.version = 3;
  state.flow.edges = stages.slice(0, -1).map((stage, i) => ({ from: stage.id, to: stages[i + 1].id, when: 'always' }));
  state.selectedEdge = null;
  markDirty();
  renderFlow();
  renderInspector();
  refreshYaml();
  setStatus(L('status.convertedGraph'), 'ok');
}

function deleteSelectedEdge() {
  if (!state.flow || state.selectedEdge == null) return;
  const edges = state.flow.edges || [];
  if (!edges[state.selectedEdge]) return;
  edges.splice(state.selectedEdge, 1);
  state.selectedEdge = null;
  markDirty();
  renderFlowchart();
  refreshYaml();
}

function deleteStageAt(index) {
  if (!state.flow) return;
  const stages = state.flow.stages || [];
  const stage = stages[index];
  if (!stage) return;
  const edges = state.flow.edges || [];
  const incident = edges.filter((edge) => edge.from === stage.id || edge.to === stage.id);
  const key = isGraphFlow(state.flow) && incident.length
    ? 'confirm.deleteStageEdges'
    : 'confirm.deleteStage';
  if (!confirm(L(key, { id: stage.id }))) return;
  stages.splice(index, 1);
  if (incident.length) {
    state.flow.edges = edges.filter((edge) => edge.from !== stage.id && edge.to !== stage.id);
  }
  state.selectedEdge = null;
  if (state.profile?.bindings) delete state.profile.bindings[stage.id];
  if (state.selectedStage === stage.id) {
    state.selectedStage = stages[index]?.id || stages[index - 1]?.id || null;
  }
  markDirty();
  renderFlow();
  renderInspector();
}

/* ---------------- 事件 ---------------- */

function bindEvents() {
  $('#lang-select').addEventListener('change', (e) => {
    state.lang = e.target.value === 'zh' ? 'zh' : 'en';
    try { localStorage.setItem('agent-workflow-lang', state.lang); } catch { /* ignore */ }
    renderAll();
  });

  $('#flow-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-flow]');
    if (!item) return;
    if (state.dirty && !confirm(L('confirm.discardFlowSwitch'))) return;
    selectFlow(item.dataset.flow);
    state.dirty = false;
    renderAll();
  });

  $('#workspace-select').addEventListener('change', async (e) => {
    if (state.dirty && !confirm(L('confirm.deleteWorkspaceSwitch'))) {
      e.target.value = state.workspace || '';
      return;
    }
    try {
      await api('/api/workspace/select', { method: 'POST', body: { name: e.target.value } });
      await reloadAll();
      setStatus(e.target.value
        ? L('status.workspaceSwitched', { name: e.target.value })
        : L('status.readonlyMode'), 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-new-workspace').addEventListener('click', async () => {
    const name = prompt(L('prompt.newWorkspace'));
    if (!name) return;
    try {
      await api('/api/workspace', { method: 'POST', body: { name } });
      await reloadAll();
      setStatus(L('status.workspaceCreated', { name }), 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-new-flow').addEventListener('click', async () => {
    const name = prompt(L('prompt.newFlow'));
    if (!name) return;
    try {
      await api('/api/flow/create', { method: 'POST', body: { name } });
      const s = await api('/api/state');
      applyState(s);
      selectFlow(name);
      state.dirty = false;
      renderAll();
      setStatus(L('status.flowCreated'), 'ok');
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
      setStatus(L('status.connected'), 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-save-flow').addEventListener('click', async () => {
    if (!state.flow) return;
    if (!state.workspace) { setStatus(L('status.selectWorkspace'), 'err'); return; }
    try {
      await api('/api/flow', { method: 'POST', body: { data: state.flow } });
      const item = state.flows.find((f) => f.name === state.flow.name);
      if (item) item.data = clone(state.flow);
      state.dirty = false;
      setStatus(L('status.savedFlow'), 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  });

  $('#btn-save-profile').addEventListener('click', async () => {
    if (!state.project && !state.workspace) {
      setStatus(L('status.saveProfileFirst'), 'err');
      return;
    }
    try {
      const r = await api('/api/profile', { method: 'POST', body: { data: state.profile } });
      state.profilePath = r.path;
      state.dirty = false;
      setStatus(L('status.savedProfile'), 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
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
  stagesEl.addEventListener('click', async (e) => {
    const card = e.target.closest('.stage-card');
    if (card && state.flow) {
      const stage = state.flow.stages[+card.dataset.index];
      if (stage) selectStage(stage.id);
    }
    const viewSkill = e.target.closest('[data-view-skill]')?.dataset.viewSkill;
    if (viewSkill) {
      try {
        const skill = await api(`/api/skill?name=${encodeURIComponent(viewSkill)}`);
        openSkillModal(skill, false, true);
      } catch (err) { setStatus(err.message, 'err'); }
    }
  });

  // 流程图：v2 节点排序 / 连线插入 / 节点删除；v3 拖端口连边 / 点边改条件 / 边上插节点。
  const chartEl = $('#flowchart');
  chartEl.addEventListener('click', (e) => {
    const split = e.target.closest('[data-split-edge]');
    if (split) { insertStageOnEdge(+split.dataset.splitEdge); return; }

    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'add-successor') { addSuccessor(); return; }
    if (action === 'convert-graph') { convertToGraph(); return; }
    if (action === 'delete-edge') { deleteSelectedEdge(); return; }

    const del = e.target.closest('[data-del-stage]');
    if (del) { deleteStageAt(+del.dataset.delStage); return; }
    const insertAt = e.target.closest('[data-insert-stage]')?.dataset.insertStage;
    if (insertAt !== undefined) { insertStageAt(+insertAt); return; }

    if (e.target.closest('.flow-port')) return;

    const edgeEl = e.target.closest('[data-edge-index]');
    if (edgeEl && !e.target.closest('.edge-editor')) {
      state.selectedEdge = +edgeEl.dataset.edgeIndex;
      renderFlowchart();
      return;
    }

    const node = e.target.closest('.flow-node');
    if (!node) return;
    const stage = state.flow?.stages?.[+node.dataset.index];
    if (stage) selectStage(stage.id, true);
  });

  chartEl.addEventListener('change', (e) => {
    if (!isGraphFlow(state.flow) || state.selectedEdge == null) return;
    const edge = (state.flow.edges || [])[state.selectedEdge];
    if (!edge) return;
    if (e.target.dataset.edgeWhen) {
      edge.when = e.target.value === 'status' ? { status: '' } : e.target.value;
    } else if (e.target.dataset.edgeStatus) {
      edge.when = { status: e.target.value.trim() };
    } else if (e.target.dataset.edgeLimit) {
      if (e.target.value === '') {
        delete edge.limit;
      } else {
        const value = Number(e.target.value);
        if (!Number.isInteger(value) || value < 1) {
          setStatus(L('graph.limitInvalid'), 'err');
          renderFlowchart();
          return;
        }
        edge.limit = value;
      }
    } else {
      return;
    }
    markDirty();
    renderFlowchart();
    refreshYaml();
  });

  // 从节点右侧端口拖到另一个节点，创建一条 always 边。
  chartEl.addEventListener('pointerdown', (e) => {
    const port = e.target.closest('.flow-port');
    if (!port || !isGraphFlow(state.flow)) return;
    const node = port.closest('.flow-node');
    const graph = $('.flow-graph', chartEl);
    if (!node || !graph) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = graph.getBoundingClientRect();
    const box = port.getBoundingClientRect();
    graphDrag = {
      fromId: node.dataset.stageId,
      graph,
      x1: box.left + box.width / 2 - rect.left,
      y1: box.top + box.height / 2 - rect.top,
    };
    const temp = $('#temp-edge');
    if (temp) {
      temp.setAttribute('d', `M ${graphDrag.x1} ${graphDrag.y1} L ${graphDrag.x1} ${graphDrag.y1}`);
      temp.classList.add('active');
    }
  });

  document.addEventListener('pointermove', (e) => {
    if (!graphDrag) return;
    const rect = graphDrag.graph.getBoundingClientRect();
    const x2 = e.clientX - rect.left;
    const y2 = e.clientY - rect.top;
    const temp = $('#temp-edge');
    if (temp) {
      temp.setAttribute('d', `M ${graphDrag.x1} ${graphDrag.y1} C ${graphDrag.x1 + 40} ${graphDrag.y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`);
    }
  });

  const endGraphDrag = (e) => {
    if (!graphDrag) return;
    const { fromId } = graphDrag;
    const temp = $('#temp-edge');
    temp?.classList.remove('active');
    graphDrag = null;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.flow-node');
    const toId = target?.dataset.stageId;
    if (!toId || toId === fromId) return;
    const edges = (state.flow.edges ||= []);
    if (edges.some((edge) => edge.from === fromId && edge.to === toId && normalizeWhen(edge.when) === 'always')) {
      setStatus(L('status.edgeExists'), 'err');
      return;
    }
    edges.push({ from: fromId, to: toId, when: 'always' });
    markDirty();
    renderFlowchart();
    refreshYaml();
  };
  document.addEventListener('pointerup', endGraphDrag);
  document.addEventListener('pointercancel', endGraphDrag);

  let dragIndex = null;
  chartEl.addEventListener('dragstart', (e) => {
    if (isGraphFlow(state.flow)) return;
    const node = e.target.closest('.flow-node');
    if (!node) return;
    dragIndex = +node.dataset.index;
    node.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  chartEl.addEventListener('dragend', () => {
    dragIndex = null;
    $$('#flowchart .flow-node').forEach((n) => n.classList.remove('dragging', 'drag-over'));
  });
  chartEl.addEventListener('dragover', (e) => {
    const node = e.target.closest('.flow-node');
    if (!node || dragIndex == null) return;
    e.preventDefault();
    $$('#flowchart .flow-node').forEach((n) => n.classList.remove('drag-over'));
    node.classList.add('drag-over');
  });
  chartEl.addEventListener('drop', (e) => {
    const node = e.target.closest('.flow-node');
    if (!node || dragIndex == null) return;
    e.preventDefault();
    const to = +node.dataset.index;
    if (to !== dragIndex) {
      const arr = state.flow.stages;
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(to, 0, moved);
      markDirty();
      renderFlow();
      renderInspector();
    }
    dragIndex = null;
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
      if (state.selectedStage === old) state.selectedStage = value;
      for (const edge of state.flow.edges || []) {
        if (edge.from === old) edge.from = value;
        if (edge.to === old) edge.to = value;
      }
      renameBindingKey(old, value);
    } else if (field === 'join') {
      if (value === 'any') delete stage.join;
      else stage.join = value;
    } else {
      stage[field] = value;
    }
    markDirty();
    if (field === 'id' || field === 'join') renderFlowchart();
    if (field === 'type') renderStages();
    if (field === 'ref' && stage.type === 'skill') {
      const hint = card.querySelector('[data-skill-desc]');
      if (hint) hint.innerHTML = skillDescHtml(stage.ref);
    }
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

  if (t.id === 'policy-tests') {
    state.policyTests = t.value;
    markDirty();
    refreshYaml();
    return;
  }

  if (t.dataset.flowEnabled) {
    const enabled = $$('[data-flow-enabled]:checked').map((x) => x.dataset.flowEnabled);
    if (enabled.length) state.profile.flows = enabled;
    else delete state.profile.flows;
    markDirty();
    refreshYaml();
    return;
  }

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
    else if (t.dataset.number !== undefined) value = t.value === '' ? undefined : Number(t.value);
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
  const skillAction = e.target.closest('[data-skill-action]')?.dataset.skillAction;
  if (skillAction) {
    if (skillAction === 'new') { openSkillModal({}, true); return; }
    if (skillAction === 'import') { importSkillFolder(); return; }
    const name = e.target.closest('[data-skill]')?.dataset.skill;
    if (!name) return;
    if (skillAction === 'view') {
      try {
        const skill = await api(`/api/skill?name=${encodeURIComponent(name)}`);
        openSkillModal(skill, false, true);
      } catch (err) { setStatus(err.message, 'err'); }
      return;
    }
    if (skillAction === 'copy') {
      try {
        await api('/api/skill/copy', { method: 'POST', body: { name } });
        await reloadSkills();
        setStatus(L('status.skillCopied', { name }), 'ok');
      } catch (err) { setStatus(err.message, 'err'); }
      return;
    }
    if (skillAction === 'edit') {
      try {
        const skill = await api(`/api/skill?name=${encodeURIComponent(name)}`);
        openSkillModal(skill, false);
      } catch (err) { setStatus(err.message, 'err'); }
      return;
    }
    if (skillAction === 'delete') {
      if (!confirm(L('skills.deleteConfirm', { name }))) return;
      try {
        await api('/api/skill', { method: 'DELETE', body: { name } });
        await reloadSkills();
        setStatus(L('status.skillDeleted', { name }), 'ok');
      } catch (err) { setStatus(err.message, 'err'); }
    }
    return;
  }

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
    if (!state.workspace) { setStatus(L('status.selectWorkspace'), 'err'); return; }
    try {
      await api('/api/policy', { method: 'POST', body: { flow: state.flow.name, data: generatePolicy(state.flow, { testsCommand: state.policyTests }) } });
      setStatus(L('status.policySaved'), 'ok');
    } catch (err) { setStatus(err.message, 'err'); }
  }
}

function initTooltips() {
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  document.body.appendChild(tip);

  const show = (el) => {
    if (!el || !el.dataset.tip) return;
    tip.textContent = el.dataset.tip;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let top = r.bottom + 8;
    if (top + t.height > window.innerHeight - 8) top = Math.max(8, r.top - t.height - 8);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - t.width - 8));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  };
  const hide = () => { tip.style.display = 'none'; };

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    show(el);
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) show(el);
  });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, true);
}

initTooltips();
init();
