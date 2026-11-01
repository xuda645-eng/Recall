# WeRead Image Capability Decision And Daily Budget Confirmation

## Identity And Scope

- Record time: `2026-11-01T14:24:11+08:00`, Asia/Shanghai.
- User decision: if official book-image resources are unavailable, do not ship
  the proposed image viewer. Daily model attempts remain approved at 300.
- Task scope: official capability research, current-production confirmation,
  documentation and publication. No app source or infrastructure change.
- Repository: `https://github.com/xuda645-eng/Recall`, branch `main`.
- Documentation baseline: `891af263f6484b52b90df4801799f577a515a00c`.
- Work performed in an independent clean clone. The original workspace's
  unrelated dirty agent-policy and documentation files were not changed.
- Normal standing delivery authorization applies; the optional parallel Skill
  was not activated. No private highlights or screenshots are published.

## Official Research

- Checked the [official Skill introduction](https://weread.qq.com/r/weread-skills),
  Tencent's [Skill specification](https://github.com/Tencent/WeChatReading/blob/main/skills/SKILL.md),
  [notes contract](https://github.com/Tencent/WeChatReading/blob/main/skills/notes.md)
  and [book contract](https://github.com/Tencent/WeChatReading/blob/main/skills/book.md).
- Downloaded the current official package with:
  `curl -L --fail --connect-timeout 10 --max-time 45 -sS https://cdn.weread.qq.com/skills/weread-skills.zip -o /tmp/recall-weread-skills-research-20261101.zip`.
  Inspected it without installing or altering the local Skill. It still reports
  version `1.0.5`. Official/local SHA-256 values match for the three relevant
  files: `SKILL.md`, `notes.md`, `book.md`.
- Queried the fixed official gateway read-only with `api_name=/_list`, top-level
  arguments and `skill_version=1.0.5`. HTTP 200, 17 registered APIs, no upgrade
  instruction. None declares chapter-body or book-interior image retrieval.
- Requeried the user-selected mixed highlight via `/book/bookmarklist`, following
  the official notes contract. HTTP 200. The matching response contains text,
  a `U+FFFC` object placeholder and caption, but no image URL, resource ID,
  binary or rich-text image node. Private book/highlight identifiers and original
  text remain outside Git and are intentionally omitted from this record.
- Book metadata's cover is not an interior figure. `/review/single` documents
  thought/review rich text, not a book-figure endpoint. No unrelated thought was
  fetched to manufacture an apparent image source.
- The prior anonymous reader-page inspection found empty chapter-body state,
  not the selected figure. This was not an authenticated reader extraction.
- Search recovery: `python3 /Users/bytedance/.agents/skills/byted-web-search/scripts/web_search.py '微信读书 官方 Skills API 图片资源 接口' --count 6`
  failed with `invalid_api_key`, then its error handler raised
  `NameError: AGENT_PLAN_URL`. Recovered with the available built-in web search
  and primary Tencent documentation; no credentials were changed or requested.

This is evidence that the current public Skill does not supply a usable original
image resource for this flow, not an official statement that the capability will
never be opened. Unknown APIs, guessed CDN paths, browser cookies, login bypass,
DRM bypass and whole-book extraction were not attempted.

## Product Decision

- Image capture/import, inline image opening, image-only viewing, pinch zoom,
  drag and viewer close remain unpublished. The separate prototype is not part
  of production. No manual screenshot or AI redraw is substituted for original
  image acquisition.
- Existing text imports remain unchanged and are not represented as complete
  mixed text/image imports when only a placeholder was returned.
- Reopen implementation only after an explicitly supported, authorized official
  resource source is available and an actual mixed highlight retrieves its image
  and text order successfully.
- The daily 300 budget is already implemented and released separately. The
  current 20-question per-action ceiling was not changed by either that release
  or this documentation task. Whole-book generation is not shipped here.

## Existing Daily-300 Publication

- Deployed source: `9b85a1831ce52c1823c1e029b4e3c3559f1e159f`.
- Production deployment: `d6bc9380-4279-4d25-9e60-14b251d26f37`,
  <https://d6bc9380.recall-memory.pages.dev/>.
- Stable production origin: <https://recall-memory.pages.dev/>.
- Public `/version.json` returns `1.0-20261101-1350`.
- Read-only `npx --yes wrangler@4.156.0 whoami` verified account
  `751b9fca4f5173fd70e0dfb69cff81e2`; `npx --yes wrangler@4.156.0 pages deployment list --project-name recall-memory --environment production`
  confirms this is still the current production deployment and source.
- Source inspection confirms shared `AI_DAILY_MODEL_ATTEMPTS = 300` drives the
  server limiter, remaining-budget endpoint and client validation. All commits
  from deployed source to this task baseline change documentation only.
- All personal-space devices share the UTC-day budget, failed model attempts
  count and existing usage is retained. UTC midnight is 08:00 in China.
  Raising the ceiling does not make model calls free or start generation.
- Original app/cloud/mobile/build validation and the public WebKit/physical
  limits remain recorded in [the daily-300 release](./20261101T134408+0800-weread-daily-300.md).
  This task does not retroactively claim full installed-iPhone acceptance.

## Validation

- Windows vault and Graphify are unavailable on this Mac. Read the project
  handoff and owner-file map before targeted source inspection; no graph update
  is claimed for this documentation-only task.
- Reran tests against the unchanged deployed implementation in its prior clean
  release worktree, not the original dirty workspace:
  `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts cloud-tests/weread-budget.test.ts cloud-tests/weread.test.ts`:
  2 files, 133 passed, 740ms.
- `node node_modules/vitest/vitest.mjs run src/services/weread-job-storage.test.ts`:
  1 file, 12 passed, 611ms. The above suites exercise daily boundaries,
  failure counting, cache reuse, rollover and client acceptance/rejection using
  synthetic mocks/local SQLite; no real model generation or library writes.
- Public origin responds HTTP 200 and exposes the already released version.
  Inline Node verification fetched the main entry script, manifest, `sw.js`,
  `version.json` and both 192/512 icons: all six returned HTTP 200 and SHA-256
  matched the unchanged deployed worktree's dist files. This is resource
  integrity verification, not a new browser/installed-PWA acceptance run.
- The same inline verifier then timed out twice on an anonymous budget request
  with a 45-second fetch timeout, so it did not reach its link-check phase.
  Did not report the combined command as a pass. Approved unsandboxed recovery:
  `curl --silent --show-error --connect-timeout 10 --max-time 45 --retry 1 -X POST https://recall-memory.pages.dev/api/weread/budget -H 'Origin: https://recall-memory.pages.dev' -H 'Content-Type: application/json' --data '{}' -D /tmp/recall-weread-approval-budget-headers.txt -o /tmp/recall-weread-approval-budget-body.json -w '\nAnonymous budget HTTP: %{http_code}\n'`:
  HTTP 401, preserving the auth gate; no device credential or model call.
- Reran the Markdown checker separately: 31 relative links resolve. HEAD
  requests to the four Tencent documentation URLs and the existing Cloudflare
  Request documentation all returned HTTP 200. Privacy scan found no personal
  book/highlight identifiers, original excerpts, screenshots or credential
  values in the new record. `git diff --check` passed.
- No new app code exists to lint/build or physically accept in this task; no
  redundant app deployment, D1 migration, production mutation, counter reset,
  secret change, new service, paid resource or scheduled AI probe is performed.

## Publication And Recovery

Documentation commit/push are pending at record creation. Actual source identity,
push outcome and completion time will be appended in a documentation-only
follow-up. This does not trigger an app deployment.

Current and previous app deployment for this task are both `d6bc9380`; this task
does not change production bytes or data. A documentation correction uses a new
reviewed commit and normal push, without history rewriting. If the prior budget
release needs asset rollback, follow its own compatible rollback record, verify
the current deployment first and do not replace an unrelated newer release.
