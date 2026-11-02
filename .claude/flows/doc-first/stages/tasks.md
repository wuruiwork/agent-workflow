# 阶段 3：任务拆分（tasks）

前置：`docs/specs/current/10-design.md` 的 `status` 为 `approved`。
产物：`docs/specs/current/20-tasks.md`，状态 `approved` 后才能推进到 `implement`。

## 只负责

- 把已确认的设计拆成有序、可验收的任务。
- 标注依赖、可并行项、会话边界、相对大小。
- 写 `20-tasks.md`。

## 不负责

- 不重新做技术选型、不改设计结论。
- 不写代码、不写测试代码、不承诺工时。
- 不修改 `.skillgate/phase`。

## 规则

1. 一个任务应能在一次会话完成；涉及文件 ≤5，超过继续拆。
2. 每个任务必须有：目标、涉及文件、验收标准、验证方式、依赖、大小、状态。
3. 验收标准必须可判定：测试名、命令与预期输出、接口响应、页面行为；禁止“完成功能”。
4. 按依赖排序；无依赖且互不冲突的标记可并行。
5. 覆盖设计的“实现步骤”和“测试策略”；遗漏要说明原因。
6. 不新增设计中不存在的模块、接口或数据结构。
7. 相对大小只用 S / M / L；不写小时或人天。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | approved
created: YYYY-MM-DD
author: Claude
design_ref: docs/specs/current/10-design.md
---

# <功能名称> 任务清单

## 总览

| ID | 任务 | 依赖 | 大小 | 可并行 | 状态 |
|---|---|---|---|---|---|
| T1 | ... | - | S | - | todo |

状态：`todo` / `doing` / `done`。

## 会话划分

（设计未要求拆分时写“单会话完成”。）

## 任务详情

### T1 <任务名称>

- 目标：
- 涉及文件：
- 验收标准：
  - [ ] <可验证结果>
- 验证方式：
- 依赖：
- 大小：
- 状态：todo
- 设计依据：<10-design.md 章节号>
```

## 完成

- 用户确认后改为 `approved`。
- runner 执行：
  `npx --yes @reneza/skillgate@0.16.0 phase tasks`
