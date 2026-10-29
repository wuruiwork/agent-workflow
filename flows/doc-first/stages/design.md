# 阶段 2：技术设计（design）

前置：`docs/specs/current/00-brief.md` 的 `status` 为 `approved`。
产物：`docs/specs/current/10-design.md`，状态 `approved` 后才能推进到 `tasks`。

## 只负责

- 读取已确认的 brief 和相关代码。
- 写 `10-design.md`：架构、模块边界、数据流、关键决策、影响范围、风险回滚、测试策略。
- 标注是否需要会话拆分。

## 不负责

- 不重新定义需求；需求有问题退回 brief 阶段。
- 不拆具体任务、不排期、不估时。
- 不写功能代码、不提交、不启动环境。
- 不修改 `.skillgate/phase`。

## 规则

1. 只读代码，不改代码。
2. 设计逐条对应 brief 的成功标准；无法对应就退回 brief。
3. 至少记录一个被否决的替代方案及取舍；确实唯一时写明原因。
4. 影响范围覆盖：文件/模块、接口、兼容性、schema/迁移、权限、状态机、后台任务、缓存、消息队列、配置、监控。
5. 涉及数据库必须列出表、字段、类型、默认值、非空、唯一性、外键、检查约束、索引、注释、历史数据处理。
6. 可写接口签名、数据结构、伪代码，单个片段不超过 10 行。
7. 预计改动 >10 文件、跨模块或跨仓库时，写“需要会话拆分”，具体拆分留给 tasks。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | approved
created: YYYY-MM-DD
author: Claude
brief_ref: docs/specs/current/00-brief.md
---

# <功能名称> 技术设计

## 1. 需求对应

| brief 成功标准 | 本设计如何满足 | 验证方式 |
|---|---|---|

## 2. 架构设计

## 3. 关键决策（含替代方案与取舍）

## 4. 影响范围

## 5. 数据与 schema（如涉及）

## 6. 实现步骤

## 7. 测试策略

## 8. 风险与回滚

## 9. 可观测性

## 10. 后续优化

## 11. 与 brief 的差异
```

## 完成

- 用户确认后改为 `approved`。
- runner 执行：
  `npx --yes @reneza/skillgate@0.16.0 phase design`
