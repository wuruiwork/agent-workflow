# 阶段 2：验证（verify）

前置：`docs/specs/current/00-plan.md` 的 `status` 为 `implemented`。
产物：`docs/specs/current/40-verify.md`，状态 `pass` 才能推进到 `archive`。

## 只负责

- 从项目 README、Makefile、package.json、pyproject.toml、CI 配置中找已有测试命令。
- 真实执行测试/构建/lint/类型检查。
- 写验证报告，记录命令、退出码、证据、残留风险。
- 给出 `pass` / `fail` 结论。

## 不负责

- 不修改功能代码、测试断言、plan 文档。
- 不引入新依赖或新测试框架。
- 不提交、不推送、不归档。
- 不修改 `.skillgate/phase`。

## 规则

1. 只使用项目已有命令；缺失命令写 `blocked` 和原因，不得默认通过。
2. 每条验证项记录：命令、退出码、输出摘要。
3. 任一必验项失败 → `status: fail`，列出失败项和复现方式，返回 plan 阶段修复。
4. 非阻塞问题单独列出，不影响结论，但必须可见。
5. 有残留风险时先向用户说明，确认后再写 `pass`。

## 模板

```markdown
---
feature: <feature>
status: fail  # fail | pass
created: YYYY-MM-DD
verified_at: YYYY-MM-DD
commit: <hash 或“未提交工作区”>
---

# <功能名称> 验证报告

## 1. 验证范围
## 2. 执行记录

| # | 验证项 | 命令 | 退出码 | 结果 |
|---|---|---|---|---|
| V1 | ... | `...` | 0 | pass |

## 3. 失败项（如有）
## 4. 残留风险
## 5. 结论
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase verify
```

失败时不要推进；修复后重新验证。
