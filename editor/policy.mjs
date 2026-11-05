// 根据 flow.yaml 生成 skillgate 策略骨架。
// 浏览器和 Node 共用；生成的 policy 只覆盖流程阶段，测试命令仍需人工替换。

export function generatePolicy(flow, options = {}) {
  if (!flow) return null;
  const isGraph = Number(flow.version) >= 3;
  const dir = String(flow.artifacts || '').replace(/\/current\/?$/, '');
  if (!flow.artifacts) {
    return {
      name: flow.name,
      finishLine: ['git push'],
      timeout: 600000,
      gates: [
        { id: 'instruction-sync', type: 'instruction-sync', level: 'warn' },
        { id: 'instruction-refs', type: 'instruction-refs', level: 'warn' },
      ],
    };
  }

  const gates = [];
  const phaseRequires = {};
  const phaseOrder = [];

  for (const s of flow.stages || []) {
    if (!s.artifact) continue;
    // archive 阶段的 artifact 直接写成归档目录（如 docs/specs），不再拼到 current 下面。
    const isArchiveArtifact = flow.archive
      && (s.artifact === flow.archive || s.artifact.startsWith(`${flow.archive}/`));
    const file = isArchiveArtifact ? s.artifact : `${flow.artifacts}/${s.artifact}`;
    const changed = isArchiveArtifact ? [`${flow.archive}/**`] : [`${dir}/*/${s.artifact}`];
    const gateId = `${s.id}-${s.gate || 'done'}`;
    const isText = /\.(md|markdown|txt|ya?ml)$/.test(s.artifact);
    const gate = isText && !isArchiveArtifact
      ? { id: gateId, type: 'file-contains', file, pattern: `status: ${s.gate || 'done'}` }
      : { id: gateId, type: 'file-exists', file };
    gate.when = { changed };
    gates.push(gate);
    phaseRequires[s.id] = [gateId];
    phaseOrder.push(s.id);
  }

  const verify = (flow.stages || []).find((s) => s.id === 'verify');
  if (verify && phaseRequires[verify.id]) {
    gates.push({
      id: 'tests-pass',
      type: 'command',
      timeout: 540000,
      run: options.testsCommand || `sh -c 'echo "TODO: 换成项目测试命令"; exit 1'`,
      when: { changed: [`${dir}/*/${verify.artifact || '40-verify.md'}`] },
    });
    phaseRequires[verify.id].push('tests-pass');
  }

  gates.push({ id: 'instruction-sync', type: 'instruction-sync', level: 'warn' });
  gates.push({ id: 'instruction-refs', type: 'instruction-refs', level: 'warn' });

  if (flow.archive) {
    gates.push({
      id: 'archive-indexed',
      type: 'command',
      run: `sh -c 'grep -q "$(basename "$(readlink ${flow.artifacts})")" ${flow.archive}/INDEX.md'`,
      when: { changed: [`${flow.archive}/INDEX.md`] },
    });
  }

  // v3 图流程不能用线性的 phase marker；改由 flow-trace 在 CI 重放执行轨迹。
  if (isGraph) {
    gates.push({
      id: 'flow-trace',
      type: 'command',
      run: `node .claude/flows/flow-trace-check.mjs ${flow.name} ${flow.artifacts}/flow-trace.json`,
      when: { changed: [`${dir}/**`] },
    });
  } else if (phaseOrder.length) {
    gates.push({
      id: 'phases',
      type: 'phase',
      when: { changed: [`${dir}/**`] },
      phases: phaseOrder.map((id) => ({ id, requires: phaseRequires[id] })),
    });
  }

  return { name: flow.name, finishLine: ['git push'], timeout: 600000, gates };
}
