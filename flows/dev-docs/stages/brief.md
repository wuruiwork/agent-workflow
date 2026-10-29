# 阶段 1：文档简报（brief）

产物：`docs/deliverables/current/00-brief.md`，状态 `approved` 后才能进入 draft。

## 只负责

- 明确文档类型、读者、目标、范围、来源材料和交付格式。
- 确认是否需要模板、品牌规范、页数/篇幅限制。
- 写 `00-brief.md`。

## 规则

1. 先读仓库现有文档和代码，能自己确认的不问用户。
2. 一次最多问 5 个关键问题，每个附推荐答案。
3. 成功标准必须可判定：读者能完成什么、必须包含哪些章节、哪些内容明确不写。
4. 有开放问题时只能 `draft`；用户确认后改 `approved`。
5. 不写正文，不写代码。

## 模板

```markdown
---
feature: <YYYY-MM-DD-kebab-name>
status: draft  # draft | approved
created: YYYY-MM-DD
---

# <文档名称> 简报

## 1. 文档类型
（开发指南 / 架构说明 / API 参考 / 设计文档 / 运维手册 / 其他）

## 2. 读者
## 3. 目标与成功标准
## 4. 范围与非目标
## 5. 来源材料
（README、docs/、代码、接口定义、会议记录等）

## 6. 交付格式
（Word / PDF；是否需要模板、品牌、页数）

## 7. 章节草案
## 8. 开放问题
```

## 完成

用户确认后改为 `approved`，runner 执行：

```bash
npx --yes @reneza/skillgate@0.16.0 phase brief
```
