# 同主题标黄与截图的整合

## 目标与边界

把用户明确指定为同一主题/同一场培训的多份学习文档整合成一套 QA，最终用一个 `.recall-media.json` 文件同时交付有图和无图卡片。不要让用户分别导入两个素材批次；包内只有一份统一 Markdown，附图按卡片需要出现。另存同批 Markdown、manifest 和检查说明供回查，Markdown 单独不能搬运图片。

- 妙记由用户导出为飞书云文档并标黄，按 `lark-doc` 读取；不直接读取原始妙记全文。保留此前已选择的标黄路线，不恢复被取消的 Minutes 模式。
- 每份来源各自执行黄色或截图红框契约。答案证据仅来自标黄文字和已视觉核对的红框，讲解原文及其它上下文仅帮助理解。多来源整合不扩大选材范围，也不授权搜索其它文档或修改分享权限。
- 确认主题关系与最终卡组/导入父卡组，不凭标题相似自动合并不相干材料。用户已明确同一主题时不重复询问。只维护 Skill 时使用合成材料验证，不自动生成真实卡片或写 APP。

## 信息整合与学习逻辑

先完整读取各自指定选区及必要上下文，建立“知识点 - 来源证据”的对应关系，再设计整套学习路径，不先各生成一堆卡然后拼接。

- 按背景与主问题、核心概念与关系、运行机制及原文支持的原因、流程依赖、方案差异和适用边界逐步组织。先整体后局部，先概念后机制，正常路径后例外；会议顺序和截图排版不是学习顺序。不强凑层数或固定卡数。
- 一卡围绕一个完整学习目标。两个来源讲同一事实时合成一张卡，答案不重复说两遍，保留两份 refs 以回查；互补的定义、流程步骤、条件和图示可以共同支持一个答案。不同知识点分开，不将整场培训挤成一张摘要卡。
- 答案先直接回答问题，再按需要解释机制、依赖、差异和条件。理解所需的关联可以在同一 QA 内串联，但每个断言均需由所绑选区证据支持，不能补常识或虚构因果。原文没讲“为什么”时明确留下理解缺口，不编解释。
- 保留各来源的时点、数值、否定、条件、例外和计划状态。截图与会议文字冲突时注明来源/时点；只有证据明确说明更正关系时才据此整合。无法消歧的冲突、疑似 ASR 错词或模糊截图登记待确认，不静默选择一个版本。
- 一段标记含多个目标时先沿现有契约识别独立证据单元，避免重复使用同一证据制造冗余 QA。全部选中证据要有答案、上下文或带原因的待确认去向。仅标黄的问题仍是问题上下文，不凭另一来源的未标记正文补答案。
- 文字卡不配占位图。整合卡只附其 refs 绑定的相关截图，不附整份文档的所有图片；同图支持多个独立 QA 可共用一个附件。图片仅作上下文且未作为答案证据时不自动附到卡上。
- 整组检查学习顺序、概念先修关系、知识点去重和关键理解缺口，再逐卡核对答案与全部来源证据。格式测试不证明语义正确，视觉核对不能由 `verified: true` 字段替代。

## 来源清单与提取

代理维护临时 JSON，不让用户手写。所有文件路径相对于清单目录，官方原响应和图片仍放在私人临时区：

```json
{
  "same_topic_confirmed": true,
  "topic_key": "stable-training-key",
  "title": "用户确认的培训主题",
  "sources": [
    {"key": "lecture", "mode": "yellow", "url": "https://example.larkoffice.com/docx/docLecture", "file": "lecture.json"},
    {"key": "notes", "mode": "screenshots", "url": "https://example.larkoffice.com/docx/docNotes", "file": "notes.json", "selections": "images/selections.json"}
  ]
}
```

`file` 必须为官方 Docx/Wiki 完整响应，不能用改写的 Markdown 冒充。截图来源的 `selections` 已完成全部图片清单、红框视觉转录、文件哈希和版本核对。每份文档可以独立选择黄色或截图模式；同一文档真有两种选材时可分别登记，仍不得混淆范围。

`topic_key` 是这场培训的稳定身份，不随时间、标题或来源排序变动，也不能给另一场培训复用。来源 `key` 仅是本批引用别名；真实 document_id、取材模式和 block ID 才是证据身份，同名图片 block 跨文档不会串图。Wiki/Docx 别名不重复作为新来源。

```bash
python3 <skill>/scripts/combined_batch.py extract --sources <临时sources.json> --output <临时extraction.json>
```

脚本逐份重新执行实际提取器并为证据命名空间隔离。`extraction.json` 保留全部来源版本、哈希、选区、图像决定和证据；`revision` 为整组内容签名，不是虚构飞书修订号。提取只读，不连模型、APP 或数据库。

## 统一计划

先从提取结果填真实 `source_document_id` / `revision`，再写学习路径与整合 QA：

```json
{
  "topic_key": "stable-training-key",
  "source_document_id": "combined:stable-training-key",
  "revision": "sha256:<提取的实际签名>",
  "hierarchy_confirmed": true,
  "allowed_paths": [["用户确认的卡组"]],
  "import_parent": null,
  "learning_path": ["先理解主问题与概念", "再理解运行机制和条件"],
  "cards": [
    {
      "path": ["用户确认的卡组"],
      "unit_key": "concept",
      "front": "材料所述核心概念是什么？",
      "question_origin": "inferred",
      "question_note": "为后续机制题建立概念先修基础。",
      "answer": "来自标黄证据的简洁概念说明。",
      "refs": [{"source": "lecture", "block_key": "<真实文字block>", "run_index": 0}]
    },
    {
      "path": ["用户确认的卡组"],
      "unit_key": "mechanism",
      "front": "这个机制如何运行，图中的条件起什么作用？",
      "question_origin": "inferred",
      "question_note": "将讲述说明与截图关系整合成一个机制学习目标。",
      "answer": "整合文字说明与红框图示中的机制步骤和条件，不补选区之外的内容。",
      "refs": [
        {"source": "lecture", "block_key": "<另一真实文字block>", "run_index": 0},
        {"source": "notes", "block_key": "<图片ID>:<框key>:<单元key>", "run_index": 0}
      ]
    }
  ],
  "context_refs": [],
  "unresolved": [],
  "resource_decisions": [{"source": "notes", "key": "<图片ID>", "reason": "原图已读取，红框视觉核对完成。"}],
  "scope_notes": ["两份材料的实际读取范围、上下文与版本差异、学习缺口及去重结果。"]
}
```

只此专用模式允许 `answer`，禁止手填 `back` 或来源引用。refs 必须逐来源绑定真实选中单元；脚本从它们附上标黄原文/截图红框转录、来源链接及版本。截图转录不是可凭文字宣称的原文人工校对稿，图中关系须经视觉确认。

`unit_key` 代表稳定学习目标，因此增加来源、重排来源、补图或修订问题不会自动新建 ID。同一主题里不能把另一知识点塞进旧 key。一拆多/多合一应显式核对 ID，不猜映射。

已独立归档过的卡需要整合进来时，用 `existing_id` 与 `identity_note` 明确指认同源旧卡。脚本仅在本批已指定来源的本地历史中查找这个 ID；不能声称自动匹配 APP 里的所有旧卡。无法确认旧 ID 时说明可能作为新卡导入，先核对不要暗称去重完成。

## 一套归档，一个导入包

```bash
python3 <skill>/scripts/combined_batch.py archive --project <project> --sources <sources.json> --plan <plan.json> --confirm
python3 <skill>/scripts/media_package.py pack --batch <返回的整合批次> --selections <第一份截图selections.json> --output <整合批次>/cards-<批次号>.recall-media.json
node scripts/verify-media-package.mjs <生成的带图包>
python3 <skill>/scripts/recall_batch.py index --project <project> --confirm
```

多份截图来源重复传 `--selections`；文字来源不传截图文件。截图来源全是上下文、没有选中图片时可以生成零图片包，仍包含所有文字卡。没有任何截图来源时交付统一 Markdown 即可。

归档先通过实际 Markdown 解析器与纯内存的首次、重复、历史更新/复习进度校验。打包再检查每份截图文档及版本、每个图片证据的真实文档/图片 ID 和哈希，将图片去重后只附在对应卡上。**必须再运行实际 `parseMediaPackage` 的包校验**，失败包不交付；不能只证明 Markdown 可解析就说带图包可导入。

一份包仍受 APP 上限约束：Markdown 最多 5 MiB、1000 张卡，每图最多 512 KiB，最多 100 张图/16 MiB 总包，单卡正文含引用/图片最多 20000 UTF-16 单元。超过上限时先报告不能安全装入单文件，再按学习主题拆成独立包；不丢卡、丢图、压糊或截断来凑一份。

默认仅归档新/变更卡；需要直接首次导入的完整修订版用 `--include-unchanged`，避免把增量包当全量。旧文件及 manifest 不改，汇总只登记独立文件，仍遵循已有索引授权。真实材料与包不发布 GitHub，不自动导入 APP。

交付清楚标出主要导入文件、有图/无图卡数、整合去重结果、学习顺序、来源/待确认缺口，以及同批 Markdown 和索引入口。APP 选择“带图包”导入这个 JSON，一次预览确认所有卡；不要把“JSON”误解为只可装图片卡。不宣称已在物理 iPhone 导入或已跨设备同步图片。
