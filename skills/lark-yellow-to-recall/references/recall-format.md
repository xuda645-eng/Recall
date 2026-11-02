# 导入与归档契约

## 项目与依赖

Python 3.10+（标准库）、Node.js 22+，以及目标 Recall 项目已安装的 Vite 和应用依赖。脚本不联网、不安装依赖、不访问 APP 数据库。

当前项目使用 `src/lib/memory-markdown.ts`，PWA 导入入口为 `MemoryWorkspace`。标题表示相对于用户所选导入父卡组的路径，卡片块内的标题仍是正文。不要选同名父卡组造成重复嵌套。

从 Skill 目录运行；以下 `<project>`、`<source>`、`<plan>` 均换成实际路径。

```bash
python3 scripts/recall_batch.py configure --project <project> --timezone Asia/Shanghai
python3 scripts/recall_batch.py extract --source <source> --url <用户指定URL> --output /tmp/recall-highlights.json
python3 scripts/recall_batch.py archive --project <project> --source <source> --plan <plan> --confirm
python3 scripts/recall_batch.py index --project <project> --confirm
python3 scripts/recall_batch.py verify --project <project> --batch <批次目录>
python3 -m unittest discover -s scripts/tests -v
```

`configure` 新建 `card-imports/config.json`，记住项目绝对路径、解析器相对路径和时区。相同配置可以重复执行；路径迁移或解析器变化必须明确检查配置，不静默覆盖。批次时间来自该时区的真实当前时间。

测试会自动定位项目内的 Recall；技能安装到个人目录后，可用 `RECALL_PROJECT=<project> python3 -m unittest discover -s scripts/tests -v` 指定实际项目。没有应用依赖时，实际解析器集成测试会明确跳过，不声称已验证 APP 兼容性。

`extract` 输入是官方 fetch 的完整 JSON 响应，不是改写后的 Markdown。输出包含每个高亮区域的 `block_key`、`run_index`、原文、所在问题及章节。相邻粗体/span 合并；未高亮字符隔开的区域分离。`br` 保留换行，嵌套列表、表格单元格和代码块保留文本。无 block ID 的高亮及未确认媒体阻止归档，不能静默遗漏。

以上为默认黄色模式。个人文档的表格截图使用 `--mode screenshots` 和 [截图红框契约](screenshot-selections.md)，先读取图片清单，再提供视觉核对后的 `--selections`。它复用以下计划与归档验证，不把图片转录伪装成源 XML 高亮。

## 计划 JSON

```json
{
  "hierarchy_confirmed": true,
  "allowed_paths": [["用户确认的一级", "用户确认的二级"]],
  "import_parent": null,
  "source_url": "https://example.larkoffice.com/wiki/wikiToken",
  "source_document_id": "真实DocxToken",
  "revision": 64,
  "cards": [
    {
      "path": ["用户确认的一级", "用户确认的二级"],
      "front": "原问题或根据标黄答案收窄的问题？",
      "question_origin": "inferred",
      "question_note": "原题范围更大，本题只问已标黄部分。",
      "refs": [{"block_key": "真实blockID", "run_index": 0}]
    }
  ],
  "context_refs": [],
  "unresolved": [
    {
      "reason": "仅有碎片，不能组成答案。",
      "refs": [{"block_key": "另一个真实blockID", "run_index": 0}]
    }
  ],
  "resource_decisions": [],
  "scope_notes": []
}
```

- `allowed_paths` 必须已获用户确认，不从源文档标题自动推定。`import_parent` 为 `null` 表示根目录，或已有父卡组的完整名称数组；验证时只在内存中模拟该父卡组，不读取真实 APP。
- `source_document_id` 和 `revision` 必须与响应一致。`source_url` 保留用户指定链接；真实 document_id 用于跨 Wiki/Docx 别名识别。标题从源响应提取。
- `extracted` 的问题只可去掉 `Q编号：`，必须匹配其答案所在的原问题；否则用 `inferred` 并解释。每卡允许 `context_blocks` 指定真实上下文 block ID，文本由脚本读取，不作为答案。
- 只用 `refs` 构造答案，脚本仅去掉区域开头的“答：”“背诵句：”，其余措辞不改。禁止直接提供 `back`。不要把标黄表头混成额外事实。
- 已用于答案的区域不可重复用于另一张卡；属于制卡原题的高亮标题自动记为问题上下文，其它高亮需显式登记。只标黄问题而无答案时放入 `unresolved`。
- `existing_id` 可明确指定同源历史卡片；`identity_note` 说明定位变化的对应关系。`unit_key` 可用于一个块内多个独立知识单元的稳定区分，不能依赖生成时间。含糊的一对多对应会停止。
- `resource_decisions` 格式为 `[{"key":"extract 输出的资源key","reason":"读取/确认结果及本批范围"}]`。需要先完成相关读取再填写，不把“已确认”当作读取替代品。

## Markdown 与增量

```md
# 一级卡组
## 二级卡组

<!-- recall:card {"id":"lyr-stable-id","type":"qa"} -->
问题：具体问题？

标黄原文答案。
<!-- recall:end -->
```

文件不预填 `importedAt`。每文件 1-1000 张、最多 5 MiB；问题最多 10000 UTF-16 单元、答案最多 20000，卡组名称最多 80，标题不跳级。原文中的卡片标记必须用实际解析器验证，不能自行转义并改变知识文本；不兼容时停止。

归档结构：

```text
card-imports/
  config.json
  index.md
  batches/<真实时间和唯一批次号>/
    cards-<批次号>-001.md
    manifest.json
    review-notes.md
```

文件名包含批次号，避免 iPhone 下载后全叫 `cards-001.md`。文件超过限额自动拆分，单卡超限则拒绝。全部重复不创建空批次；`--include-unchanged` 可显式生成完整修订版，原文件仍不动。

manifest 记录源 document_id/URL/版本、真实生成时间、用户确认的路径、证据、稳定 ID、跳过原因、待确认和本地校验结果。`status: generated` 始终不是已导入。脚本兼容当前历史 manifest，用原文定位复用旧 ID；定位变化可显式确认，绝不只靠问题措辞匹配。

归档会先在临时目录运行实际 PWA 解析器，比较数量、ID、路径、front/back，再用纯内存快照验证首次新增、重复跳过、历史内容变更默认不覆盖、选中才更新、旧卡和复习字段保留。只通过后发布批次；独立 `index --confirm` 从已发布 manifest 重建链接汇总。Skill 测试与结构校验不替代真实 iPhone Safari 安装和手动导入验证。
