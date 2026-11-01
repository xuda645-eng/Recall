# Source Image Attachments - Pending Integration

## Identity And Ownership

- Role: developer task under explicitly invoked `recall-parallel-delivery`.
- Task start/preview version marker: `2026-11-01T22:28:00+08:00`, Asia/Shanghai;
  this marker is not a claim of publication time.
- Worktree: `/private/tmp/recall-image-attachments-20261101`.
- Branch: `codex/image-attachments-20261101`.
- Baseline: `1c64e517c9ce4030895073ce6e2ec16958c95fda`.
- The user-provided `/Users/bytedance/.codex/worktrees/3986/Recall-next` had
  six pending archive-display files. They were preserved, not copied, committed
  or merged into this new clean worktree. The original main directory remains
  a read-only dependency/reference location for this task.
- Windows Obsidian vault, Graphify and a current-worktree handoff were absent;
  disclosed once and used the supplied architecture table with targeted reads.
- Existing `node_modules` is reused via a dependency-only symlink. No install,
  shared lockfile rewrite or writable source-tree link was created. Task ports
  4198 and 8798 and local D1 `.wrangler/media-test-state` are isolated.

## Implementation

- Added bounded image validation, SHA-256 references and a versioned portable
  image package. PNG/JPEG/WebP images are limited to 512 KiB and 16M pixels;
  import package is limited to 100 images/16 MiB. Missing, duplicate and
  mismatched attachments reject before import. Existing Markdown remains.
- Added PWA IndexedDB attachment persistence, download coalescing, released
  Blob URLs and explicit read/retry errors. Local image save precedes card
  import. Unreferenced files remain conservatively retained, not auto-deleted.
- Added bounded answer previews, modal zoom/reset/pinch/drag/close with safe
  areas and 44px controls; interactions do not rate or navigate cards. Stable
  Markdown image renderer prevents losing open-viewer state on rerenders.
- Added manual attach, replace and remove and explicit complete image backup
  and merge restore, plus scoped group image backup. Normal `.recall` and
  post-import Markdown continue to contain only image references.
- Added independent authenticated binary GET/HEAD/PUT and additive D1 BLOB
  migration with an atomic 64 MiB per-space quota. Device authorization and
  same-origin protections are reused, no ordinary snapshot image bytes or
  review-triggered retransmission. Two background workers do not block text
  synchronization; local/text completion is not image completion.
- Added a sanitized versioned task Skill copy, pre-analysis compression and
  separate immutable-batch image-package generation. Current globally installed
  Skill is intentionally not replaced ahead of the matching app integration.
  Private screenshots, card batches and source responses remain outside Git.
- Added synthetic-only preview preparation with a dedicated worker rejecting
  all `/api` paths. No production DB, auth secret, AI model call, R2, new
  infrastructure, plan upgrade or production data mutation.

Shared integration points: `RichCard.tsx`, `memory-workspace.tsx`,
`memory-cloud.tsx`, `cloud-sync.ts`, `functions/api/[[path]].ts`, PWA docs and
the additive migration. Archive work overlaps workspace/docs, but is absent
from this branch. Review these hunks semantically when merging; do not replace
whole files. `docs/RELEASES.md` is left to the integration owner.

## Validation And Recoveries

Initial full checks: 1430 unit tests, 194 synthetic cloud tests, lint zero
errors/132 existing warnings, app/cloud TypeScript passed. Task Skill tests
passed 52 tests. Final delivery checks ran across 2026-11-01/2026-11-02,
Asia/Shanghai:

- `node node_modules/vitest/vitest.mjs run --coverage`: 85 files, 1439 tests
  passed. Includes stable image-renderer rerender, complete backup validation,
  key-material exclusion, authorization-failure queue, pending rescan/finalization,
  nested-alt/reference-style Markdown and image-integrity regressions.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts`:
  four files, 194 tests passed using synthetic SQLite D1.
- `node node_modules/eslint/bin/eslint.js .`: zero errors, 132 pre-existing
  warnings. App `tsc -b --noEmit` and cloud `tsc -p tsconfig.cloud.json` passed.
- `RECALL_PROJECT="$PWD" python3 -m unittest discover -s skills/lark-yellow-to-recall/scripts/tests`:
  52 tests passed, including compressed package generation and app parser checks.
- Guarded image suite `--config e2e/media.config.ts --workers=2`: six tests
  passed, including canceled replacement, deduplication, backup merge and an
  open viewer across 320/393/760/761 widths.
- Guarded local HTTPS D1 suite `--config e2e/media-cloud.config.ts --workers=1`:
  two tests passed. Real local Pages/D1 verifies independent two-device image
  upload/download, no repeated upload and rejection after device revocation.
- Guarded primary PWA suite `--workers=2`: 74 tests passed in Chromium/WebKit,
  including safe areas, landscape, long reading, import, scheduling, undo and
  offline reopening. These are simulations, not a physical iPhone acceptance.
- Browser commands used `RECALL_BUILD_VERSION=1.0-20261101-2228` and the cached
  Chromium-1223/WebKit-2272 executables, via `scripts/run-playwright.mjs` outside
  the macOS sandbox. Final evidence is in `/tmp/recall-image-e2e-integrity-final-20261101`,
  `/tmp/recall-image-cloud-integrity-final-20261101` and
  `/tmp/recall-image-pwa-integrity-final-20261101`. The source-image viewer screenshot
  was visually checked; all content is synthetic and remains outside Git.
- Full unit/cloud/lint/Skill command output is in the corresponding
  `/tmp/recall-images-final-reviewed-*.log` files, not public artifacts.
- Skill quick validation initially lacked PyYAML. Installed only the validator
  dependency in `/tmp/recall-image-skill-validation-pydeps`; rerunning with that
  temporary `PYTHONPATH` passed. No global package, lockfile or installed Skill
  was changed. Task documentation/link and staged diff checks passed.

Recorded failed attempts and recovery:

- `node scripts/run-playwright.mjs --config e2e/media.config.ts` initially
  resolved webServer paths from `e2e/`; added explicit repository cwd.
- Preview version `1.0-20261101-images-preview` was rejected before browser
  startup; used valid `1.0-20261101-2228`, without weakening version checks.
- Early browser tests used hash-only navigation and selected a card management
  button instead of the body. Corrected test reloads and exact card-body scope;
  multi-image expectations were narrowed instead of treating two images as one.
- WebKit `context.setOffline(true)` returned an internal navigation error even
  after cache readiness. Used the project's existing isolated-server-stop
  approach and proved an uncached network probe failed, then offline reopening
  worked. This is synthetic offline evidence, not a physical iPhone check.
- First local-D1 HTTP run passed Chromium but WebKit rejected Secure cookies.
  Restarted loopback Pages with HTTPS and isolated test-only certificate trust;
  both engines passed. No production cookie/security policy changed.
- Extended breakpoint test found the inline Markdown renderer remounted the
  viewer. Extracted stable `MarkdownImage` and added rerender regression test.
  Final mobile rerun passed after this actual product correction.
- Review found that canceling replacement could leave the next add in replace
  mode. Clear native file-input cancel state and verify both mobile engines.
- One final browser approval review timed out; the permitted single retry was
  approved and all suites passed. No sandbox marker was removed.
- Initial read-only Wrangler checks failed with npm-cache EPERM in the sandbox.
  Reran those same read-only checks with approval; account/project verified.
  No recursive ownership or permission changes were attempted.
- Independent focused review reproduced missing special-Markdown references,
  dropped active-queue rescans and header-only files accepted as images. Fixed
  conservative hash-token discovery, follow-up rescans with atomic finalization,
  bounded PNG CRC/payload, WebP chunk/payload and JPEG scan validation; browser
  import/download also decode before persistence. Added exact regressions.
- Corrupted PNG browser fixtures proved decoder tolerance differed: byte-modified
  PNG was accepted by both engines; truncated zero-filled PNG rejected only by
  WebKit. These failed test expectations were not called passes. Added PNG CRC
  checks and used a structurally shaped but undecodable WebP to test the actual
  decode gate on both engines. Server/Node structural validation is not claimed
  to be a complete codec decoder.
- Task Skill index now includes independent `.recall-media.json` derivatives
  without rewriting immutable Markdown/manifests. Preview preparation rejects
  nonempty output to prevent old assets being mistaken for the final build.

Local D1 setup (never add `--remote`):

```sh
npx --yes wrangler@4.156.0 d1 migrations apply DB --local --persist-to .wrangler/media-test-state
npx --yes wrangler@4.156.0 pages dev dist --port 8798 --ip 127.0.0.1 --local-protocol https --persist-to .wrangler/media-test-state --binding RECALL_SPACE_ID=synthetic-media-test --binding RECALL_BOOTSTRAP_CODE=synthetic-media-local-only-bootstrap-not-production
```

The `.dev.vars` contains only these synthetic values and is ignored. Real
local Pages/D1 two-device tests passed both engines at 393x852/DPR3; synthetic
storage and package/queue tests verify hashes, idempotency, quotas and failures.

## Preview And Integration

Final preview artifact target: `/tmp/recall-image-preview-validated-20261101`, containing
the validated build plus only a synthetic PNG/package/landing page and a
deny-all-API worker. HTTPS address and fixed commit are recorded after upload.
Entry is `/media-demo.html`: download synthetic package, open import, select
package, confirm two cards, open all cards, display answer and zoom image.
Cloud sync is disabled in hosted preview; real sync is demonstrated only by
isolated loopback D1 tests. Physical iPhone PWA acceptance remains unverified.

Final build command: `RECALL_BUILD_VERSION=1.0-20261101-2228 node node_modules/vite/bin/vite.js build --mode production` passed. Preparation and actual parser
verification returned two cards, one 32884-byte image and two duplicate skips.
The prepared 205-file artifact manifest SHA-256 is
`578f5bff479d05820ac679c5cdd1dc5219c3f4ca944878318c8932b364748a9b`;
local manifest: `/tmp/recall-image-preview-validated-sha256.txt`. Build warning
for existing large chunks remains, no build errors. Preview adds only synthetic
package/landing and the deny-all-API worker to the validated app build.

Integration owner must apply the additive migration to the already-authorized
production D1 after rechecking account/limits and compatibility, merge the
reviewed task commit, revalidate with other tasks, install the Skill deliberately
and deploy exact committed source. Existing clients ignore this separate image
table. Asset rollback cannot erase device attachments, cloud images or library
changes. Do not drop tables or reset data to roll back assets.

Read-only pre-preview hosting check verified existing account
`751b9fca4f5173fd70e0dfb69cff81e2` and project `recall-memory`. Production observed
at this check was `dd286cc8-ab18-4ec5-92e5-e31dd9b3c92d`, source `59f70c5`.
That newer production release is outside this image task and is not replaced.
The integration owner must recheck current main/production and revalidate the
combined source, rather than treating this older task baseline as current main.

## Fixed Task Handoff - 2026-11-02

- Implementation SHA: `de9b3e8be0b83f4cff1aa4ed5458593406ff5199`.
- Branch `codex/image-attachments-20261101` pushed normally to
  `xuda645-eng/Recall`, tracking the corresponding remote branch. Initial
  sandbox push could not read HTTPS credentials; approved same-command retry
  using system credentials succeeded. No credentials were printed or rewritten.
- Fixed-commit local HTTPS D1 rerun passed both engines after the final queue
  finalization fix: `/tmp/recall-image-cloud-committed-20261102`, two tests.
- Exact validated build comparison passed for all 202 app files and all 205
  preview manifest hashes before deployment. Worktree was clean at publication.
- Existing-project non-main preview command used `--branch image-attachments-20261101`
  and `--commit-hash de9b3e8be0b83f4cff1aa4ed5458593406ff5199`, without a dirty
  flag. It uploaded 30 changed assets, reused 172, compiled the dedicated
  deny-all-API worker and deployed successfully. Preview's intentionally absent
  DB binding generated a Wrangler warning; no production DB binding was added.
- Preview deployment ID: `88351020-e9f7-4823-bb31-a43fd46ade5a`.
- Fixed URL: `https://88351020.recall-memory.pages.dev/media-demo.html`.
- Task alias: `https://image-attachments-20261101.recall-memory.pages.dev/media-demo.html`.
- Deployment listing confirmed environment Preview, branch
  `image-attachments-20261101`, source `de9b3e8`. Production remained
  `dd286cc8-ab18-4ec5-92e5-e31dd9b3c92d`, source `59f70c5`, after this upload.
- Hosted preview is public and synthetic-only, with no production sync/AI.
  Anyone can open it; imported data stays on that preview browser origin.
  There is no promised expiry, but a deployment can be removed or the task
  alias superseded. Fixed URL is preferred for reproducible acceptance.
- Steps: download the synthetic package from the landing page; open Recall
  import; choose the package; confirm two cards; open all cards from the menu;
  open a question, show its answer and click the screenshot. Also check edit
  add/remove/replace and settings' complete image backup. Do not use the preview
  as a replacement for the real library or its sync service.
- Public guarded Chromium/WebKit acceptance command
  `RECALL_MEDIA_PREVIEW_URL=https://88351020.recall-memory.pages.dev/ ... node scripts/run-playwright.mjs --config e2e/media-preview.config.ts --workers=1 --output=/tmp/recall-image-public-preview-20261102`
  did not start: automatic approval review timed out twice, including the
  allowed retry. No browser launch bypass was attempted. Public interactive
  flows/SW activation and physical iPhone acceptance remain unverified, despite
  complete local simulation evidence. The committed public preview suite is
  available to the integrator for approved rerun.
- Read-only public curl retrieval confirmed the landing and correct version.
  Node-native aggregate HTTP checking stalled and was stopped; switched to
  bounded curl-backed verification instead. A large aggregate attempt stalled
  and was stopped; narrowed to 25 critical assets/API endpoints. Initial pass
  had six TLS/body timeout failures. Serial bounded retries confirmed SW,
  maskable/apple-touch icons and sync/WeRead API isolation. The retry helper's
  streamed stdout package hash was not counted as a pass; a fresh single curl
  download confirmed the exact 44652-byte package SHA-256
  `506480bfde80beb5d5258f3e9fa7e86bcd8244909507515f31aafad6299f6a2f`, matching
  the validated artifact. All 25 selected resources matched or returned the
  expected 401 deny-all response across attempts, not in one aggregate pass.
  Evidence: `/tmp/recall-image-public-http-20261102.json`,
  `/tmp/recall-image-public-http-retry-20261102.json` and
  `/tmp/recall-image-public-http-combined-20261102.json`. Root/index JS/CSS,
  workspace/Markdown chunks, manifest/icons, SW, landing, version and package
  are covered, not all 205 files or browser execution. Task alias landing also
  retrieved successfully. No network-only cause or product regression is
  inferred from these transient failures.
- The isolated local HTTPS server has been stopped after validation. Restart
  with the local-only setup commands above if cloud testing is needed. The
  installed global Skill remains unchanged; integrate/install deliberately.

The follow-up documentation commit contains only task evidence; it does not
replace this validated preview or redeploy any app. There is no unresolved
known product regression from the review; the material verification gap is
post-deployment browser execution, not local mobile or synthetic D1 tests.
Outcome recorded at `2026-11-02T00:21:35+08:00`; downloaded public synthetic
package also passed the actual in-memory parser/repeat-import verification.
Production status: not pushed to main, not deployed to production.
