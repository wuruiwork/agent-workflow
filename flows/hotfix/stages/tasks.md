# 阶段 2：单任务拆分（tasks）

前置：`docs/specs/current/10-design.md` 的 `status` 为 `approved`。
产物：`docs/specs/current/20-tasks.md`，状态 `approved`。

## 规则

1. 优先拆成 1 个任务；确实需要多个时，每个任务一次会话可完成。
2. 每个任务写清：目标、涉及文件、验收标准、验证方式。
3. 验收标准必须可判定，不能写“修复问题”。
4. 不新增设计之外的改动。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | approved
created: YYYY-MM-DD
design_ref: docs/specs/current/10-design.md
---

# <问题标题> 修复任务

## 总览

| ID | 任务 | 依赖 | 大小 | 状态 |
|---|---|---|---|---|
| T1 | ... | - | S | todo |

## 任务详情

### T1 <任务名称>

- 目标：
- 涉及文件：
- 验收标准：
  - [ ] <可验证结果>
- 验证方式：
- 状态：todo
```

## 完成

用户确认后改为 `approved`，然后执行：

```bash
npx --yes @reneza/skillgate@0.16.0 phase tasks
```
