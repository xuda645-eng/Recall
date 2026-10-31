# Release Coordination And Read-Only Diagnosis

- Task ID: `20261031T223906+0800-release-coordination-diagnosis`.
- Scope: requested monitoring of a concurrent Recall publication, then read-only
  investigation of the reported Logo blur and failed online WeRead connection.
- Status: concurrent publication confirmed complete; defect diagnosis incomplete.
  No application fix or additional Pages deployment is claimed by this task.
- Timezone: Asia/Shanghai (`+08:00`). Monitoring started at
  `2026-10-31T22:15:00+08:00`, confirmed complete at
  `2026-10-31T22:30:19+08:00`; record created at
  `2026-10-31T22:39:06+08:00`.
- Repository/branch: `xuda645-eng/Recall`, `main`.
- Baseline at monitoring start: `34052b9f0c3f3df4cddfb9d738ac1148bf16d532`.
- Baseline after the other session completed:
  `6546dc29881b5c8ff239a4adeab23f7cf35c9319`.
- This task changes only this record and `docs/RELEASES.md`. No app bundle, API,
  credentials, device authorization, database, cards or review progress changed.

## Coordination Evidence

The user confirmed another session owned the changing files and requested waiting
for its publication to finish. This session did not edit, build, stage, commit or
deploy its work. Read-only Git/build metadata was sampled every 30 seconds.

- At 22:15, eight tracked/untracked application and acceptance paths were changing.
  At 22:20 the other session added its startup-optimization release record.
- Its implementation commit `8eb2c8b1885f58a58c9b23622f4be895192a439d` appeared
  at 22:21:38. A clean worktree alone was not treated as completion: the monitor
  also waited for production publication and the evidence follow-up.
- `git ls-remote origin refs/heads/main` confirmed the implementation was pushed.
  `npx --yes wrangler@4.156.0 pages deployment list --project-name recall-memory`
  confirmed Production/main deployment
  `0f97f0c9-a0f8-4271-b59f-417f1ff7303c`, source `8eb2c8b`.
- At 22:28:41 the other session committed final evidence as `6546dc2`.
  By 22:30:19 the worktree had remained clean for at least 90 seconds,
  the release record described completed verification, and remote main matched
  the full follow-up SHA. Only then did this session resume diagnosis.
- The other session's complete validation and limitations remain in
  [its release record](./20261031T222000+0800-startup-optimization.md).

## Diagnostic Evidence And Limits

- A fresh isolated WebKit browser used the production origin, 393 x 852 CSS
  pixels, DPR 3, touch/mobile mode and no owner session. Computed topbar styles
  were `position: fixed`, opaque `rgb(246, 245, 239)`, `filter: none` and
  `backdrop-filter: none`. The foreground shell still had the identity transform
  `matrix(1, 0, 0, 1, 0, 0)`. This is a candidate for further fixed-position/system
  edge investigation, not proof of the physical iPhone blur's unique cause.
- Current WebKit owning source was read at
  [LocalFrameView.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalFrameView.cpp),
  along with [the earlier fixed-edge sampling change](https://github.com/WebKit/WebKit/pull/43516).
  These describe fixed-container edge sampling, not the user's exact iOS build.
  No physical-device acceptance or additional blur fix occurred.
- `node /tmp/recall-weread-live-check.mjs` passed against the real WeRead gateway
  with local synthetic SQLite accounting: 20 notebook rows, valid pagination
  cursor and one selected book's highlights passed the real importer validation.
  No book titles, source text, credentials or IDs were printed. No personal text
  went to a model, and no production library writes occurred. This proves the
  local credential/gateway/parser path, not Cloudflare production egress.
- Inspection of `src/services/weread-online.ts` confirms most non-401/429/503
  failures are presented as one generic timeout/invalid-response message. The
  phone screenshot therefore does not identify the precise failing stage.
- Two attempts to connect production request logging used
  `npx --yes wrangler@4.156.0 pages deployment tail
  0f97f0c9-a0f8-4271-b59f-417f1ff7303c --project-name recall-memory
  --format json --method POST`, piping output into a sanitizer retaining only
  path/method/status/outcome/duration and exception names. Both exited with
  network `AggregateError [ETIMEDOUT]` before usable logs were observed.
  The second attempt was the bounded recovery; no network or certificate setting
  was changed. Do not claim the monitor captured a phone retry or that production
  connectivity, upstream authentication or timeout behavior passed.
- The sandbox denied the initial `ps` process-list read. The same read-only
  operation outside the sandbox succeeded. No process belonging to the other
  session was stopped, and no source work was reverted.

Further repair requires evidence from the actual failed production request and
physical iPhone/iOS verification. Neither problem is marked fixed merely because
the separate startup release completed. No guessed credential replacement,
security weakening, phone storage clearing, fake bookshelf or automatic import
was used to bypass the missing evidence.

## Publication And Recovery

- Documentation validation: relative Markdown links, task-scoped diff whitespace
  and staged scope/privacy review. Exact outcomes are appended before commit.
- Documentation source locator: the commit adding this record; the final chat
  reports its SHA and push outcome without another self-reporting commit.
- Production URL remains <https://recall-memory.pages.dev/>; current deployment
  URL is <https://0f97f0c9.recall-memory.pages.dev/>. This task did not replace it.
- No new app deployment or rollback target is introduced. The concurrent release
  retains compatible prior deployment `d606405a-f52d-42de-90bc-6ca5b961cfcf`;
  it is not a physically verified fix for the Logo blur.
- To correct this documentation, use a scoped normal commit/push. No Pages,
  database, device storage or Git-history rollback is needed or authorized here.

At `2026-10-31T22:40:04+08:00`, `git diff --check` passed; the Node relative-link
and public-record privacy/style check passed with 13 resolved links. Worktree
scope contained only the two documentation paths for this task. Application
tests/build were not rerun for documentation-only changes. Commit/push outcome
is reported in the final chat; no application release is triggered.
