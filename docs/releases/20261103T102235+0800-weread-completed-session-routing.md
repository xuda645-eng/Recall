# Fix WeRead Completed-Session Routing

## Identity And Scope

- Release ID: `20261103T102235+0800-weread-completed-session-routing`.
- Initial task timestamp captured: `2026-11-03T10:22:35+08:00`, Asia/Shanghai.
- Publication preparation resumed: `2026-11-03T10:32:39+08:00` after the user
  confirmed unrelated disappearing Skill changes should be ignored and only
  this chat's completed work should ship.
- Status: published and publicly verified. Local validation checked at
  `2026-11-03T10:36:45+08:00`; public checks completed
  `2026-11-03T10:45:47+08:00`, final package/evidence check
  `2026-11-03T10:47:11+08:00`.
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

- Source: `9953836750e0ff856c02afc57c4470d395bca307`. Normal HTTPS push advanced
  main `460aa03..9953836`, confirmed `2026-11-03T10:37:36+08:00`. Reviewed commit
  contains only this chat's eight app/test/documentation/evidence files, no Skill
  changes. All 310 committed input hashes and 203 immutable package hashes passed
  before publication. Production was rechecked immediately before deployment.
- Command: `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes
  wrangler@4.156.0 pages deploy /private/tmp/recall-weread-completed-routing-20261103/dist
  --project-name recall-memory --branch main
  --commit-hash 9953836750e0ff856c02afc57c4470d395bca307
  --commit-message 'fix: prevent completed WeRead merges from hijacking new imports'`.
  No dirty flag. Compiled unchanged Worker, uploaded 27 files, reused 174,
  uploaded headers/Functions/routes. CLI completion timestamp:
  `2026-11-03T10:39:04+08:00`.
- Deployment: `0325b1a9-edc0-42d2-a179-095dc38ec6b1`, Production/main/source
  `9953836`, URL `https://0325b1a9.recall-memory.pages.dev`.
  Stable origin remains `https://recall-memory.pages.dev/`, version
  `1.0-20261103-1033`.
- Read-only `verify-public.mjs` from the isolated task directory checked 25
  exact live file digests, root manifest/icons, entry/preload/WeRead assets,
  Service Worker/Workbox and version JSON. Version matches the package and is
  served no-store. Six same-origin anonymous WeRead POST `{}` endpoints, including
  merge, returned 401/no-store, without credentials or real model input.
  Private-local evidence: `public-http-evidence.json`.
- `RECALL_VERIFY_DIST=/private/tmp/recall-weread-completed-routing-20261103/dist
  node scripts/run-playwright.mjs --config e2e/weread-public.config.ts --workers=1
  --output=/private/tmp/recall-weread-completed-routing-20261103/public-results`:
  3/3 passed, 17.2 seconds. Synthetic public selection, concurrent generation,
  preserved example-entry removal, resource hashes and anonymous gates passed.
- First public merge command: `RECALL_MERGE_URL=https://recall-memory.pages.dev/
  RECALL_MERGE_OUTPUT=/private/tmp/recall-weread-completed-routing-20261103/public-merge
  node scripts/run-playwright.mjs --config e2e/weread-merge.config.ts --workers=2
  --timeout=120000`: 22 passed / 2 failed, 3.3 minutes. All six new completed-
  record / consecutive-book regressions passed in both engines on this attempt.
  Do not report this initial suite as fully passing.
- Chromium mode-selection case timed out at the initial public `page.goto('/')`
  while waiting for load, before performing the feature assertions. WebKit's
  internal synthetic-demo case failed to find the connection button; its trace
  shows the test's injected `#weread` becoming `#home` during initial hydration.
  This is consistent with the fixture changing the hash before the existing
  route-initialization effect settles. Owning `memory-workspace.tsx` route
  initializer/effect is unchanged by this release. This observed synthetic-
  startup timing issue is not claimed fixed.
- Targeted recovery retained production code, tests and assertions, but reduced
  workers to one: `RECALL_MERGE_URL=https://recall-memory.pages.dev/
  RECALL_MERGE_OUTPUT=/private/tmp/recall-weread-completed-routing-20261103/public-merge-recovery
  node scripts/run-playwright.mjs --config e2e/weread-merge.config.ts
  --grep '生成方式只是选择|内部合成草稿' --workers=1 --timeout=120000`:
  4/4 passed, 33.6 seconds, completed `2026-11-03T10:44:43+08:00`.
  All 24 distinct merge cases have passing public evidence across the initial
  and recovery runs; this is not a single clean 24-case aggregate run.
- The initial shell chain stopped before public PWA checks after merge failed.
  A separate protected public PWA run used one worker and the same six cases:
  `RECALL_URL=https://recall-memory.pages.dev/ node
  /Users/bytedance/Documents/CodexProject/Recall/Recall-next/scripts/run-playwright.mjs
  --config /Users/bytedance/Documents/CodexProject/Recall/Recall-next/playwright.config.ts
  --grep '抽屉显示固定构建版本|版本刷新检查后|PWA部署路径' --workers=1
  --output=/private/tmp/recall-weread-completed-routing-20261103/public-pwa-results`,
  from the isolated task directory. 6/6 passed, 1.6 minutes, completed
  `2026-11-03T10:45:47+08:00`. Version and refresh checks use the public origin
  in both engines; Chromium proves public SW/offline reopening and synthetic
  local review persistence. The shipped WebKit offline test deliberately uses
  an isolated local copy, not public WebKit offline proof. Across suites, 32
  distinct public-origin cases plus one local fallback have passing evidence
  across the initial/recovery runs. Physical-phone retesting remains outstanding.
  Logs are
  `/private/tmp/recall-weread-routing-public{,-merge,-merge-recovery,-pwa}.log`.
- No product-code or test-assertion change, repeat app deployment, migration,
  owner-library mutation or rollback occurred during public recovery. Skill
  edits appearing concurrently are explicitly outside this task and retained.
- Final source/package integrity recheck passed at
  `2026-11-03T10:47:11+08:00`: the same 310 committed inputs / 203 immutable
  files still match source `9953836` and version `1033`. No runtime-code changes
  were made during publication or recovery.
- Final evidence follow-up is documentation-only, updating this record, the
  prior button-removal record and the release index. Its Git locator is the
  commit updating this publication section. Commit/push outcome is reported in
  the final delivery status; no second app deployment is triggered.
