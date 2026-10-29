# 阶段 3：内容与证据（content）

前置：`10-outline.md` 已确认。
产物：`presentations/current/20-content.md`，状态 `done`。

## 规则

1. 按大纲逐页收集内容，每条事实带来源（文件、章节、命令输出、截图）。
2. 数据必须可追溯：数字、日期、版本、样本量写清；没有来源的写「待确认」。
3. 引用项目文档时优先用事实，不要整段复制营销文案。
4. 每页控制在 1 个核心信息 + 3–5 个支撑点；超出就拆页。
5. 不生成图片、不写 PPTX；只准备内容。
6. 敏感信息按 brief 的禁止清单过滤。

## 模板

```markdown
---
feature: <feature>
status: done
created: YYYY-MM-DD
outline_ref: presentations/current/10-outline.md
---

# <演示标题> 内容稿

## 第 1 页：<标题>
- 核心信息：
- 支撑点：
- 证据/来源：
- 演讲备注：

## 第 2 页：<标题>
（同上）

## 数据与图表清单

| 图表 | 数据来源 | 指标 | 备注 |
|---|---|---|---|
```

## 完成

```bash
npx --yes @reneza/skillgate@0.16.0 phase content
```
