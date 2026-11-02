# 阶段 1：复现与定位（reproduce）

产物：

- `docs/specs/current/00-repro.md`，状态 `confirmed`
- `docs/specs/current/10-design.md`，状态 `approved`（小型修复方案，可 inline）

## 只负责

- 复现问题，记录环境、步骤、期望/实际。
- 定位根因，确认影响范围。
- 写最小修复方案和验证方式。
- 写两个产物。

## 不负责

- 不改代码、不提交。
- 不做任务拆分（下一步）。
- 不修改 `.skillgate/phase`。

## 规则

1. 必须能稳定复现，或说明为什么无法复现及替代证据。
2. 根因要落到文件/函数/条件，不写“可能有问题”。
3. 修复方案保持最小；不做顺手重构。
4. 影响范围写清：接口、数据、权限、兼容性、回归风险。
5. 用户确认复现和方案后，`00-repro.md` 改 `confirmed`，`10-design.md` 改 `approved`。

## 模板

`00-repro.md`：

```markdown
---
feature: <feature>
status: draft  # draft | confirmed
created: YYYY-MM-DD
---

# <问题标题> 复现报告

## 环境
## 复现步骤
## 期望结果
## 实际结果
## 证据（日志/截图/命令输出）
## 影响范围
## 根因定位
```

`10-design.md`：

```markdown
---
feature: <feature>
status: draft  # draft | approved
created: YYYY-MM-DD
---

# <问题标题> 修复方案

## 根因
## 修复方案（最小改动）
## 涉及文件
## 回归风险
## 验证方式
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase reproduce
```
