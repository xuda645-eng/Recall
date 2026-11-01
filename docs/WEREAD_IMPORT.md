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

## 书内图片边界（2026-11-01 核验）

当前官方 Skill `1.0.5` 的划线接口返回 `markText`、章节与位置等信息，
没有声明书内图片 URL、图片资源 ID 或下载接口。官方网关 `/_list`
当日列出的 17 个接口也没有章节正文或书内图片资源接口。实际图文
划线复查只返回上下文字、图注和中间的 `U+FFFC` 对象占位符，没有
取得原图。书籍封面与 `/review/single` 的想法富文本不等于书内插图。

因此目前不发布微信读书图片导入、点击查看、双指缩放或关闭图片查看器
功能。独立交互原型不进入生产包，也不把截图裁剪、AI 重绘或手动补图
作为自动获取原图的替代承诺。现有文本导入保持原样；含图片的划线
不能标为完整图文导入。该结论限于当前公开 Skill 和实测返回，不表示
微信读书永久不开放这项能力。

重新启动图片功能前，需要官方明确提供受支持、获授权的图片资源来源，
并验证一条真实划线的原图、文字顺序和资源访问条件，再开发和验收。
本次核验没有调用未知接口、复用阅读器 Cookie、绕过登录或提取整书。

官方依据：[Skill 介绍](https://weread.qq.com/r/weread-skills)、
[划线契约](https://github.com/Tencent/WeChatReading/blob/main/skills/notes.md)、
[书籍契约](https://github.com/Tencent/WeChatReading/blob/main/skills/book.md)。
每日 300 次模型尝试与图片支持是独立事项。用户随后确认取消单次
20 个问题的限制；在线和手动 AI 路径均依次处理全部选中划线，仍受
下文的每日额度、请求频率、文件容量和单条长度保护。

## 在线选择交互

- 书卡仅在明确标记读完时显示“已标记读完”；在读或状态未知时隐藏标记，阅读进度独立保留。
- 使用顶栏返回按钮：生成确认页返回选书并保留已选书籍，选书页返回导入入口；不再重复提供底部“再选一选”和“返回导入”。运行中的任务仍禁止离开，暂停或完成的草稿不会因为返回而删除。
- 展开划线列表后，可用“全选 / 全不选”复选框切换全部划线。部分选中时显示半选状态，单条选择、已选数量与生成数量同步；全不选时禁止开始生成。选择操作不调用 AI、不写入卡片。

## 智能合并划线 (2026-11-02)

在线选书后的确认页以及 Skill 文件的卡片预览页提供“智能合并划线”。
原有逐条生成与自动导入入口保留，智能合并则先生成分组预览，确认后才
写入卡片。不要把智能合并的预览当作已导入或已通过人工语义审核。

- 模型只返回编号组合与共同问题，不返回答案。服务端给模型的编号是
  批次内 `H001` 等短编号，校验后才映射回稳定的 `bookmarkId`。
- 划线保留 `chapterIdx`、`chapterUid` 与 `range`。按章节序号和位置
  范围的第一个数值排序，不用划线时间或章节 UID 猜顺序；不假设范围
  第二个数值是终点或长度。缺失或存在歧义时禁止智能合并，仍可逐条导入。
- 只合并同书、同章、在所选划线序列中连续的条目，每组 1-4 条。每条
  选中原文恰好归属一张卡。未知、遗漏、重复、重排编号均拒绝，不静默修复。
- 每批最多 12 条、6000 字。长章节在边界保留末组供下一批重新理解；
  已确认的前组不会重复保存，最终原文仍完整且不重复。保留全部原文，
  只在段落之间增加界面分隔，答案文本使用两次换行分隔原始字符串。
- 单批上限不是整本书或单次操作上限。分批依次进行，共享每天 300 次
  模型尝试和每小时 120 次 AI 请求；失败计入尝试，缓存按设备空间、
  EP、提示版本和完整输入隔离。合并请求输出上限为 4096 tokens，原有
  单条请求仍为 384。没有免费调用或固定减卡比例的承诺。
- 默认保护旧卡：智能合并只处理新来源，不自动合并已复习的单卡，不
  改已有分组成员。重复读取已归入分组的划线不会产生新单卡。旧任务若
  与新分组冲突会要求重新检查，不继续无效生成。
- 预览可改共同问题、拆为单条或与下一张合并。拆分/合并后生成的是
  明确标识的通用手动回忆任务，不冒充 AI 新问题，建议改成具体问题。
  这些操作不调用 AI。跨书、跨章、超过 4 条的手动合并也被拒绝。
- 合并原文以 `sourceRef.highlights` 有序保存，包含每条原始字符串与
  定位信息。阅读面分段显示原文。问题编辑不会 trim 原文；合并答案
  只读，Markdown 不能替换其答案。云同步校验答案与来源拼接完全一致。
  `.recall` 导入/导出保留来源与卡片复习字段，不改变既有历史合并规则。
- 独立本机 IndexedDB `recall-weread-merge-drafts` 保存 7 天。刷新后
  不自动执行，需显式继续；成功批次保留，失败不导入残缺结果。Web Locks
  与草稿修订号阻止跨页重复执行。保存失败不继续调用。取消只删草稿，
  不删卡片。草稿不参与云同步或 `.recall` 备份。
- 导入失败可能发生在卡片已经保存之后；重试按稳定来源检查，避免
  重复写入，不重新生成。已有卡片内容发生变化时拒绝覆盖。
- 入口“体验合并示例（合成数据 / 非 AI）”使用原创文本和预置分组，
  不查询真实书架、不调用模型。安全预览环境仅此示例可用，真实连接仍
  要设备鉴权和生产服务配置，预览不拥有生产 D1 或密钥。

分组的结构、原文和顺序可由程序验证，语义合理性仍需检查。模型只理解
所提供的划线，不代表读到了完整章节。图注和对象占位符不等于书内图片，
不得推断未取得的图片内容。有关实书验证、失败与人工拆分结果见本任务
[验证记录](./releases/20261102T010000+0800-weread-highlight-merge.md)。

### 逐条文件格式

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
          "chapterIdx": 1,
          "range": "10-80",
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
displayed originals and changed-card updates. All selected highlights are
processed serially; there is no separate 20-question per-action ceiling. A book
with more than 20 highlights does not require manually choosing batches of 20.
New originals longer than 6000
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
- Both online automatic and manual AI paths process all selected candidates
  serially, with no 20-question truncation or consent ceiling. Stop prevents
  future calls but an already started upstream call may still finish and be
  charged. Successful questions are not regenerated on retry. Automatic jobs
  persist across refresh; manual drafts remain only in the current page.
- All devices in the personal space share a hard 300-model-attempt UTC-day
  budget (failures count), plus 120 AI requests/hour including cache hits.
  Both paths read remaining budget before sending originals. If the remaining
  budget is insufficient for the pending scope, no originals are sent; select
  fewer highlights or continue after the next UTC-day reset. This is conservative
  and not a reservation: other devices can consume budget meanwhile, and cached
  questions may not require model attempts. The server cap remains authoritative.
  This is an application cost/usage safeguard, not a provider's model limit.
  The owner approved increasing it from 100 to 300 on 2026-11-01. Existing
  attempts remain counted; the change does not reset usage, make calls free or
  automatically run additional generation. UTC midnight is 08:00 in China.
  Hourly rate limits still apply to large jobs. If reached during generation,
  the job stops with successful questions retained; resume explicitly after
  the rate-limit window resets. No background retries or incomplete automatic
  imports are introduced by removing the per-action ceiling.
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
