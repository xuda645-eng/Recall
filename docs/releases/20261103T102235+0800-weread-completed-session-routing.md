# Fix WeRead Completed-Session Routing

## Identity And Scope

- Release ID: `20261103T102235+0800-weread-completed-session-routing`.
- Initial task timestamp captured: `2026-11-03T10:22:35+08:00`, Asia/Shanghai.
- Publication preparation resumed: `2026-11-03T10:32:39+08:00` after the user
  confirmed unrelated disappearing Skill changes should be ignored and only
  this chat's completed work should ship.
- Status: applicable local checks passed; ready for source commit/push and
  production publication. Validation checked at `2026-11-03T10:36:45+08:00`.
- Repository: `xuda645-eng/Recall`, branch `main`, starting source
  `460aa03c2d4fa29001b01de3035be110c9941f05`.
- Request: fix a physical-phone report where entering WeRead or starting a new
  book's merge incorrectly opens a previous completed merge result.
- Scope is this chat's WeRead changes and their tests/documentation only. No
  Skill, private card-batch, source-document, API or database-schema changes.

## Root Cause And Changes

- `loadMergeSession()` previously returned completed sessions as active drafts.
  Both online-entry recovery and new-merge initialization prefer the stored
  draft, so a previous result replaced the intended connection/selection flow.
- Completed sessions now return no active draft after format validation and
  before expiry checking. Valid completed records older than seven days also
  cannot block a new import. Raw records are not deleted by this read; a new
  persisted draft can replace the old completed slot under the existing lock.
- Unfinished drafts still recover with the existing pause/expiry/revision and
  cross-tab safeguards. Malformed records still fail validation.
- After a successful confirmed merge import, the parent switches its return
  destination to the bookshelf and clears prior selections without replacing
  the merge component's drafts. The current completion page remains visible;
  top-bar Back and the new secondary action both return to the bookshelf.
- Completion summary now shows actual added/updated/skipped counts instead of
  saying the cards have not yet been confirmed. View-deck navigation is retained.
- Regression tests seed completed records before entry and after selecting a
  book, including an eight-day-old completed record. The full synthetic flow
  imports two distinct books, checks actual merge request book IDs, confirms
  the first book's cards remain byte-equivalent, then reopens WeRead.
- The previous public synthetic example entry remains removed. No CSS, device
  credentials, cloud schema, paid infrastructure or production-origin change.
- Bootstrap: Windows Obsidian vault unavailable and Graphify absent on this Mac;
  used the session handoff/project map and targeted owning-source inspection.

## Validation Evidence

- Before editing app source, `node scripts/run-playwright.mjs --config
  e2e/weread-merge.config.ts --project merge-iphone15-chromium --grep
  '已完成0|选书后出现' --workers=1`, with
  `RECALL_MERGE_OUTPUT=/private/tmp/recall-weread-completed-routing-20261103/baseline`:
  both regression cases failed. Failure snapshots show the previous synthetic
  completed merge heading/book instead of the intended entry/current book.
  Evidence: `/private/tmp/recall-weread-routing-baseline.log` and its local traces.
  These are expected pre-fix failures, not a passing baseline.
- Fixed full merge command: `RECALL_BUILD_VERSION=1.0-20261103-1040
  RECALL_MERGE_OUTPUT=/private/tmp/recall-weread-completed-routing-20261103/fixed
  node scripts/run-playwright.mjs --config e2e/weread-merge.config.ts --workers=2`:
  24/24 Chromium/WebKit cases passed, 1.0 minute. This test version is not the
  final production marker. Log: `/private/tmp/recall-weread-routing-merge.log`.
- `node node_modules/vitest/vitest.mjs run`: 90 files / 1558 tests passed,
  31.49 seconds, started `2026-11-03T10:26:22+08:00`.
- `node node_modules/eslint/bin/eslint.js .`: zero errors / 132 existing warnings.
- `node node_modules/typescript/bin/tsc -b --noEmit`: passed. Unit, lint and
  types command exit statuses were each zero. Logs are
  `/private/tmp/recall-weread-routing-{unit,lint,types}.log`.
- Initial production build passed with 161 precache entries / 3341.91 KiB.
  Existing large-chunk warning retained. Final release build uses the current
  Asia/Shanghai minute, `1.0-20261103-1033`: `RECALL_BUILD_VERSION="1.0-$(TZ=Asia/Shanghai
  date +%Y%m%d-%H%M)" node node_modules/vite/bin/vite.js build --mode production
  --outDir /private/tmp/recall-weread-completed-routing-20261103/dist --emptyOutDir`.
  This isolated output was not served while rebuilding; the main `dist/` and
  previous task's served bundle were not changed. Final build passed with the
  same precache count/size. Log: `/private/tmp/recall-weread-routing-release-build.log`.
- Captured 310 tracked production input hashes and 203 package-file hashes in
  private local `bundle-integrity.json`. Verify inputs against committed Git
  blobs and verify the immutable bundle immediately before deployment.
- Core PWA command, from the isolated output's parent directory: `node
  /Users/bytedance/Documents/CodexProject/Recall/Recall-next/scripts/run-playwright.mjs
  --config /private/tmp/recall-weread-completed-routing-20261103/pwa-local.config.mts
  --workers=2 --output=/private/tmp/recall-weread-completed-routing-20261103/pwa-results`.
  This inherits the shipped config, uses port 4246 with no production APIs,
  absolute paths and the mandatory browser guard/global setup. The `RECALL_URL`
  flag is not set, so local-only acceptance tests are not silently skipped.
  82/82 cases passed, zero skipped, 2.1 minutes. This includes mobile shell and
  safe areas, import/update, reader/rating/undo, editing, installed-identity
  simulation, old-to-new worker activation, refresh persistence, manifest/icons
  and offline reopening. Log `/private/tmp/recall-weread-routing-pwa.log`.
- Browser commands use approved unsandboxed execution, cached Chromium-1223
  and WebKit-2272, 393 x 852 CSS pixels / DPR 3, touch/mobile mode. No OS guard,
  test assertion or security setting was weakened. All books/model responses
  in merge tests are synthetic/intercepted, not production library/model calls.
- All 51 local Markdown links resolve; `git diff --check` passed. All eight
  reviewed task files are scoped to this chat's requested work/evidence.
- No cloud/D1 code changes; server mutation tests are not applicable. No real
  user highlights, library changes, storage clearing or model mutations used.
- Physical iPhone screenshot is failure evidence only. The fix still requires
  physical-phone retesting; simulation does not establish Safari-installed PWA,
  native keyboard or physical offline/update acceptance.

## Hosting And Recovery

- Existing OAuth account `751b9fca4f5173fd70e0dfb69cff81e2` and Pages project
  `recall-memory` verified with Wrangler 4.156.0 `whoami`, `pages project list`
  and `pages deployment list --project-name recall-memory --json`.
- Remote main matches starting source. Production before this release:
  `1abcd1e9-9798-44ea-b400-a8764e60d3dd`, source `460aa03`, version
  `1.0-20261103-1015`, URL `https://1abcd1e9.recall-memory.pages.dev`.
- Stable origin remains `https://recall-memory.pages.dev/`.
- Prior deployment is an asset-compatible fallback for a new regression, not
  a claim of fully correct routing: it contains the user-reported completed-draft
  bug. Recheck current production before a Pages dashboard rollback so another
  task's newer release is not replaced. Prefer a validated forward fix if the
  original routing issue is the only failure.
- An asset rollback does not undo cards, review history, browser data, D1 or
  worker caches. Never clear phone storage, restore databases, reverse migrations
  or rewrite shared Git history to recover this release.

## Publication

- Commit/push source SHA, immutable-package verification, deployment ID/URL,
  public test outcomes and timezone-qualified completion timestamp pending.
- Append actual outcomes in one documentation-only follow-up commit/push;
  no second app deployment for that evidence update.
