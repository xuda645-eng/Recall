# 截图红框契约

## 读取与视觉核对

先读共用的 [导入与归档契约](recall-format.md)。截图模式不要求用户手抄原文、给每张图写问题或改变现有表格布局。

1. 按用户指定范围获取官方 XML/full JSON，运行 `extract --mode screenshots` 枚举图片。表格按行从左到右，正文按顺序；空格跳过，同一行不代表同一知识点。原文来源链接用于追溯，不自动打开链接、展开引用或扩大制卡范围。
2. 按当前 `lark-doc` 素材参考获取每张图片，支持响应中的 `src` 或 `token`。优先获取原图，不截取表格缩略图。预览资源失败时按官方错误提示恢复；仍无法读取的图片登记缺口，不声称已识别。
3. 用视觉工具查看完整图片，必要时查看局部裁切。识别用户画的矩形红框，区别于原文红色字体、图中节点边框和红色连接线。缺少明确红框时不把全图当答案。边界歧义、文字被压住或截断时请求补图/确认。
4. 框内正文按原文转录；时间线、流程图和表格需要保留节点、日期、箭头方向、行列对应、条件及计划口径，不能只扁平抄字。框外标题等写入 `context`，不进入答案。OCR 可辅助，但必须视觉复核；模糊字不猜。
5. 每个红框可拆成多个独立知识单元，或用多个 `refs` 组成一张卡。知识单元尽量逐字摘录；图中关系只作忠实线性表达，不增加推断，注明 `representation: diagram`。相邻截图重叠部分只用一次。“续上图”表示需要联合阅读，不授权使用未框选内容。

## 选区证据文件

由代理在临时目录填写，不让用户维护 JSON。图片路径相对于证据文件所在目录；原图和完整响应仅留临时区。所有图片都需核对并登记，不能只处理第一行。

```json
{
  "source_document_id": "真实学习文档DocxID",
  "revision": 16,
  "images": [
    {
      "block_key": "真实图片blockID",
      "file": "image-001.png",
      "sha256": "实际图片文件的SHA256",
      "decision": "selected",
      "regions": [
        {
          "key": "interaction",
          "bounds": [0.10, 0.40, 0.90, 0.55],
          "verified": true,
          "context": "框外标题，只用于理解",
          "segments": [
            {"key": "goal", "text": "红框内已视觉核对的原文。", "representation": "text"},
            {"key": "priority", "text": "另一独立知识单元。", "representation": "text"}
          ]
        }
      ]
    }
  ]
}
```

- `bounds` 为被核对图片上归一化的 `[left, top, right, bottom]`，范围 0 到 1，包围红框内取材区域。边框轻微压字需要先解决，不能靠扩大范围补知识。
- `key` 使用简短、稳定的 ASCII 标识，不依赖表格行列、生成时间或当前坐标。插行、移动原图片不换 ID；替换图片 block 或知识单元重新拆分时显式核对历史对应关系。
- `decision` 可为 `selected`、`context` 或 `unresolved`。后两者不填 `regions`，必须填写 `reason`，例如“无用户红框，仅供上下文”或“框内日期模糊，待补图”。无法获得图片文件时停止此批归档并报告读取缺口。
- `verified: true` 仅在实际看图核对后填写。脚本校验来源版本、图片哈希、坐标及覆盖，不验证转录语义，也不自动检测红框。不能把结构校验称为视觉识别验收。
- 每个 segment 输出一个 `block_key: <图片ID>:<红框key>:<segment key>`、`run_index: 0` 的证据 ref。计划问题通常用 `inferred` 并说明依据；截图里现成的问题也需记录为视觉摘取的 inferred，不冒充 XML 问题标题。

## 命令与计划

从 Skill 目录运行；实际路径替换占位符。未提供 `--selections` 的截图提取只生成待核对的图片清单，不能直接归档。

```bash
python3 scripts/recall_batch.py extract --mode screenshots --source <完整响应JSON> --url <学习文档URL> --output /tmp/screenshot-inventory.json
python3 scripts/recall_batch.py extract --mode screenshots --source <完整响应JSON> --url <学习文档URL> --selections <选区证据JSON> --output /tmp/screenshot-evidence.json
python3 scripts/recall_batch.py archive --mode screenshots --project <project> --source <完整响应JSON> --selections <选区证据JSON> --plan <计划JSON> --confirm
```

计划沿用共用契约，以输出的 `refs` 取答案。每张图片及其他嵌入资源仍在 `resource_decisions` 中说明读取结果与取舍；每个选中 segment 必须制卡、用作上下文或登记 `unresolved`。无框/模糊图片的决定保留在 manifest 的 `image_decisions`，不借它们补答案。批次含图片 SHA256、位置、红框坐标和上下文证据，不归档原图或临时文件路径，不公开私有资料。

稳定身份、首次/重复/历史更新和复习进度校验、独立 Markdown 文件及汇总均使用原有流程。不直接写数据库，不自动导入 APP，也不将截图文档创建和制卡混成一个隐含操作。
