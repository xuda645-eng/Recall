# 微信读书 Skill 导入

## 边界

当前 PWA 读取不含凭证的 JSON 文件，不在浏览器执行 Agent Skill，
不将 `WEREAD_API_KEY` 或火山引擎密钥放入前端。Skill 获取笔记与可选
AI 问题生成应在有凭证的本机 Agent 或未来受保护的后端执行。
未提供问题时，应用生成通用回忆任务草稿并明确标注为非 AI 输出。

在安装了 `weread-skills` 的 Agent 中，先查询有笔记的书，再选择需要
导入的书。按该 Skill 的当前契约查询 `/user/notebooks`，遵守
`hasMore` 与 `lastSort` 分页；每本书通过 `/book/bookmarklist` 获取
`updated` 中的划线。只导出选定书的原文，不导出鉴权信息或整个原始
响应。遵循 Skill 自身的版本与升级规则。

## 文件契约

```json
{
  "format": "recall-weread-export-v1",
  "books": [
    {
      "bookId": "sample-book",
      "title": "示例书名",
      "author": "示例作者",
      "highlights": [
        {
          "bookmarkId": "sample-highlight",
          "markText": "这是示例原文，不是真实书籍摘录。",
          "chapterUid": "1",
          "chapterTitle": "第一章",
          "question": "这一段的结论与条件是什么？",
          "recallKind": "qa",
          "aiSummary": "可选的辅助总结，不是原文。"
        }
      ]
    }
  ]
}
```

- `bookId` 与 `bookmarkId` 是稳定来源 ID，不用书名或内容作为编号。
- `markText` 保留划线原文，包括空格与换行；不得用 AI 总结替换它。
- 章节通过 `chapters[].chapterUid` 对应 `updated[].chapterUid`，保存
  为 `chapterTitle`，不把章节创建为问题或子卡组。
- `question`、`recallKind`、`aiSummary` 可选。`recallKind` 支持
  `qa`、`task`、`excerpt`；只有需要阅读原文而不回忆时使用 `excerpt`。
- 辅助总结只在答案面单独显示，并明确标为非原文。
- 文件上限 5 MB，每文件最多 200 本书、1000 条划线。拒绝包含
  密钥、令牌、Cookie 等凭证字段的文件，不静默保存这些字段。

## 操作

1. 打开“导入 > 微信读书 > 选择 Skill 导出文件”。
2. 按书选择，预览每条划线的回忆提示，可以自行修改问题或任务。
3. 检查新增、重复和变化。变化条目需要明确勾选才更新。
4. 确认导入后，每本书对应一个根卡组，每条划线对应一张卡片。
5. 重复导入使用来源 ID 匹配，保留已评分进度、历史和归档状态。

页面中的示例数据为预先编写的演示材料，不是个人书架，也不是现场
模型生成的内容。本次发布不包含真实微信读书 API 或 AI 推理调用。
