# 阶段 2a：设计（design）

本阶段与 `research` 并发执行。只写 `docs/specs/current/10-design.md`，
状态为 `done` 后进入 `tasks`（join: all）。

## 只负责

- 基于 `00-brief.md` 写技术方案：结构、接口、数据流、取舍和风险。
- 写 `10-design.md`。

## 不负责

- 不写代码、不写任务清单、不修改 `15-research.md`。
- 不跑 git、不写状态文件。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | done
---

# 设计

## 1. 方案概览

## 2. 关键模块与接口

## 3. 数据流

## 4. 取舍与风险

## 5. 对任务拆分的输入
```

## 完成

- 写完后把 `status` 改为 `done`。
- 不要自己调用 `flow-state complete`；runner 会等并发的 research 一起结束。
