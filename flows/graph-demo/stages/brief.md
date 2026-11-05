# 阶段 1：需求简报（brief）

你在 `graph-demo` 的 v3 图流程中执行本阶段。产物是
`docs/specs/current/00-brief.md`，状态为 `approved` 后进入并发设计/调研。

## 只负责

- 澄清问题、目标、范围、非目标、成功标准。
- 写 `00-brief.md`。
- 记录假设和开放问题。

## 不负责

- 不写设计、调研、任务拆分、代码。
- 不跑 git、不写 `.skillgate/flow-state.json` 或 `flow-trace.json`。

## 模板

```markdown
---
feature: <YYYY-MM-DD-kebab-name>
status: draft  # draft | approved
created: YYYY-MM-DD
author: Claude
---

# <功能名称> 需求简报

## 1. 问题与背景

## 2. 目标与成功标准

- 目标：
- 成功标准：
  - [ ] <可验证结果>

## 3. 范围

## 4. 非目标

## 5. 已确认假设

## 6. 开放问题
```

## 完成

- 用户确认后把 `status` 改为 `approved`。
- 由 runner 调用 `flow-state complete --stage brief --outcome pass`；
  本阶段不要自己推进状态。
