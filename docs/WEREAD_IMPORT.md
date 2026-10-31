# 微信读书 Skill 导入

## 边界

PWA 支持不含凭证的 JSON 文件以及受保护的在线导入，不在浏览器执行
Agent Skill，不将 `WEREAD_API_KEY` 或火山引擎密钥放入前端。
在线选书与 AI 问题生成通过设备鉴权后的服务端执行，详见下文。
手动文件路径未提供问题时，应用生成通用回忆任务草稿并明确标注为非 AI
输出。新的在线路径在显式确认后生成问题，全部成功后才自动导入。

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

1. 打开“导入 > 微信读书 > 其他导入方式 > 选择 Skill 导出文件”。
2. 按书选择，预览每条划线的回忆提示，可以自行修改问题或任务。
3. 检查新增、重复和变化。变化条目需要明确勾选才更新。
4. 确认导入后，每本书对应一个根卡组，每条划线对应一张卡片。
5. 重复导入使用来源 ID 匹配，保留已评分进度、历史和归档状态。

页面中的示例数据为预先编写的演示材料，不是个人书架，也不是现场
模型生成的内容。真实在线选书与 AI 推理入口和示例数据分开。

# Online Books And Automatic Import (2026-11-01)

In the PWA, authorize this device under Settings and data > Cloud sync, then
open WeRead import and select **连接微信读书**. The online version shows
your real notebooks (books with notes), not the complete shelf, audio albums,
article collections or a fake personal bookshelf. Highlight counts use
`noteCount`, not total notes. Load more pages with the server-provided cursor.
Select at most five books per online batch, then preview the highlights.
Search by title or author, filter marked reading status and imported books, and
sort the loaded pages by note date, own highlight count or available progress.
Missing metadata is labeled unavailable, not guessed. More pages must be loaded
explicitly; search and sorting do not query the full remote shelf.

Book cards show title, author, cover when available, marked-finished status,
personal highlights, note date and total notes when the constituent counts are
available. Total notes are highlights + thoughts/reviews + bookmarks, not the
number of importable cards. Progress is read lazily for visible cards, with at
most two concurrent `/book/getprogress` calls; its 0-100 percentage is not
inferred from undocumented notebook units. Marked finished is distinct from
percentage. The reading-time popular/dashed highlights belong to the separate
public popular-highlight API and are never included in this import.

Local credential-free JSON import and the clearly labeled original demo remain
under **其他导入方式**, with the legacy manual preview and generation workflow.

Select books, click **下一步 · AI 问题与导入**, inspect the scope and select
individual highlights if needed. Click **生成并自动导入** to consent to the
displayed originals and changed-card updates. At most 20 questions per consent;
larger scopes require fewer selected highlights. New originals longer than 6000
characters require manual handling. All required questions must succeed before
the batch is written through the normal atomic card-save path. Each selected new
highlight gets one question; its exact original text remains the answer. No
auxiliary summary is generated on this automatic path. Neither AI nor
import replaces the entire book. Existing unchanged questions, manually edited
drafts, review history, dates, card IDs and archive state are preserved. Source
identity remains `bookId + bookmarkId`; changed cards require explicit selection
in the confirmation preview. Missing highlights never delete old cards.

AI is explicit opt-in per generation action: only selected original highlights
are sent to the configured Volcengine endpoint. Keys never reach the browser.
Check that each generated question can be answered fully from its highlight;
schema validation does not guarantee semantic correctness. Review and edit
questions in the resulting card group. Pause, network failure or model failure
retains successful questions without importing an incomplete batch. Retry only
the remaining questions; import-stage failure retries the import, not AI.

Automatic-job drafts are saved transactionally in a separate local IndexedDB
`recall-weread-drafts`, with a seven-day validity window. Refresh or reopening
shows the job paused, never automatically resumes it. Drafts contain personal
originals and generated questions and do not synchronize between devices or
join `.recall` backups. Explicit cancellation deletes only the job draft, not
cards. Invalid/expired drafts block automatic execution and offer cancellation.
Storage failure stops further AI calls; keep the page open to retry unsaved
in-memory work. Clearing browser/site data can lose drafts as well as cards.

Web Locks serialize job execution between tabs. Unsupported browsers use the
manual path instead. Existing-card content or position changes require renewed
confirmation; compatible review progress is preserved. An uncertain card-save
completion is checked against source identities before retry, preventing duplicate
cards. A failed completion receipt save may mean cards are already written, so
the UI does not promise that every import-stage error implies no card changes.

## Service Limits And Secrets

Protected POST endpoints are `/api/weread/books`, `/api/weread/book`,
`/api/weread/progress`, `/api/weread/budget` and `/api/weread/question`.
They require device authentication and same-origin
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
  The UI reads remaining budget before sending originals. This is conservative
  and not a reservation: other devices can consume budget meanwhile, and cached
  questions may not require model attempts. The server cap remains authoritative.
- WeRead read requests share 120/hour; online imports cap five books and 1000
  highlights per batch, with strict 5MiB validation.
- No automatic whole-book sync, paid infrastructure, external knowledge or
  model tools. Automatic writes occur only for the explicitly confirmed batch.
  No schema migration is required by this UI/progress/budget release.

## Runtime Compatibility

Cloudflare Workers rejects `redirect: 'error'` before sending an upstream
request. The server uses `redirect: 'manual'` instead and rejects every
non-success response, including redirects, without following `Location` or
forwarding credentials. This applies to both WeRead and Ark requests.
See [Cloudflare Request documentation](https://developers.cloudflare.com/workers/runtime-apis/request/).
Node-only fetch mocks cannot establish Workers compatibility; validate the
deployed server logic in local workerd as well. A local runtime pass does not
prove production egress or successful connection from the installed iPhone PWA.

## Bounded 24-Hour Smoke

The user canceled scheduled smoke on 2026-10-31 after shortening its window.
Heartbeat `recall-ai` is paused; there are no further automatic probes.
One explicitly requested current probe passed at 2026-10-31T20:46:22.020+08:00.
The guard below remains available for deliberate manual use, not an active
schedule. Do not resume it without a new user request.

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
