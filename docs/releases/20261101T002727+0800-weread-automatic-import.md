# WeRead Book Selection And Automatic Import

- Release ID: `20261101T002727+0800-weread-automatic-import`.
- Scope: requested production UI based on the approved WeRead prototype,
  protected metadata/progress/budget APIs, durable local job safety and tests.
- Repository/branch: `xuda645-eng/Recall`, `main`.
- Record created: `2026-11-01T00:27:27+08:00`. Initial implementation start was
  not captured; the final validation sequence began at `00:17:37+08:00`.
- Status: local validation passed; source publication and production deployment pending.
- Implementation source locator: the commit adding this record. Actual SHA,
  commit/push, deployment, verification and completion times appended below.
- Production origin remains <https://recall-memory.pages.dev/>.
- Previous production, queried at approximately `00:19+08:00`:
  `2abbe90f-669c-42b8-9047-61f5228cfc9a`, source `dfed397`,
  <https://2abbe90f.recall-memory.pages.dev/>. This includes the parallel
  runtime/topbar repair, whose dirty release record is excluded from this task.

## Changes

- Default WeRead route now presents a minimal connection page matching the
  approved paper/graphite/olive prototype. The shared Logo, appbar and drawer
  remain unchanged. The existing manual/file/demo path stays under other imports.
- Real notebook cards support loaded-page title/author search, reading-status
  and imported filters, note/progress sorting and paginated loading. Five books
  maximum per batch. Cards display sanitized cover, marked-finished status,
  own highlights, total notes and note date when available. Missing metadata
  stays unknown. Total notes are not mislabeled importable highlights.
- Visible-card progress uses authoritative integer 0-100 `/book/getprogress`,
  with two concurrent reads maximum. Notebook percentage units are not guessed.
  Only personal bookmark-list highlights are imported, never popular/dashed
  public highlights, thoughts, bookmarks or entire book text.
- One explicit confirmation covers selected originals and changed-card updates.
  At most 20 questions, 6000 characters per candidate; budget preflight occurs
  before transmitting originals. Serial generation must fully succeed before
  the atomic normal card-save path runs. Originals remain exact answers.
- A separate seven-day local IndexedDB job preserves successful questions.
  Refresh pauses rather than resumes. Storage/model/network failures stop work;
  retries generate only remaining questions. Import failure retries only import.
  Uncertain completed writes use duplicate-safe source IDs and filtered updates.
  Completion-receipt failures distinguish already-written cards from no write.
- Web Locks serialize tabs; current content/position conflicts require renewed
  confirmation and preserve successful questions. Review progress, histories,
  imported dates and archives remain compatible. Explicit cancellation affects
  only the job draft. Invalid/expired storage offers cancellation or manual use.
- `/api/weread/progress` and `/api/weread/budget` reuse device authentication and
  same-origin gates. Budget reads existing UTC-day counters, does not reserve or
  spend budget, and rejects invalid configuration/counters. Existing upstream
  redirect and timeout behavior is untouched. No migration, production D1 writes,
  new secrets, infrastructure, plan upgrade or paid model validation.
- Test configs use installed Node entry points and an explicit local test port.
  Browser safety guards remain intact. Unit collection excludes separate cloud
  and prototype suites, which use their own runtimes.

## Validation Evidence

Run from `Recall-next`, Node with existing installed dependencies. Browser env:

```sh
export RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
export RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'
```

Browser commands run outside the macOS Seatbelt sandbox through the guarded
launcher with tool approval. No production credentials or cards enter tests.

| Command | Observed result |
|---|---|
| `node node_modules/vitest/vitest.mjs run --coverage` | Final 69 files / 1197 tests passed; statements 40.18%, branches 37.81%, functions 34.74%, lines 43.66%, configured floors passed. |
| `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts` | 3 files / 187 tests passed, including 41 budget cases. |
| `node node_modules/typescript/bin/tsc -b` | Passed. |
| `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json` | Passed. |
| `node node_modules/eslint/bin/eslint.js .` | Passed: 0 errors / 132 existing warnings. Pre-final stale fixture `any` was corrected. |
| `RECALL_WEREAD_PORT=4198 node scripts/run-playwright.mjs --config e2e/weread-online.config.ts` | 38 passed in 2.5 minutes: old manual/AI path plus new auto path, Chromium and WebKit. |
| `RECALL_WEREAD_PORT=4198 node scripts/run-playwright.mjs --config e2e/weread-online.config.ts --grep '正式连接\|确认后真实\|失败全批\|超过20条\|选书页\|草稿写入\|生成后的\|卡片保存\|另一个页面\|卡片已写入\|内容冲突'` | 22 passed in 1.5 minutes after final strict persisted-job/position validation. |
| `node scripts/run-playwright.mjs --workers=2` | 44 passed in 1.5 minutes: iPhone 15 PWA, 393 x 852 CSS px, DPR 3, both browsers. Includes shared shell, touch/scroll, import, review/undo, archive, safety insets, narrow/landscape/desktop, SW and offline persistence. |
| `RECALL_WEREAD_PORT=4198 node scripts/run-playwright.mjs --config e2e/weread-online.config.ts --grep '选书页'` | 2 passed in 15.9 seconds; final added geometry assertion keeps the primary dock button above a 34px bottom safety inset. |
| `node scripts/weread-runtime-probe.mjs --runtime-modules /Users/bytedance/.npm/_npx/2fea031b5bd76b2e/node_modules` | 12 check groups passed in workerd 1.20261023.1, 21 intercepted synthetic gateway requests, zero real external calls; ephemeral local D1 only. Auth/origin/revocation, metadata/progress units, redirect rejection, budgets and unchanged synthetic library checked. |
| Committed-source production build | Pending publication section. |
| `git diff --check` | Passed before publication; staged review also required. |
| Task-doc relative Markdown link check and `node --check scripts/weread-runtime-probe.mjs` | Passed. |

Logs are private local artifacts under `/tmp/recall-weread-final-*`. Screenshots
`/tmp/recall-weread-{landing,books}-weread-iphone15-{chromium,webkit}.png` contain
only synthetic data. The Chromium mobile landing and book-list renders were
visually inspected; no horizontal overflow or clipped primary action observed.

### Failures And Recovery

- Initial default Vitest collection included the new cloud budget test under
  happy-dom and could not bundle `node:sqlite`. Explicitly separated cloud tests
  and reran both suites successfully; no test assertion removed.
- First browser run could not start because 4197 was already occupied. Kept the
  existing process, added a validated configurable local port, used 4198.
- First migrated legacy browser run rejected 4198 due to its old hardcoded
  origin whitelist. Updated the whitelist to the same explicit loopback port;
  all real/foreign/unmocked API requests remain prohibited. Full 38 passed.
- Main PWA server startup using `pnpm exec` failed with
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Reused installed Vite Node entry
  points instead of reinstalling or deleting shared dependencies. Full 44 passed.
- Early runtime-probe Miniflare options/local SQL setup failed and were corrected
  before the successful synthetic workerd run. No production fallback used.
- Windows vault and Graphify are unavailable on this Mac. Session handoff and
  the instructed source map were used; no Graphify update could be run.

## Publication And Verification

Pending final checks, task-scoped commit, normal push, exact committed archive
build, deployment and non-destructive public checks. Preserve and exclude
`docs/releases/20261031T232024+0800-topbar-weread-runtime.md`; never release
unrelated dirty files or private card batches. Append actual outcomes here.

## Limits And Recovery

- Physical iPhone Safari/home-screen installation, dynamic keyboard/safe areas,
  OS blur, background suspension, update and offline cold start are unverified.
  Browser simulation is not physical-device acceptance.
- Real authorized WeRead account/Ark generation is unverified by this task.
  Synthetic tests prove flow/safety, not upstream availability or question quality.
  Public checks must not invoke real AI or mutate the owner's private library.
- Drafts stay local, do not sync between devices and are not card backups.
  Site-data removal may lose them. Budget is conservative, not a reservation.
- Compatible rollback target is the recorded previous Pages deployment. No schema
  changes are introduced; the existing private D1/auth and device cards remain
  intact. Previous release is not retroactively certified as physically accepted.
- Before rollback, recheck current production belongs to this release, then use
  the Pages API POST
  `/accounts/751b9fca4f5173fd70e0dfb69cff81e2/pages/projects/recall-memory/deployments/2abbe90f-669c-42b8-9047-61f5228cfc9a/rollback`
  through the authenticated Cloudflare tooling. Do not use Worker relay rollback,
  reset D1, clear device data or rewrite Git history. Verify recovered assets,
  API rejection and simulated shell behavior, and record any incident here.
