# 阶段 2b：调研（research）

本阶段与 `design` 并发执行。只写 `docs/specs/current/15-research.md`，
状态为 `done` 后进入 `tasks`（join: all）。

## 只负责

- 调研现有实现、依赖、约束和可复用方案。
- 写 `15-research.md`，给出可执行结论。

## 不负责

- 不写设计文档、不写代码、不修改 `10-design.md`。
- 不跑 git、不写状态文件。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | done
---

# 调研

## 1. 调研问题

## 2. 现有实现与依赖

## 3. 可选方案对比

## 4. 结论与建议
```

## 完成

- 写完后把 `status` 改为 `done`。
- 不要自己调用 `flow-state complete`；runner 会等并发的 design 一起结束。
