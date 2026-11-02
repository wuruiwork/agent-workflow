// 流程编辑器字段说明。中文用于 docs/editor-fields.md，en 用于浏览器英文界面。

export const FIELD_GROUPS = [
  {
    title: '流程信息',
    title_en: 'Flow info',
    fields: [
      {
        key: 'flow.name', label: '流程名', tip: '流程的唯一标识，只能用小写字母、数字和连字符。',
        en: { label: 'Flow name', tip: 'Unique flow identifier; lowercase letters, digits and hyphens only.' },
      },
      {
        key: 'flow.artifacts', label: '产物目录', tip: '流程文档存放的位置，例如 docs/specs/current；第一阶段开始就在这里写文档。',
        en: { label: 'Artifact directory', tip: 'Where flow documents are written, e.g. docs/specs/current; documents start here from the first stage.' },
      },
      {
        key: 'flow.description', label: '描述', tip: '一句话说明这个流程做什么，方便在流程列表里区分。',
        en: { label: 'Description', tip: 'One sentence about what this flow does, to tell flows apart.' },
      },
      {
        key: 'flow.archive', label: '归档目录', tip: '流程结束后文档归档到的目录，通常是产物目录去掉 current，例如 docs/specs。',
        en: { label: 'Archive directory', tip: 'Where documents are archived after the flow ends; usually the artifact directory without "current", e.g. docs/specs.' },
      },
      {
        key: 'flow.checkpoints', label: '动作槽位', tip: 'git 动作可以插入的位置：task_end（skill 阶段内每完成一个任务）、stage_end（每个阶段结束时）和 finish（流程结束时）。不需要调整时保持默认。',
        en: { label: 'Checkpoints', tip: 'Where git actions can run: task_end (after each task inside a skill stage), stage_end (end of each stage), finish (end of the flow). Keep the default unless needed.' },
      },
    ],
  },
  {
    title: '阶段',
    title_en: 'Stages',
    fields: [
      {
        key: 'stage.id', label: '阶段标识', tip: '阶段的唯一名字，例如 brief、implement；项目配置里的动作绑定按这个名字匹配。',
        en: { label: 'Stage ID', tip: 'Unique stage name, e.g. brief, implement; project action bindings match by this name.' },
      },
      {
        key: 'stage.type', label: '类型', tip: 'doc = 按文档执行的人工/写作阶段；skill = 调用一个已有 skill 的阶段。',
        en: { label: 'Type', tip: 'doc = document-driven stage; skill = stage that invokes an existing skill.' },
      },
      {
        key: 'stage.ref', label: '引用', tip: 'doc 类型填阶段文档路径（如 stages/brief.md）；skill 类型直接从仓库已有 skill 里选择。',
        en: { label: 'Reference', tip: 'For doc, a stage document path (e.g. stages/brief.md); for skill, pick an existing skill from the repo.' },
      },
      {
        key: 'stage.artifact', label: '产物文件', tip: '这个阶段完成时要生成的文件名，例如 00-brief.md；留空表示没有固定产物。',
        en: { label: 'Artifact file', tip: 'File produced when this stage completes, e.g. 00-brief.md; leave empty if there is no fixed artifact.' },
      },
      {
        key: 'stage.gate', label: '状态门禁', tip: '产物 frontmatter 里必须出现的 status 值，例如 approved、done、pass。',
        en: { label: 'Status gate', tip: 'Required frontmatter status value, e.g. approved, done, pass.' },
      },
      {
        key: 'stage.approval', label: '人工确认', tip: '勾选后，这个阶段的产物必须由你明确确认。doc 阶段确认后改 status；skill 阶段先执行设计轮，确认后再重入实现轮。',
        en: { label: 'Manual approval', tip: 'When checked, you must explicitly approve. For doc stages this changes status; for skill stages it runs a design round first, then re-enters implementation after approval.' },
      },
      {
        key: 'stage.hooks', label: '动作槽位', tip: '这个阶段要触发哪些 git 动作槽位，例如 stage_end；具体执行 commit 还是 push 由项目配置决定。',
        en: { label: 'Checkpoints', tip: 'Which git action checkpoints this stage triggers, e.g. stage_end. What runs is decided by the project config.' },
      },
    ],
  },
  {
    title: '阶段动作（git）',
    title_en: 'Stage actions (git)',
    fields: [
      {
        key: 'binding.commit', label: '提交', tip: '阶段结束后把改动 git commit。提交信息按阶段类型自动生成。',
        en: { label: 'Commit', tip: 'git commit the changes at the end of the stage. The message is generated from the stage type.' },
      },
      {
        key: 'binding.push', label: '推送', tip: '阶段结束后推到远端。推送不等全部验证通过，方便中途保存进度。',
        en: { label: 'Push', tip: 'Push to the remote at the end of the stage; does not wait for full verification.' },
      },
      {
        key: 'binding.mr', label: '合并请求', tip: '调用 glab / gh / gitee 创建 MR 或 PR，按项目配置的目标和条件执行。',
        en: { label: 'Merge request', tip: 'Create an MR/PR with glab, gh or gitee using the project targets and conditions.' },
      },
      {
        key: 'binding.commitType', label: '提交类型', tip: '这个阶段提交时用的前缀，例如 feat、fix、docs；auto 表示按改动内容自动判断。',
        en: { label: 'Commit type', tip: 'Prefix for this stage commits, e.g. feat, fix, docs; auto infers from the changes.' },
      },
    ],
  },
  {
    title: '项目配置',
    title_en: 'Project config',
    fields: [
      {
        key: 'project.flows', label: '启用流程', tip: '这个项目允许使用哪些流程。没勾选的流程不会被 flow-runner 提供。',
        en: { label: 'Enabled flows', tip: 'Which flows this project may use. Flows not checked are not offered by flow-runner.' },
      },
      {
        key: 'project.keepLatest', label: '保留最近 N 个', tip: '至少保留最近 N 个已归档 feature；不在最近 N 个且超过保留天数的记录才会进入清理候选。',
        en: { label: 'Keep latest', tip: 'Keep at least the latest N archived features; only older records outside both this count and the day window become cleanup candidates.' },
      },
      {
        key: 'project.keepDays', label: '保留最近 N 天', tip: '至少保留最近 N 天内归档的 feature；与 keep_latest 取并集。',
        en: { label: 'Keep days', tip: 'Keep features archived within the last N days; combined with keep_latest.' },
      },
      {
        key: 'project.minKeep', label: '至少保留 N 个', tip: '无论其他条件如何，已归档 feature 至少保留 N 个。',
        en: { label: 'Minimum kept', tip: 'Always keep at least N archived features, regardless of other conditions.' },
      },
      {
        key: 'project.retentionMode', label: '清理模式', tip: 'report = 只报告；ask = 列清单等你确认；auto = 按策略自动删除。',
        en: { label: 'Cleanup mode', tip: 'report = only list candidates; ask = wait for your confirmation; auto = delete candidates automatically.' },
      },
      {
        key: 'project.pushRemote', label: '推送远端', tip: 'git push 的目标远端，通常是你的 fork，例如 origin。',
        en: { label: 'Push remote', tip: 'Target remote for git push, usually your fork, e.g. origin.' },
      },
      {
        key: 'project.upstreamRemote', label: '上游远端', tip: '团队主仓库的远端名，例如 upstream；用于同步和跨项目 MR。',
        en: { label: 'Upstream remote', tip: 'Remote name of the team repository, e.g. upstream; used for sync and cross-project MRs.' },
      },
      {
        key: 'project.baseBranch', label: '默认分支', tip: '主分支名，通常是 main。在主分支上提交会被拒绝，需要先切分支。',
        en: { label: 'Base branch', tip: 'Main branch, usually main. Commits on it are rejected; create a branch first.' },
      },
      {
        key: 'project.onBaseBranch', label: '在主分支上', tip: 'refuse = 直接拒绝提交；create = 自动切一个新分支。',
        en: { label: 'On base branch', tip: 'refuse = reject commits; create = auto-create a new branch.' },
      },
      {
        key: 'project.branchPattern', label: '分支命名规则', tip: '允许提交的分支名正则，例如要求以 feat/、fix/、docs/ 开头。',
        en: { label: 'Branch pattern', tip: 'Regex for allowed branch names, e.g. must start with feat/, fix/, docs/.' },
      },
      {
        key: 'project.createFrom', label: '分支来源', tip: '自动建分支时从哪个引用开始，例如 upstream/main。',
        en: { label: 'Branch source', tip: 'Ref to start an auto-created branch from, e.g. upstream/main.' },
      },
      {
        key: 'project.commitTypes', label: '提交类型白名单', tip: '允许使用的 commit 前缀，逗号分隔；push 时由门禁检查。',
        en: { label: 'Allowed commit types', tip: 'Allowed commit prefixes, comma separated; checked by the push gate.' },
      },
      {
        key: 'project.commitDeny', label: '禁止提交的路径', tip: '敏感或临时文件，例如 .env、.tmp、.skillgate/phase；提交时会自动排除。',
        en: { label: 'Excluded paths', tip: 'Sensitive or temporary paths, e.g. .env, .tmp, .skillgate/phase; omitted from commits.' },
      },
      {
        key: 'project.scopeMap', label: 'scope 映射', tip: '按阶段给 commit 加 scope，每行 stage: scope，例如 verify: test。',
        en: { label: 'Scope map', tip: 'Add a commit scope per stage, one "stage: scope" per line, e.g. verify: test.' },
      },
      {
        key: 'project.actionPushRemote', label: '推送远端（动作）', tip: 'push 动作实际使用的远端名，一般和推送远端一致。',
        en: { label: 'Push remote (action)', tip: 'Remote used by the push action, usually the same as the push remote.' },
      },
      {
        key: 'project.setUpstream', label: '首次推送设置 upstream', tip: '新分支第一次推送时自动执行 git push -u。',
        en: { label: 'Set upstream on first push', tip: 'Run git push -u automatically for new branches.' },
      },
      {
        key: 'project.mrTargets', label: '合并请求目标', tip: '可以配置多个目标：工作分支 → fork main；fork main 满足条件时 → 上游 main。',
        en: { label: 'Merge request targets', tip: 'Multiple targets: branch → fork main; fork main → upstream main when conditions match.' },
      },
      {
        key: 'project.mrId', label: '目标标识', tip: '给这个 MR 目标起个名字，例如 review、sync-upstream，方便区分。',
        en: { label: 'Target ID', tip: 'Name for this MR target, e.g. review, sync-upstream.' },
      },
      {
        key: 'project.mrHead', label: '源分支', tip: '从哪里合并：current_branch 表示当前工作分支，也可以写 origin/main。',
        en: { label: 'Source branch', tip: 'Where to merge from: current_branch, or a ref such as origin/main.' },
      },
      {
        key: 'project.mrBase', label: '目标分支', tip: '合并到哪里，例如 origin/main；决定 MR 创建在哪个项目。',
        en: { label: 'Target branch', tip: 'Where to merge into, e.g. origin/main; decides which project gets the MR.' },
      },
      {
        key: 'project.mrWhen', label: '触发条件', tip: '总是创建、领先 N 个提交时创建，或主干空闲 N 天时创建；可以组合。',
        en: { label: 'Trigger', tip: 'Always, after N ahead commits, or after N idle days; can combine.' },
      },
      {
        key: 'project.mrTitle', label: '标题模板', tip: 'MR 标题模板，{ahead} 会替换成领先的提交数。',
        en: { label: 'Title template', tip: 'MR title template; {ahead} is replaced with the number of ahead commits.' },
      },
      {
        key: 'project.mrSections', label: '描述章节', tip: 'MR 描述里要包含的小节，例如变更目的、影响范围、测试结果。',
        en: { label: 'Description sections', tip: 'Sections included in the MR description, e.g. purpose, impact, test results.' },
      },
    ],
  },
  {
    title: 'Skill 与高级',
    title_en: 'Skills & advanced',
    fields: [
      {
        key: 'skill.name', label: '名称', tip: 'skill 目录名，只能包含小写字母、数字和连字符。',
        en: { label: 'Name', tip: 'Skill directory name; lowercase letters, digits and hyphens only.' },
      },
      {
        key: 'skill.description', label: '描述', tip: '告诉 agent 什么时候使用这个 skill，写得越具体越容易被正确调用。',
        en: { label: 'Description', tip: 'Tells the agent when to use this skill; be specific so it is invoked correctly.' },
      },
      {
        key: 'skill.body', label: '正文', tip: 'SKILL.md 的 Markdown 内容，写执行步骤和边界。',
        en: { label: 'Body', tip: 'Markdown content of SKILL.md with steps and boundaries.' },
      },
      {
        key: 'skill.import', label: '导入文件夹', tip: '导入已有的 skill 目录，会保留 references、scripts 等子目录。',
        en: { label: 'Import folder', tip: 'Import an existing skill folder, keeping references, scripts and other subdirectories.' },
      },
      {
        key: 'advanced.tests', label: '测试命令', tip: '验证阶段执行的测试命令，例如 uv run pytest -q；留空会使用占位命令。',
        en: { label: 'Test command', tip: 'Command run by the verification stage, e.g. uv run pytest -q; a placeholder is used if empty.' },
      },
      {
        key: 'advanced.yaml', label: '高级预览', tip: '这里的内容由上面的表单自动生成，只读；需要备份或排查时再看，不需要手改。',
        en: { label: 'Advanced preview', tip: 'Generated from the form above and read-only; use it only for backup or debugging.' },
      },
    ],
  },
];

export const FIELD_TIPS = Object.fromEntries(
  FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.tip]))
);

export const FIELD_LABELS = Object.fromEntries(
  FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.label]))
);

export const FIELD_TIPS_EN = Object.fromEntries(
  FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.en?.tip || field.tip]))
);

export const FIELD_LABELS_EN = Object.fromEntries(
  FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.en?.label || field.label]))
);
