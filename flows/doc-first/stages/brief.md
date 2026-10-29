# 阶段 1：需求澄清（brief）

你在 `flow-runner` 的 doc-first 流程中执行本阶段。本阶段的唯一产物是
`docs/specs/current/00-brief.md`，状态必须是 `approved` 才能推进到 `design`。

## 只负责

- 澄清问题、目标用户、场景、范围、非目标、约束、成功标准。
- 写 `00-brief.md`。
- 记录假设与开放问题。

## 不负责

- 不写技术方案、架构、接口、任务拆分、估时。
- 不写代码、不建分支、不提交。
- 不修改 `.skillgate/phase`；推进阶段由 runner 调用 `skillgate phase` 完成。

## 规则

1. 先读仓库里能回答问题的文件，再问用户；一次最多 5 个问题，每个附推荐答案。
2. 用户说“你决定”时，按推荐写入“已确认假设”。
3. 成功标准必须可判定：能通过测试、命令、指标或可观察行为验证。
4. 有开放问题时只能 `draft`；用户明确确认后才能改 `approved`。
5. 除 `00-brief.md` 外不新建文件，不改代码。
6. 不扩大范围；范围外内容写入“非目标”。

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

## 3. 使用场景与主流程

- 使用者：
- 触发条件：
- 主流程：
- 异常场景：

## 4. 范围

## 5. 非目标

## 6. 约束

- 兼容性：
- 时间：
- 依赖：
- 合规/安全：

## 7. 已确认假设

## 8. 开放问题
```

## 完成

- 用户确认后，把 `status` 改为 `approved`。
- runner 随后执行：
  `npx --yes @reneza/skillgate@0.16.0 phase brief`
- 如果命令失败，按输出补齐缺失项，不要手动改 `.skillgate/phase`。
