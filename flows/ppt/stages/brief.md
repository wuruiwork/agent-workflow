# 阶段 1：演示简报（brief）

产物：`presentations/current/00-brief.md`，状态 `approved` 后才能进入 outline。

## 只负责

- 明确听众、场合、目标、时长、页数、语言和模板/品牌要求。
- 确认内容来源和不能出现的敏感信息。
- 写 `00-brief.md`。

## 规则

1. 先问清“讲完希望听众做什么/记住什么”，再谈页数。
2. 一次最多问 5 个问题，每个附推荐答案。
3. 明确模板：公司模板、项目模板、ppt-master 的 Brand/Style/Layout，或从零设计。
4. 明确禁止内容：未公开数据、客户名、密钥、内部 IP（除非已批准）。
5. 有开放问题时只能 `draft`；用户确认后改 `approved`。

## 模板

```markdown
---
feature: <YYYY-MM-DD-kebab-name>
status: draft  # draft | approved
created: YYYY-MM-DD
---

# <演示标题> 简报

## 1. 听众
## 2. 场合与目标
（汇报 / 评审 / 路演 / 培训；讲完希望发生什么）

## 3. 时长与页数
## 4. 语言与风格
## 5. 模板与品牌
（现有 .pptx 模板 / 品牌规范 / 从零设计）

## 6. 内容来源
（README、docs/、数据、截图、录屏）

## 7. 必须回答的问题
## 8. 禁止/敏感内容
## 9. 成功标准
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase brief
```
