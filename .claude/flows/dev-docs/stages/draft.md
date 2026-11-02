# 阶段 2：草稿（draft）

前置：`00-brief.md` 的 `status` 为 `approved`。
产物：`docs/deliverables/current/10-draft.md`，状态 `approved`。

采用 `doc-coauthoring` 的三段式流程，但产物先落 Markdown：

## 1. 上下文收集

- 读 brief 指定的来源材料、相关代码和现有文档。
- 向用户确认：读者已有知识、必须回答的问题、不能出现的错误、术语表。
- 把事实、命令、路径、接口都对照仓库验证，不凭记忆写。

## 2. 结构与迭代

- 先给章节大纲，得到确认后再逐节写。
- 每节先写要点，再扩成完整段落。
- 命令、路径、版本、接口必须可复制执行；不能确认的写「待确认」，不编造。
- 代码块标语言；表格只放适合表格的信息。

## 3. 读者测试

- 假设读者没有上下文，通读草稿：
  - 能否在开头知道“这是什么、给谁、读完能做什么”；
  - 能否按文档完成第一个任务；
  - 是否有关键前置、限制、失败处理；
  - 是否有未解释的术语或断链。
- 把发现的问题修回草稿。

## 规则

- 不写代码、不改仓库实现。
- 不把 README/AGENTS.md 的内容整段复制；需要时链接。
- 草稿只写事实；计划、猜测、未验证的行为单独标注。

## 模板

```markdown
---
feature: <feature>
status: draft  # draft | approved
created: YYYY-MM-DD
brief_ref: docs/deliverables/current/00-brief.md
---

# <文档标题>

## 1. 这是什么
## 2. 适用读者与前置条件
## 3. 快速开始
## 4. 核心概念
## 5. 任务/操作指南
## 6. 参考（命令、接口、配置）
## 7. 故障处理
## 8. 限制与非目标
## 9. 延伸阅读
```

## 完成

用户确认内容后改为 `approved`，runner 执行：

```bash
npx --yes @reneza/skillgate@0.16.0 phase draft
```
