# 阶段 3：文档评审（review）

前置：`10-draft.md` 的 `status` 为 `approved`。
产物：`docs/deliverables/current/20-review.md`，状态 `pass` 才能进入 build。

## 检查项

1. **事实**：命令、路径、配置、接口、版本是否与仓库一致；能否直接复制执行。
2. **完整**：读者能否从开头走到第一个成功结果；前置条件、限制、失败处理是否齐全。
3. **结构**：标题层级、术语表、交叉引用、目录是否清晰。
4. **链接**：相对链接和锚点是否存在。
5. **边界**：是否把计划写成已实现，是否遗漏“不适用/不支持”的情况。
6. **格式**：代码块语言、表格、命令占位符是否统一。

## 规则

- 只评审，不改草稿正文；发现问题写清单，退回 draft 修复。
- 不修改功能代码，不提交。
- 任何必检项失败 → `status: fail`，不得部分通过。
- 通过后写 `status: pass`。

## 模板

```markdown
---
feature: <feature>
status: fail  # fail | pass
created: YYYY-MM-DD
reviewed_at: YYYY-MM-DD
---

# <文档名称> 评审

## 1. 检查结果

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| R1 | 命令可执行 | pass | `...` |
| R2 | 路径存在 | pass | ... |

## 2. 问题清单
（无则写“无”）

## 3. 结论
pass / fail

## 4. 残留风险
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase review
```
