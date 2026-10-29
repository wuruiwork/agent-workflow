# 阶段 2：叙事大纲（outline）

前置：`00-brief.md` 的 `status` 为 `approved`。
产物：`presentations/current/10-outline.md`，状态 `approved`。

## 规则

1. 一页只承担一个信息点；页面标题写结论，不写“背景介绍”这类空标题。
2. 结构至少包含：开场钩子 → 问题/现状 → 方案/证据 → 结果/价值 → 下一步/行动。
3. 每页写清：页面任务、标题、关键信息、证据/数据、视觉建议。
4. 数据页必须写数据来源；没有数据就改成定性证据，不编造。
5. 控制页数：按 brief 的时长，通常 1 页/1–2 分钟。
6. 大纲确认前不生成 PPTX。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | approved
created: YYYY-MM-DD
brief_ref: presentations/current/00-brief.md
---

# <演示标题> 大纲

## 叙事主线
一句话：从 <现状> 到 <目标>，因为 <关键证据>。

## 页面清单

| # | 页面任务 | 标题（结论句） | 关键信息 | 证据/数据 | 视觉建议 |
|---|---|---|---|---|---|
| 1 | 开场 | ... | ... | ... | ... |
| 2 | 问题 | ... | ... | ... | ... |

## 时间分配
## 需要补充的素材
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase outline
```
