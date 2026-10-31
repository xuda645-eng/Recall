# 微信读书 Skill 导入

## 边界

PWA 支持不含凭证的 JSON 文件以及受保护的在线导入，不在浏览器执行
Agent Skill，不将 `WEREAD_API_KEY` 或火山引擎密钥放入前端。
在线选书与 AI 问题生成通过设备鉴权后的服务端执行，详见下文。
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
模型生成的内容。真实在线选书与 AI 推理入口和示例数据分开。

# Online Books And AI Questions (2026-10-31)

In the PWA, authorize this device under Settings and data > Cloud sync, then
open WeRead import and select **连接微信读书**. The first online version shows
your real notebooks (books with notes), not the complete shelf, audio albums,
article collections or a fake personal bookshelf. Highlight counts use
`noteCount`, not total notes. Load more pages with the server-provided cursor.
Select at most five books per online batch, then preview the highlights.
Local credential-free JSON import and the clearly labeled original demo remain.

Select the highlights and click **AI 生成问题（最多 20 条）**. Each selected new
highlight gets one editable question; its exact original text remains the answer.
The optional summary is explicitly non-source auxiliary text. Neither AI nor
import replaces the entire book. Existing unchanged questions, manually edited
drafts, review history, dates, card IDs and archive state are preserved. Source
identity remains `bookId + bookmarkId`; changed cards require explicit selection
in the existing changes preview. Missing highlights never delete old cards.

AI is explicit opt-in per generation action: only selected original highlights
are sent to the configured Volcengine endpoint. Keys never reach the browser.
Check that each generated question can be answered fully from its highlight;
schema validation does not guarantee semantic correctness. Stop, network failure
or model failure retains completed in-memory drafts without importing them.
Continue generation for the next 20, retry failed work, edit manually, or retain
an excerpt. Closing the sheet does not persist unfinished drafts; completed AI
outputs can be reused from the server cache for seven days.

## Service Limits And Secrets

Protected POST endpoints are `/api/weread/books`, `/api/weread/book` and
`/api/weread/question`. They require device authentication and same-origin
requests. The gateway route and Ark origin are fixed, not arbitrary proxies.
Provision only production encrypted secrets: `WEREAD_API_KEY`, `ARK_API_KEY`,
`ARK_ENDPOINT_ID`, `ARK_BASE_URL`. The supported Ark base is the supplied
`https://ark.cn-beijing.volces.com/api/v3`. Preview has no production keys/DB.
The additive migration `20261031_weread_ai.sql` creates only import rate limits
and a seven-day question cache, separate from cards/sync entities.

- Each AI request accepts 1-6000 characters and caps output at 384 tokens.
- The UI sends serial requests, at most 20 per action; stop prevents future
  calls but an already started upstream call may still finish and be charged.
- All devices in the personal space share a hard 100-model-attempt UTC-day
  budget (failures count), plus 120 AI requests/hour including cache hits.
- WeRead read requests share 120/hour; online imports cap five books and 1000
  highlights per batch, with strict 5MiB validation.
- No automatic whole-book sync, paid infrastructure, external knowledge,
  model tools, or automatic card-library writes.

## Bounded 24-Hour Smoke

Run `node scripts/weread-ai-smoke.mjs` from the app repository. It reads existing
private credential files without printing their contents, requests one notebook
page, and sends only synthetic original text to the real Ark endpoint. It never
writes the production library. The private state lives outside the source repo
at `../exports/weread/ai-smoke-state.json`; do not commit it.

The guard permits one probe every six hours within 24 hours, at most four
attempts including the initial probe (approximately hour 0, 6, 12 and 18),
one model call/probe and 384 output tokens/call. At hour 24 only the summary
is due, not another model call. The user's shortened window retains the
original `startedAt` and existing results; it does not restart the clock.
At the first failure it stops further calls; investigate before any explicit
new run. A scheduled chat follow-up executes the guard, reports only actionable
failures or final results, and then disables itself. A final summary may arrive
on the first scheduled wake after the deadline. The machine and desktop app
must remain running; missed wakes do not prove continuous uptime. Do not delete
or reset the state to bypass the limits. All elapsed observations are reported
separately from the scheduled window.
