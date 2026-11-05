// 流程图共享逻辑：v2 线性流程与 v3 DAG 流程的规范化、校验、状态机和布局。
// 纯 ESM，不依赖 Node API，浏览器（编辑器）与 Node（flow-state / trace check）共用。

export const GRAPH_VERSION = 3;
export const EDGE_CONDITIONS = ['always', 'pass', 'fail'];
export const JOIN_TYPES = ['any', 'all'];

const NODE_WIDTH = 112;
const NODE_HEIGHT = 34;
const GAP_X = 40;
const GAP_Y = 34;
const ARC_OFFSET = 52;

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function flowVersion(flow) {
  return Number(flow?.version) || 2;
}

export function isGraphFlow(flow) {
  return flowVersion(flow) >= GRAPH_VERSION;
}

export function normalizeWhen(when) {
  if (when == null || when === '') return 'always';
  if (typeof when === 'string') return when;
  if (isObject(when) && typeof when.status === 'string') return { status: when.status };
  return when;
}

export function whenLabel(when) {
  const value = normalizeWhen(when);
  if (value === 'always') return '';
  if (value === 'pass') return 'pass';
  if (value === 'fail') return 'fail';
  if (isObject(value) && value.status != null) return `status: ${value.status}`;
  return String(value);
}

export function whenIsValid(when) {
  const value = normalizeWhen(when);
  if (typeof value === 'string') return EDGE_CONDITIONS.includes(value);
  if (isObject(value)) {
    return Object.keys(value).length === 1
      && typeof value.status === 'string'
      && value.status.trim() !== '';
  }
  return false;
}

export function edgeConditionMatches(when, outcome, status) {
  const value = normalizeWhen(when);
  if (value === 'always') return true;
  if (value === 'pass') return outcome === 'pass';
  if (value === 'fail') return outcome === 'fail';
  if (isObject(value) && value.status != null) return String(status ?? '') === String(value.status);
  return false;
}

export function edgeKey(edge, index) {
  return `${edge.from}->${edge.to}#${index}`;
}

/**
 * 统一的图结构。
 * v2：stages 顺序即隐式线性边；v3：edges 为准。
 */
export function normalizeFlow(flow) {
  const version = flowVersion(flow);
  const stages = asArray(flow?.stages).filter((stage) => stage && stage.id);
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  const edges = [];
  const errors = [];

  if (version >= GRAPH_VERSION) {
    if (!Array.isArray(flow.edges)) errors.push('v3 流程缺少 edges 数组');
    asArray(flow?.edges).forEach((raw, index) => {
      if (!isObject(raw)) {
        errors.push(`edges[${index}] 不是对象`);
        return;
      }
      const edge = {
        from: String(raw.from ?? ''),
        to: String(raw.to ?? ''),
        when: normalizeWhen(raw.when),
        limit: raw.limit == null ? null : Number(raw.limit),
        index,
      };
      edge.key = edgeKey(edge, index);
      edges.push(edge);
    });
  } else {
    for (let i = 0; i < stages.length - 1; i++) {
      const edge = { from: stages[i].id, to: stages[i + 1].id, when: 'always', limit: null, index: i };
      edge.key = edgeKey(edge, i);
      edges.push(edge);
    }
  }

  const incoming = new Map(stages.map((stage) => [stage.id, []]));
  const outgoing = new Map(stages.map((stage) => [stage.id, []]));
  for (const edge of edges) {
    if (incoming.has(edge.to)) incoming.get(edge.to).push(edge);
    if (outgoing.has(edge.from)) outgoing.get(edge.from).push(edge);
  }
  const starts = stages.filter((stage) => (incoming.get(stage.id) || []).length === 0).map((stage) => stage.id);
  const terminals = stages.filter((stage) => (outgoing.get(stage.id) || []).length === 0).map((stage) => stage.id);
  const scc = computeSccs(stages.map((stage) => stage.id), edges);
  const sccByNode = new Map();
  scc.groups.forEach((group, index) => group.forEach((id) => sccByNode.set(id, index)));

  return {
    flow,
    name: flow?.name || '',
    version,
    stages,
    stageMap,
    edges,
    incoming,
    outgoing,
    starts,
    terminals,
    scc,
    sccByNode,
    errors,
  };
}

/** 校验流程结构；返回错误（不能运行）和警告（能运行但可能不是用户本意）。 */
export function validateGraph(flow) {
  const graph = normalizeFlow(flow);
  const errors = [...graph.errors];
  const warnings = [];
  const ids = new Set();
  const version = graph.version;

  if (!graph.stages.length) errors.push('stages 为空');
  for (const stage of graph.stages) {
    if (ids.has(stage.id)) errors.push(`阶段 id 重复: ${stage.id}`);
    ids.add(stage.id);
    if (version >= GRAPH_VERSION && !stage.artifact) warnings.push(`${stage.id}: 没有 artifact，运行时的门禁无法由状态脚本校验`);
    if (stage.join != null && !JOIN_TYPES.includes(stage.join)) errors.push(`${stage.id}: join 只能是 any / all`);
  }

  for (const stage of graph.stages) {
    const outs = graph.outgoing.get(stage.id) || [];
    const ins = graph.incoming.get(stage.id) || [];
    if (stage.join === 'all' && ins.some((edge) => normalizeWhen(edge.when) !== 'always')) {
      warnings.push(`${stage.id}: join: all 的入边里有条件边，条件不满足时可能永远等不到汇合`);
    }
    if (version < GRAPH_VERSION && outs.length > 1) {
      errors.push(`${stage.id}: v2 线性流程不能有多个下游`);
    }
  }

  if (version >= GRAPH_VERSION) {
    if (!Array.isArray(flow?.edges)) errors.push('v3 流程必须显式声明 edges（可以为空数组）');
    if (graph.starts.length !== 1) {
      errors.push(`必须恰好有一个起点（无入边的阶段），当前: ${graph.starts.join(', ') || '无'}`);
    }
    if (!graph.terminals.length) errors.push('没有终点（无出边的阶段）');

    const seen = new Set();
    for (const edge of graph.edges) {
      const label = `${edge.from} -> ${edge.to}`;
      if (!ids.has(edge.from)) errors.push(`边 ${label}: from 阶段不存在`);
      if (!ids.has(edge.to)) errors.push(`边 ${label}: to 阶段不存在`);
      if (edge.from === edge.to) errors.push(`边 ${label}: 不允许自环`);
      if (!whenIsValid(edge.when)) errors.push(`边 ${label}: when 只能是 always / pass / fail / { status: <value> }`);
      if (edge.limit != null && (!Number.isInteger(edge.limit) || edge.limit < 1)) {
        errors.push(`边 ${label}: limit 必须是正整数`);
      }
      const signature = `${edge.from}|${edge.to}|${JSON.stringify(edge.when)}`;
      if (seen.has(signature)) errors.push(`边 ${label}: 重复定义（from/to/when 相同）`);
      seen.add(signature);
    }

    // 可达性：从唯一起点沿边可达所有阶段。
    if (graph.starts.length === 1) {
      const reachable = new Set();
      const queue = [graph.starts[0]];
      while (queue.length) {
        const id = queue.shift();
        if (reachable.has(id)) continue;
        reachable.add(id);
        for (const edge of graph.outgoing.get(id) || []) if (!reachable.has(edge.to)) queue.push(edge.to);
      }
      for (const stage of graph.stages) {
        if (!reachable.has(stage.id)) errors.push(`${stage.id}: 从起点不可达`);
      }
    }

    // 每个环（SCC）至少要有一条带 limit 的边，否则无法终止。
    for (const group of graph.scc.groups) {
      const cyclic = group.length > 1 || graph.edges.some((edge) => edge.from === group[0] && edge.to === group[0]);
      if (!cyclic) continue;
      const internal = graph.edges.filter((edge) => group.includes(edge.from) && group.includes(edge.to));
      if (!internal.some((edge) => edge.limit != null)) {
        errors.push(`回环 ${group.join(' <-> ')} 没有 limit，可能无限循环`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, graph };
}

/** 判断一条边是否位于环内（用于回边重置）。 */
export function isLoopEdge(graph, edge) {
  return graph.sccByNode.get(edge.from) != null
    && graph.sccByNode.get(edge.from) === graph.sccByNode.get(edge.to);
}

/** 从某个阶段出发沿出边可达的所有阶段（含自己）。用于回边重置。 */
export function downstreamCone(graph, stageId) {
  const seen = new Set();
  const queue = [stageId];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of graph.outgoing.get(id) || []) if (!seen.has(edge.to)) queue.push(edge.to);
  }
  return seen;
}

export function createState(flow) {
  const graph = normalizeFlow(flow);
  const state = {
    flow: graph.name,
    version: graph.version,
    completed: {},
    visits: {},
    traversals: {},
    activated: {},
    active: [],
    ready: [],
    startedAt: {},
    lastOutcome: {},
    lastStatus: {},
    events: [],
    finished: false,
  };
  recomputeReady(state, graph);
  return state;
}

function recomputeReady(state, graph) {
  const ready = [];
  for (const stage of graph.stages) {
    const id = stage.id;
    if (state.completed[id] || state.active.includes(id)) continue;
    const ins = graph.incoming.get(id) || [];
    if (!ins.length) {
      ready.push(id);
      continue;
    }
    const activated = ins.filter((edge) => state.activated[edge.key]);
    const join = stage.join === 'all' ? 'all' : 'any';
    if (join === 'all' ? activated.length === ins.length : activated.length > 0) ready.push(id);
  }
  state.ready = ready;
  state.finished = ready.length === 0
    && state.active.length === 0
    && graph.terminals.some((id) => state.completed[id])
    && graph.terminals.every((id) => !state.completed[id] || state.lastOutcome[id] === 'pass');
  return ready;
}

export function readyStages(state) {
  return [...(state.ready || [])];
}

export function startStage(state, flow, stageId, at = null) {
  const graph = normalizeFlow(flow);
  if (!graph.stageMap.has(stageId)) return { error: `未知阶段: ${stageId}` };
  if (!state.ready.includes(stageId)) return { error: `阶段 ${stageId} 当前不是 ready（ready: ${state.ready.join(', ') || '无'}）` };
  state.ready = state.ready.filter((id) => id !== stageId);
  if (!state.active.includes(stageId)) state.active.push(stageId);
  state.startedAt[stageId] = at;
  return { state, graph };
}

/**
 * 完成一个阶段。
 * event: { stageId, outcome: 'pass'|'fail', status?, parallelGroup?, changedPaths?, at? }
 */
export function completeStage(state, flow, event) {
  const graph = normalizeFlow(flow);
  const stageId = String(event?.stageId || '');
  const outcome = event?.outcome;
  if (!graph.stageMap.has(stageId)) return { error: `未知阶段: ${stageId}` };
  if (outcome !== 'pass' && outcome !== 'fail') return { error: `outcome 只能是 pass / fail，收到 ${outcome}` };
  if (state.completed[stageId]) return { error: `阶段 ${stageId} 已经完成；回环请先通过回边重新激活` };
  if (!state.active.includes(stageId) && !state.ready.includes(stageId)) {
    return { error: `阶段 ${stageId} 尚未就绪（ready: ${state.ready.join(', ') || '无'}）` };
  }

  const stage = graph.stageMap.get(stageId);
  const visit = (state.visits[stageId] || 0) + 1;
  state.visits[stageId] = visit;
  state.completed[stageId] = true;
  state.lastOutcome[stageId] = outcome;
  state.lastStatus[stageId] = event?.status == null ? null : String(event.status);
  state.ready = state.ready.filter((id) => id !== stageId);
  state.active = state.active.filter((id) => id !== stageId);
  const startedAt = state.startedAt[stageId] ?? null;
  delete state.startedAt[stageId];

  // 消费所有进入本阶段的边激活，避免下次 reset 后误触发。
  for (const inEdge of graph.incoming.get(stageId) || []) delete state.activated[inEdge.key];

  const outs = graph.outgoing.get(stageId) || [];
  const taken = [];
  for (const edge of outs) {
    if (!edgeConditionMatches(edge.when, outcome, state.lastStatus[stageId])) continue;
    const count = (state.traversals[edge.key] || 0) + 1;
    if (edge.limit != null && count > edge.limit) {
      return { error: `边 ${edge.from} -> ${edge.to} 超过 limit=${edge.limit}` };
    }
    state.traversals[edge.key] = count;
    taken.push(edge);

    if (isLoopEdge(graph, edge)) {
      const reset = downstreamCone(graph, edge.to);
      for (const id of reset) {
        delete state.completed[id];
        delete state.startedAt[id];
      }
      state.active = state.active.filter((id) => !reset.has(id));
      state.ready = state.ready.filter((id) => !reset.has(id));
      for (const inner of graph.edges) {
        if (reset.has(inner.from)) delete state.activated[inner.key];
      }
    }
    state.activated[edge.key] = true;
  }

  if (outs.length && !taken.length) {
    return { error: `阶段 ${stageId} 完成（${outcome}），但没有匹配的出边；请补一条 always 或对应条件的边` };
  }
  if (!outs.length && outcome === 'fail') {
    return { error: `终点阶段 ${stageId} 以 fail 结束；终点必须 pass` };
  }

  state.events.push({
    seq: state.events.length + 1,
    stage: stageId,
    visit,
    outcome,
    status: state.lastStatus[stageId],
    startedAt,
    endedAt: event?.at ?? null,
    parallelGroup: event?.parallelGroup ?? null,
    changed: asArray(event?.changedPaths).map(String),
    edgesTaken: taken.map((edge) => ({ from: edge.from, to: edge.to, when: edge.when, limit: edge.limit })),
  });

  recomputeReady(state, graph);
  return {
    state,
    graph,
    ready: readyStages(state),
    finished: state.finished,
    event: state.events[state.events.length - 1],
    stage,
  };
}

/** 按轨迹重放，校验事件顺序、条件边、汇合、回环和结束状态。 */
export function replayTrace(flow, trace) {
  const validation = validateGraph(flow);
  if (!validation.ok) return { ok: false, errors: validation.errors, warnings: validation.warnings };
  const graph = validation.graph;
  const state = createState(flow);
  const errors = [];
  const events = asArray(trace?.events);

  if (trace?.flow && graph.name && trace.flow !== graph.name) {
    errors.push(`轨迹 flow=${trace.flow} 与流程 ${graph.name} 不一致`);
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const stageId = event?.stage;
    const visit = (state.visits[stageId] || 0) + 1;
    if (event?.visit != null && Number(event.visit) !== visit) {
      errors.push(`事件 ${i + 1}（${stageId}）visit=${event.visit}，重放得到 ${visit}`);
      break;
    }
    const result = completeStage(state, flow, {
      stageId,
      outcome: event?.outcome,
      status: event?.status,
      parallelGroup: event?.parallel_group ?? event?.parallelGroup,
      changedPaths: event?.changed,
      at: event?.ended_at ?? event?.endedAt,
    });
    if (result.error) {
      errors.push(`事件 ${i + 1}（${stageId}）: ${result.error}`);
      break;
    }
  }

  if (!errors.length) {
    if (trace?.finished === true) {
      if (!state.finished) errors.push('轨迹标记 finished，但重放后流程未结束');
    } else if (state.finished) {
      errors.push('重放后流程已结束，但轨迹未标记 finished');
    }
    if (!trace?.finished && (state.ready.length || state.active.length)) {
      // 未完成的轨迹允许保留在 flow-trace.json 里，CI 只在 finished 时强校验。
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: validation.warnings,
    graph,
    state,
  };
}

/** 提取产物 frontmatter 里的 status。 */
export function extractStatus(text) {
  if (typeof text !== 'string') return null;
  const front = text.match(/^﻿?---\s*\n([\s\S]*?)\n---/);
  const target = front ? front[1] : text;
  const match = target.match(/^\s*status:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  return match ? match[1].trim() : null;
}

/**
 * 纯函数：根据产物内容判断阶段门禁。
 * artifact 为 null 表示该阶段没有 artifact；exists 表示文件/目录是否存在。
 */
export function evaluateStageGate(stage, { artifactText = null, exists = false, isDirectory = false, isText = null } = {}) {
  if (!stage?.artifact) return { ok: true, status: null, reason: '阶段没有 artifact，跳过产物门禁' };
  if (!exists) return { ok: false, status: null, reason: `产物不存在: ${stage.artifact}` };
  if (isDirectory) return { ok: true, status: null, reason: '目录产物存在' };
  const textMode = isText == null ? artifactText != null : isText;
  if (!textMode) return { ok: true, status: null, reason: '非文本产物存在' };
  if (artifactText == null) return { ok: false, status: null, reason: `无法读取产物: ${stage.artifact}` };
  const status = extractStatus(artifactText);
  const expected = stage.gate || 'done';
  if (status !== expected) return { ok: false, status, reason: `产物 status=${status ?? '缺失'}，需要 ${expected}` };
  return { ok: true, status, reason: `status: ${status}` };
}

/* ---------------- 图布局 ---------------- */

/** 为编辑器计算分层布局。返回节点坐标、边的贝塞尔路径和回边标记。 */
export function layoutGraph(flow) {
  const graph = normalizeFlow(flow);
  const ids = graph.stages.map((stage) => stage.id);
  if (!ids.length) return { width: 0, height: 0, nodes: [], edges: [], warnings: [] };

  // DFS 去回边，得到一个可分层的 DAG。
  const state = new Map(); // id -> 0/1/2
  const backEdges = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const edge of graph.outgoing.get(id) || []) {
      const next = state.get(edge.to) || 0;
      if (next === 1) backEdges.add(edge.key);
      else if (next === 0) visit(edge.to);
    }
    state.set(id, 2);
  };
  const starts = graph.starts.length ? graph.starts : [ids[0]];
  for (const id of starts) if (!state.get(id)) visit(id);
  for (const id of ids) if (!state.get(id)) visit(id);

  const dagEdges = graph.edges.filter((edge) => !backEdges.has(edge.key));
  const indegree = new Map(ids.map((id) => [id, 0]));
  const dagOut = new Map(ids.map((id) => [id, []]));
  for (const edge of dagEdges) {
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    dagOut.get(edge.from)?.push(edge.to);
  }
  const queue = ids.filter((id) => (indegree.get(id) || 0) === 0);
  const layers = new Map();
  for (const id of queue) layers.set(id, 0);
  while (queue.length) {
    const id = queue.shift();
    for (const next of dagOut.get(id) || []) {
      layers.set(next, Math.max(layers.get(next) ?? 0, (layers.get(id) ?? 0) + 1));
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // 环内节点可能没有进入队列；给它们一个稳定的层号。
  let fallback = Math.max(-1, ...layers.values()) + 1;
  for (const id of ids) if (!layers.has(id)) layers.set(id, fallback++);

  const byLayer = new Map();
  for (const id of ids) {
    const layer = layers.get(id) || 0;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(id);
  }
  const maxRows = Math.max(...[...byLayer.values()].map((list) => list.length), 1);
  const totalHeight = maxRows * (NODE_HEIGHT + GAP_Y);
  const nodes = [];
  for (const [layer, list] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    const offset = (totalHeight - list.length * (NODE_HEIGHT + GAP_Y)) / 2;
    list.forEach((id, row) => {
      nodes.push({
        id,
        stage: graph.stageMap.get(id),
        layer,
        row,
        x: 16 + layer * (NODE_WIDTH + GAP_X),
        y: 16 + offset + row * (NODE_HEIGHT + GAP_Y),
        w: NODE_WIDTH,
        h: NODE_HEIGHT,
      });
    });
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return { ...edge, path: '', labelX: 0, labelY: 0, isBack: false };
    const isBack = backEdges.has(edge.key) || to.x <= from.x;
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    let path;
    let labelX;
    let labelY;
    let addX;
    let addY;
    if (isBack) {
      const y = Math.max(from.y + from.h, to.y + to.h) + ARC_OFFSET;
      path = `M ${x1} ${y1} C ${x1 + 40} ${y}, ${x2 - 40} ${y}, ${x2} ${y2}`;
      addX = (x1 + x2) / 2;
      addY = y;
      labelX = addX;
      labelY = y - 10;
    } else {
      const mid = (x1 + x2) / 2;
      path = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
      addX = mid;
      addY = (y1 + y2) / 2;
      labelX = mid;
      labelY = addY - 10;
    }
    return { ...edge, path, labelX, labelY, addX, addY, isBack };
  });

  const width = Math.max(...nodes.map((node) => node.x + node.w), 0) + 16;
  const height = Math.max(totalHeight + 32, ...edges.map((edge) => (edge.isBack ? edge.labelY + ARC_OFFSET : 0)), 72);
  return { width, height, nodes, edges, warnings: validateGraph(flow).warnings };
}

/* ---------------- 内部工具 ---------------- */

/** Tarjan SCC。 */
function computeSccs(ids, edges) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const groups = [];
  let counter = 0;

  const out = new Map(ids.map((id) => [id, []]));
  for (const edge of edges) out.get(edge.from)?.push(edge.to);

  const strong = (id) => {
    index.set(id, counter);
    low.set(id, counter);
    counter += 1;
    stack.push(id);
    onStack.add(id);
    for (const next of out.get(id) || []) {
      if (!index.has(next)) {
        strong(next);
        low.set(id, Math.min(low.get(id), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id), index.get(next)));
      }
    }
    if (low.get(id) === index.get(id)) {
      const group = [];
      let item;
      do {
        item = stack.pop();
        onStack.delete(item);
        group.push(item);
      } while (item !== id);
      groups.push(group.reverse());
    }
  };

  for (const id of ids) if (!index.has(id)) strong(id);
  return { groups };
}
