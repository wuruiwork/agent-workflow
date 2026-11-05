import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createState,
  completeStage,
  evaluateStageGate,
  layoutGraph,
  normalizeFlow,
  readyStages,
  replayTrace,
  startStage,
  validateGraph,
} from '../skills/flow-runner/scripts/flow-graph.mjs';

function flow(stages, edges = null) {
  return {
    name: 'test-flow',
    version: edges ? 3 : 2,
    artifacts: 'docs/specs/current',
    stages: stages.map((stage) => (typeof stage === 'string' ? { id: stage } : stage)),
    ...(edges ? { edges } : {}),
  };
}

function startAndComplete(state, f, stageId, outcome = 'pass', extra = {}) {
  const started = startStage(state, f, stageId);
  assert.equal(started.error, undefined, started.error);
  const done = completeStage(state, f, { stageId, outcome, ...extra });
  assert.equal(done.error, undefined, done.error);
  return done;
}

test('v2 流程按数组顺序线性推进', () => {
  const f = flow(['a', 'b', 'c']);
  assert.equal(validateGraph(f).ok, true);
  assert.deepEqual(normalizeFlow(f).edges.map((edge) => [edge.from, edge.to]), [['a', 'b'], ['b', 'c']]);

  const state = createState(f);
  assert.deepEqual(readyStages(state), ['a']);
  startAndComplete(state, f, 'a');
  assert.deepEqual(state.ready, ['b']);
  startAndComplete(state, f, 'b');
  assert.deepEqual(state.ready, ['c']);
  const last = startAndComplete(state, f, 'c');
  assert.equal(last.finished, true);
  assert.deepEqual(state.events.map((event) => event.stage), ['a', 'b', 'c']);
});

test('v3 条件分支：fail 走 fix，fix 回 review，pass 后继续', () => {
  const f = flow(
    ['s', 'review', 'fix', 'verify', 'end'],
    [
      { from: 's', to: 'review' },
      { from: 'review', to: 'verify', when: 'pass' },
      { from: 'review', to: 'fix', when: 'fail' },
      { from: 'fix', to: 'review', limit: 3 },
      { from: 'verify', to: 'end' },
    ],
  );
  assert.equal(validateGraph(f).ok, true, validateGraph(f).errors.join('\n'));

  const state = createState(f);
  startAndComplete(state, f, 's');
  startAndComplete(state, f, 'review', 'fail');
  assert.deepEqual(state.ready, ['fix']);
  startAndComplete(state, f, 'fix');
  assert.deepEqual(state.ready, ['review']);
  startAndComplete(state, f, 'review', 'pass');
  assert.deepEqual(state.ready, ['verify']);
  startAndComplete(state, f, 'verify');
  const end = startAndComplete(state, f, 'end');
  assert.equal(end.finished, true);
  assert.equal(state.visits.review, 2);
  assert.equal(state.traversals['fix->review#3'], 1);
});

test('回环 limit 超限会停止', () => {
  const f = flow(
    ['s', 'review', 'fix', 'end'],
    [
      { from: 's', to: 'review' },
      { from: 'review', to: 'fix', when: 'fail' },
      { from: 'review', to: 'end', when: 'pass' },
      { from: 'fix', to: 'review', limit: 2 },
    ],
  );
  const state = createState(f);
  startAndComplete(state, f, 's');
  for (let i = 0; i < 2; i++) {
    startAndComplete(state, f, 'review', 'fail');
    startAndComplete(state, f, 'fix');
  }
  startAndComplete(state, f, 'review', 'fail');
  const started = startStage(state, f, 'fix');
  assert.equal(started.error, undefined);
  const failed = completeStage(state, f, { stageId: 'fix', outcome: 'pass' });
  assert.match(failed.error, /limit=2/);
});

test('fan-out / fan-in：join all 等待两个分支，完成顺序无关', () => {
  for (const order of [['a', 'b'], ['b', 'a']]) {
    const f = flow(
      ['s', 'a', 'b', 'j', 'end'],
      [
        { from: 's', to: 'a' },
        { from: 's', to: 'b' },
        { from: 'a', to: 'j' },
        { from: 'b', to: 'j' },
        { from: 'j', to: 'end' },
      ].map((edge) => (edge.to === 'j' ? edge : edge)),
    );
    f.stages.find((stage) => stage.id === 'j').join = 'all';
    const state = createState(f);
    startAndComplete(state, f, 's');
    assert.deepEqual(new Set(state.ready), new Set(['a', 'b']));
    const startedA = startStage(state, f, 'a');
    const startedB = startStage(state, f, 'b');
    assert.equal(startedA.error, undefined);
    assert.equal(startedB.error, undefined);
    for (const id of order) {
      const done = completeStage(state, f, { stageId: id, outcome: 'pass' });
      assert.equal(done.error, undefined, done.error);
    }
    assert.deepEqual(state.ready, ['j']);
    startAndComplete(state, f, 'j');
    const end = startAndComplete(state, f, 'end');
    assert.equal(end.finished, true);
  }
});

test('join any：条件分支在 verify 汇合', () => {
  const f = flow(
    ['s', 'review', 'fix', 'verify', 'end'],
    [
      { from: 's', to: 'review' },
      { from: 'review', to: 'verify', when: 'pass' },
      { from: 'review', to: 'fix', when: 'fail' },
      { from: 'fix', to: 'verify' },
      { from: 'verify', to: 'end' },
    ],
  );
  for (const failFirst of [false, true]) {
    const state = createState(f);
    startAndComplete(state, f, 's');
    startAndComplete(state, f, 'review', failFirst ? 'fail' : 'pass');
    if (failFirst) {
      assert.deepEqual(state.ready, ['fix']);
      startAndComplete(state, f, 'fix');
    }
    assert.deepEqual(state.ready, ['verify']);
    startAndComplete(state, f, 'verify');
    assert.equal(startAndComplete(state, f, 'end').finished, true);
  }
});

test('非终点阶段没有匹配出边会报错', () => {
  const f = flow(
    ['s', 'review', 'end'],
    [
      { from: 's', to: 'review' },
      { from: 'review', to: 'end', when: 'pass' },
    ],
  );
  const state = createState(f);
  startAndComplete(state, f, 's');
  const started = startStage(state, f, 'review');
  assert.equal(started.error, undefined);
  const done = completeStage(state, f, { stageId: 'review', outcome: 'fail' });
  assert.match(done.error, /没有匹配的出边/);
});

test('图校验：起点、可达性、回环 limit、条件合法', () => {
  const multipleStarts = flow(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a', limit: 2 }]);
  assert.ok(validateGraph(multipleStarts).errors.some((error) => error.includes('起点')));

  const unreachable = flow(
    ['a', 'b', 'c', 'd'],
    [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'c', limit: 2 },
    ],
  );
  assert.ok(validateGraph(unreachable).errors.some((error) => error.includes('不可达')));

  const noLimit = flow(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]);
  assert.ok(validateGraph(noLimit).errors.some((error) => error.includes('limit')));

  const badWhen = flow(['a', 'b'], [{ from: 'a', to: 'b', when: 'sometimes' }]);
  assert.ok(validateGraph(badWhen).errors.some((error) => error.includes('when')));
});

test('轨迹重放：合法轨迹通过，篡改顺序被拒绝', () => {
  const f = flow(
    ['s', 'review', 'fix', 'verify', 'end'],
    [
      { from: 's', to: 'review' },
      { from: 'review', to: 'verify', when: 'pass' },
      { from: 'review', to: 'fix', when: 'fail' },
      { from: 'fix', to: 'review', limit: 3 },
      { from: 'verify', to: 'end' },
    ],
  );
  const state = createState(f);
  startAndComplete(state, f, 's');
  startAndComplete(state, f, 'review', 'fail');
  startAndComplete(state, f, 'fix');
  startAndComplete(state, f, 'review', 'pass');
  startAndComplete(state, f, 'verify');
  startAndComplete(state, f, 'end');
  const trace = { flow: 'test-flow', events: state.events, finished: true };
  const good = replayTrace(f, trace);
  assert.equal(good.ok, true, good.errors.join('\n'));

  const tampered = { ...trace, events: [trace.events[1], trace.events[0], ...trace.events.slice(2)] };
  const bad = replayTrace(f, tampered);
  assert.equal(bad.ok, false);
});

test('布局：回边被标记，节点坐标完整', () => {
  const f = flow(
    ['s', 'review', 'fix', 'verify', 'end'],
    [
      { from: 's', to: 'review' },
      { from: 'review', to: 'verify', when: 'pass' },
      { from: 'review', to: 'fix', when: 'fail' },
      { from: 'fix', to: 'review', limit: 3 },
      { from: 'verify', to: 'end' },
    ],
  );
  const layout = layoutGraph(f);
  assert.equal(layout.nodes.length, 5);
  assert.equal(layout.edges.length, 5);
  assert.ok(layout.edges.some((edge) => edge.isBack));
  assert.ok(layout.width > 0 && layout.height > 0);
  assert.ok(layout.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test('产物门禁：文本 status、目录存在、缺失', () => {
  assert.deepEqual(
    evaluateStageGate({ artifact: '00-brief.md', gate: 'approved' }, { artifactText: '---\nstatus: approved\n---\n', exists: true }),
    { ok: true, status: 'approved', reason: 'status: approved' },
  );
  assert.equal(
    evaluateStageGate({ artifact: '00-brief.md', gate: 'approved' }, { artifactText: '---\nstatus: draft\n---\n', exists: true }).ok,
    false,
  );
  assert.equal(
    evaluateStageGate({ artifact: 'docs/specs' }, { exists: true, isDirectory: true }).ok,
    true,
  );
  assert.equal(evaluateStageGate({ artifact: '00-brief.md', gate: 'approved' }, { exists: false }).ok, false);
});
