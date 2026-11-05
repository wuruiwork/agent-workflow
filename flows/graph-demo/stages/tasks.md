# 阶段 3：任务拆分（tasks）

前置：`design` 和 `research` 都已完成（`join: all`）。产物是
`docs/specs/current/20-tasks.md`，状态为 `approved` 后进入 `implement`。

## 只负责

- 合并 `10-design.md` 和 `15-research.md` 的结论，拆出可执行任务。
- 每个任务写清验收标准、涉及文件和依赖顺序。
- 写 `20-tasks.md`。

## 不负责

- 不写代码、不重新做设计或调研。
- 不跑 git、不写状态文件。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | approved
---

# 任务清单

## 依赖顺序

## 任务

- [ ] T1：<任务>
  - 验收：
  - 涉及文件：

## 风险
```

## 完成

- 用户确认后把 `status` 改为 `approved`。
- runner 会调用 `flow-state complete --stage tasks --outcome pass`。
