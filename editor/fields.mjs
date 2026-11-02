// 流程编辑器字段说明。用于页面悬浮提示和 docs/editor-fields.md 的生成。

export const FIELD_GROUPS = [
  {
    title: '流程信息',
    fields: [
      { key: 'flow.name', label: '流程名', tip: '流程的唯一标识，只能用小写字母、数字和连字符。' },
      { key: 'flow.artifacts', label: '产物目录', tip: '流程文档存放的位置，例如 docs/specs/current；第一阶段开始就在这里写文档。' },
      { key: 'flow.description', label: '描述', tip: '一句话说明这个流程做什么，方便在流程列表里区分。' },
      { key: 'flow.archive', label: '归档目录', tip: '流程结束后文档归档到的目录，通常是产物目录去掉 current，例如 docs/specs。' },
      { key: 'flow.checkpoints', label: '动作槽位', tip: 'git 动作可以插入的位置：stage_end（每个阶段结束时）和 finish（流程结束时）。不需要调整时保持默认。' },
    ],
  },
  {
    title: '阶段',
    fields: [
      { key: 'stage.id', label: '阶段标识', tip: '阶段的唯一名字，例如 brief、implement；项目配置里的动作绑定按这个名字匹配。' },
      { key: 'stage.type', label: '类型', tip: 'doc = 按文档执行的人工/写作阶段；skill = 调用一个已有 skill 的阶段。' },
      { key: 'stage.ref', label: '引用', tip: 'doc 类型填阶段文档路径（如 stages/brief.md）；skill 类型直接从仓库已有 skill 里选择。' },
      { key: 'stage.artifact', label: '产物文件', tip: '这个阶段完成时要生成的文件名，例如 00-brief.md；留空表示没有固定产物。' },
      { key: 'stage.gate', label: '状态门禁', tip: '产物 frontmatter 里必须出现的 status 值，例如 approved、done、pass。' },
      { key: 'stage.approval', label: '人工确认', tip: '勾选后，这个阶段的产物必须由你明确确认，才能把状态改成通过。' },
      { key: 'stage.hooks', label: '动作槽位', tip: '这个阶段要触发哪些 git 动作槽位，例如 stage_end；具体执行 commit 还是 push 由项目配置决定。' },
    ],
  },
  {
    title: '阶段动作（git）',
    fields: [
      { key: 'binding.commit', label: '提交', tip: '阶段结束后把改动 git commit。提交信息按阶段类型自动生成。' },
      { key: 'binding.push', label: '推送', tip: '阶段结束后推到远端。推送不等全部验证通过，方便中途保存进度。' },
      { key: 'binding.mr', label: '合并请求', tip: '调用 glab / gh / gitee 创建 MR 或 PR，按项目配置的目标和条件执行。' },
      { key: 'binding.commitType', label: '提交类型', tip: '这个阶段提交时用的前缀，例如 feat、fix、docs；auto 表示按改动内容自动判断。' },
    ],
  },
  {
    title: '项目配置',
    fields: [
      { key: 'project.flows', label: '启用流程', tip: '这个项目允许使用哪些流程。没勾选的流程不会被 flow-runner 提供。' },
      { key: 'project.pushRemote', label: '推送远端', tip: 'git push 的目标远端，通常是你的 fork，例如 origin。' },
      { key: 'project.upstreamRemote', label: '上游远端', tip: '团队主仓库的远端名，例如 upstream；用于同步和跨项目 MR。' },
      { key: 'project.baseBranch', label: '默认分支', tip: '主分支名，通常是 main。在主分支上提交会被拒绝，需要先切分支。' },
      { key: 'project.onBaseBranch', label: '在主分支上', tip: 'refuse = 直接拒绝提交；create = 自动切一个新分支。' },
      { key: 'project.branchPattern', label: '分支命名规则', tip: '允许提交的分支名正则，例如要求以 feat/、fix/、docs/ 开头。' },
      { key: 'project.createFrom', label: '分支来源', tip: '自动建分支时从哪个引用开始，例如 upstream/main。' },
      { key: 'project.commitTypes', label: '提交类型白名单', tip: '允许使用的 commit 前缀，逗号分隔；push 时由门禁检查。' },
      { key: 'project.commitDeny', label: '禁止提交的路径', tip: '敏感或临时文件，例如 .env、.tmp、.skillgate/phase；提交时会自动排除。' },
      { key: 'project.scopeMap', label: 'scope 映射', tip: '按阶段给 commit 加 scope，每行 stage: scope，例如 verify: test。' },
      { key: 'project.actionPushRemote', label: '推送远端（动作）', tip: 'push 动作实际使用的远端名，一般和推送远端一致。' },
      { key: 'project.setUpstream', label: '首次推送设置 upstream', tip: '新分支第一次推送时自动执行 git push -u。' },
      { key: 'project.mrTargets', label: '合并请求目标', tip: '可以配置多个目标：工作分支 → fork main；fork main 满足条件时 → 上游 main。' },
      { key: 'project.mrId', label: '目标标识', tip: '给这个 MR 目标起个名字，例如 review、sync-upstream，方便区分。' },
      { key: 'project.mrHead', label: '源分支', tip: '从哪里合并：current_branch 表示当前工作分支，也可以写 origin/main。' },
      { key: 'project.mrBase', label: '目标分支', tip: '合并到哪里，例如 origin/main；决定 MR 创建在哪个项目。' },
      { key: 'project.mrWhen', label: '触发条件', tip: '总是创建、领先 N 个提交时创建，或主干空闲 N 天时创建；可以组合。' },
      { key: 'project.mrTitle', label: '标题模板', tip: 'MR 标题模板，{ahead} 会替换成领先的提交数。' },
      { key: 'project.mrSections', label: '描述章节', tip: 'MR 描述里要包含的小节，例如变更目的、影响范围、测试结果。' },
    ],
  },
  {
    title: 'Skill 与高级',
    fields: [
      { key: 'skill.name', label: '名称', tip: 'skill 目录名，只能包含小写字母、数字和连字符。' },
      { key: 'skill.description', label: '描述', tip: '告诉 agent 什么时候使用这个 skill，写得越具体越容易被正确调用。' },
      { key: 'skill.body', label: '正文', tip: 'SKILL.md 的 Markdown 内容，写执行步骤和边界。' },
      { key: 'skill.import', label: '导入文件夹', tip: '导入已有的 skill 目录，会保留 references、scripts 等子目录。' },
      { key: 'advanced.tests', label: '测试命令', tip: '验证阶段执行的测试命令，例如 uv run pytest -q；留空会使用占位命令。' },
      { key: 'advanced.yaml', label: '高级预览', tip: '这里的内容由上面的表单自动生成，只读；需要备份或排查时再看，不需要手改。' },
    ],
  },
];

export const FIELD_TIPS = Object.fromEntries(
  FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.tip]))
);

export const FIELD_LABELS = Object.fromEntries(
  FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.label]))
);
