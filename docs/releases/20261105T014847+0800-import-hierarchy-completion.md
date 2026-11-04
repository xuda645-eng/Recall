# Import hierarchy, completion and drawer refinements

## Identity and scope

- Release: `20261105T014847+0800-import-hierarchy-completion`.
- Record opened: 2026-11-05 01:48:47 +08:00. Status: deployed and verified; browser acceptance completed 2026-11-05 02:08:13 +08:00. Physical iPhone acceptance remains pending.
- Repository: `xuda645-eng/Recall`, branch `main`; starting HEAD `60e92c66b01d3ba88c71e58947d7dec4cea8d76d`.
- Frozen production version: `1.0-20261105-0142`, root-path build.
- Deployed implementation SHA: `8150e1e52cd35e0235b125c6be7f27dfb06c73e5`; evidence follow-up is a later documentation-only commit referencing this record.
- Only the eleven requested browser comments are in scope. Unrelated `prototypes/style-lab/` is left untouched and excluded from commit/build delivery. Parallel-delivery mode was not invoked.

## Changes

1. Markdown/media import destination uses a shared hierarchical selector. Each parent has independent expand/collapse and selection controls, preserving the file's own nested structure.
2. WeRead connection landing removes the extra import-method entry. Credential-free Skill JSON remains available through the global import file input, with the original manual preview/editor and validation.
3. Merge progress uses finalized original-highlight cursor / source count with a percentage and accessible progressbar. Resulting card count is separate and is never used as highlight progress.
4. Markdown, media, manual/online/merged WeRead and compatible card imports share a distinct completion screen: real saved/skipped counts, destinations, explicit view and continue actions. Drafts no longer remain on screen after completion. Backup restoration is a separate existing workflow. Anki retains its detailed warnings/report before the shared completion action; partial failures do not become unconditional success.
5. Folder-management sheets no longer contain per-folder backup controls. Whole-library backup and recovery remain in settings.
6. Statistics use the same collapsible selector. Siblings at every level sort by valid imported time, then creation time and a deterministic ID tie-break. Parent scope still covers its subtree.
7. New WeRead imports default into book subfolders under root `微信读书`. Existing proven imports get a one-time on-device correction, with a credential-free local backup before persistence. Pure book trees keep IDs/hierarchy; mixed folders retain unrelated cards. Source text, FSRS state, history and archive state are preserved. No owner production mutation tests or D1 migration are performed.
8. All shared sheet close controls use a thin transparent X without a ring or round hover/focus background. The 44px touch target and keyboard focus indicator remain.
9. Cloud status and manual synchronization move into the drawer footer, using existing actions and phase/conflict/error handling.
10. Homepage and settings-page duplicate status panels are removed; drawer shows the last successful sync timestamp. The detailed cloud management sheet and settings management entry remain.
11. Drawer add-card entry is removed; other explicit card-creation controls remain.

The correction marker is `recall.weread.folders-organized.v1`; backup is `recall.snapshot.pre-weread-folders.v1`. Quota, ID collision or invalid-tree errors block the correction and report failure. User changes after completion are not continuously forced back. Importer-owned renamed roots are preserved. No model credentials, private cards or local backups are published.

## Validation

Host: macOS, installed Node/dependencies. Windows Obsidian vault and Graphify are unavailable; the session used the documented handoff/architecture and targeted source fallback. No graph update could run.

- `node node_modules/vitest/vitest.mjs run`: 101 files / 1649 tests passed at 2026-11-05 01:36:37 +08:00 after the final product-source changes.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 132 existing warnings; final reviewed rerun after test edits also passed.
- `node node_modules/typescript/bin/tsc -b --noEmit`: passed.
- `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json`: passed.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts`: 5 files / 382 synthetic tests passed at 2026-11-05 01:23:59 +08:00; no cloud protocol/schema source changed afterward.
- `RECALL_BUILD_VERSION=1.0-20261105-0142 node node_modules/vite/bin/vite.js build --mode production --outDir /private/tmp/recall-import-refinements-20261105/dist-final --emptyOutDir`: passed; 165 precache entries. Existing chunk-size warning remains.
- Mobile: `RECALL_E2E_BUILD_DIR=/private/tmp/recall-import-refinements-20261105/dist-final RECALL_CHROMIUM=<installed Chromium> RECALL_WEBKIT=<installed WebKit> node scripts/run-playwright.mjs --config /private/tmp/recall-import-refinements-20261105/mobile.config.ts --workers=2`: **126/126 passed**, Chromium and WebKit at 393 x 852 CSS pixels / DPR 3. Covers home, hierarchy, reading/rating/undo, import/updates/media, statistics, editing, safe-area stress, narrow widths, breakpoints, text enlargement, focus and local offline/update checks. Final completion screenshot was visually inspected.
- WeRead: `RECALL_WEREAD_PORT=4232 RECALL_CHROMIUM=<installed Chromium> RECALL_WEBKIT=<installed WebKit> node scripts/run-playwright.mjs --config /private/tmp/recall-import-refinements-20261105/weread.config.ts --workers=2`: **93 passed / 1 browser page-setup timeout** before test execution. The unchanged missed test was recovered with the same command plus `--grep '已完成0天' --workers=1`: **2/2 passed**. All 94 distinct required cases passed across these runs; this is not a clean single-run 94/94 claim. APIs/model replies were local synthetic fixtures, not real owner imports.
- Logs and frozen build: `/private/tmp/recall-import-refinements-20261105/`, not published as private browser state.

### Failures and recoveries

- Initial focused mobile run: 10 passed / 2 wrong accessible-label failures. Updated the test label to the actual management button, then full final suite passed.
- Initial full mobile run: 119 passed / 7 failures from removed WeRead entry, obsolete round-X assertions, and WebKit's isolated offline fixture inadvertently using old repository `dist`. Tests now use the unified file entry, transparent-X contract and explicit frozen-build environment variable; final 126/126 passed without rebuilding served assets.
- Initial WeRead run: 89 passed / 5 failures. Updated the restored test snapshot to the new book-parent contract, explicitly confirmed the review picker, centered controls before measuring touch hits and polled the short pause window at 100ms. These cases passed in the final run. No product behavior was weakened to make these assertions pass.
- The first temporary WeRead config imported an `import.meta` config through Playwright's CommonJS loader and failed before launching browsers. Replaced that temporary import with a compatible baseline.
- Temporary configs preserve `assertBrowserLaunchAllowed` and invoke a native child preflight for both engines. The known stock ESM preflight-loader error is bypassed only in temporary validation configs; no OS/security guard is removed. Browser commands ran with approved unsandboxed execution.

## Deployment and recovery

- Stable origin: `https://recall-memory.pages.dev/`; existing project `recall-memory`, production branch `main`.
- Read-only account/project/deployment checks confirmed account `751b9fca4f5173fd70e0dfb69cff81e2` and the existing project.
- Previous production: `a5dc808c-7b1c-4777-8474-3154484d21f9`, source `888360c9d5279cfbff1c93c99d8313e6d386a499`, version `1.0-20261104-2318`, URL `https://a5dc808c.recall-memory.pages.dev/`.
- Commit only reviewed task files, push normally on main, then deploy the frozen bundle from a clean source copy with full source SHA and `--commit-dirty=false`. Do not include unrelated work, change the origin, add paid resources, reset D1 or publish private snapshots.
- Public verification must distinguish static identity, anonymous simulated UI, actual Service Worker behavior and physical acceptance. No real Safari-installed iPhone acceptance is claimed.
- **Rollback limitation:** previous assets remain able to read the unchanged data schema, but their WeRead importer can reject book folders with non-null parents after the correction. Therefore the previous deployment is not fully behavior-compatible for WeRead importing. Prefer a reviewed, validated roll-forward or a separately verified compatible asset fallback. Before any Pages rollback, recheck the live deployment and data compatibility; record the incident. An asset rollback does not undo folder correction, restore D1, remove journals or clear phone storage. Data restoration requires separate explicit approval and must not be automated as a rollback step.

## Publication outcome

- Source commit `8150e1e52cd35e0235b125c6be7f27dfb06c73e5` created at 2026-11-05 01:52:58 +08:00. `git push origin main` succeeded normally: `60e92c66..8150e1e5`.
- A temporary clean clone checked out that exact source in detached state; no task branch was created. Its `git status --porcelain` was empty. The owner worktree's unrelated `prototypes/style-lab/` remains untracked and untouched. The validated external frozen bundle was not rebuilt during serving or copied from another task.
- Deployment command from the clean source clone: `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy /private/tmp/recall-import-refinements-20261105/dist-final --project-name recall-memory --branch main --commit-hash 8150e1e52cd35e0235b125c6be7f27dfb06c73e5 --commit-dirty=false --commit-message 'feat: refine import hierarchy completion and drawer sync'`.
- Deployment log finished at 2026-11-05 01:54:43 +08:00. Functions compiled, 49 changed files uploaded, 156 reused. Deployment ID: `9c7d0136-1042-40da-843f-2e6ac9497896`; deployment URL: `https://9c7d0136.recall-memory.pages.dev/`. Read-only deployment listing confirmed Production / main / source `8150e1e`. Stable origin remains `https://recall-memory.pages.dev/`.
- `node /private/tmp/recall-import-refinements-20261105/verify-public.mjs`: 205/205 public static files SHA-256 matched the frozen production bundle, zero retries/failures. Includes public root, manifest, all icons, Service Worker and hashed JS/CSS/font assets. Version `1.0-20261105-0142`; anonymous `/api/auth/me` returned 401. Results completed at 2026-11-05 01:55:57 +08:00.
- Public UI: `RECALL_CHROMIUM=<installed Chromium> RECALL_WEBKIT=<installed WebKit> node scripts/run-playwright.mjs --config /private/tmp/recall-import-refinements-20261105/public.config.ts`: final **6/6 passed** in 40.8s. Direct production origin, anonymous browser contexts at 393 x 852 / DPR 3; only synthetic local cards, production API mutations intercepted. Verified hierarchical import, completion and saved location, collapsible stats, removed WeRead entry, drawer sync/time, transparent-X controls, no folder backup and retained full backup. This does not verify owner cards or live authenticated sync/model calls.
- Initial public UI run: 2 passed / 4 failures. Two tests navigated to a different hash without reloading or using the app navigation, leaving the prior route mounted; one WebKit startup waited only 20s and was still loading. Temporary tests now use real drawer/import controls and allow up to 60s for UI readiness. Both engines passed all six cases without changing product source or mocking public HTML/assets.
- Initial public SW probe reached visible app with 116 cached entries and no failed requests after its 120s installation window; it had not yet activated. One bounded five-minute recovery probe is recorded below. No rollback/data restore has been performed. Local final offline/update checks passed; real Safari home-screen install, owner-library acceptance and physical-device behavior remain unverified.
- Recovery command: `RECALL_CHROMIUM=<installed Chromium> node /private/tmp/recall-import-refinements-20261105/public-sw-probe.mjs`, approved outside Seatbelt. Its actual browser evidence first reached active controller and active registration at **2026-11-05 02:01:57.617 +08:00**, with all required shell/manifest/icon/preview URLs cached, app visible and 161 cache entries. Chromium then successfully reopened the public app with browser networking disabled; the record finished at 2026-11-05 02:06:15 +08:00. This is browser simulation, not a physical phone or a live authenticated library test. The offline `/api/auth/session` request's `ERR_INTERNET_DISCONNECTED` was expected while offline.
- The recovery probe nevertheless exited 1 because its temporary threshold wrongly required 165 cached files. Inspection of the **public-hash-verified frozen SW** found 165 generated entries but **161 unique URLs**: favicon and three icons each appear twice. The guard script now derives the unique expected count rather than assuming the generated-entry count. `node /private/tmp/recall-import-refinements-20261105/verify-sw-evidence.mjs` replayed assertions against the saved real-browser record and that frozen SW at 2026-11-05 02:08:13 +08:00: activated controller/registration, 161/161 unique cached entries, required URLs present, visible app and successful offline reopen all passed. The original failed exit is retained in evidence; no additional browser run or product-source change is claimed.
- This documentation-only follow-up records the source/deployment/verification outcomes and does not rebuild or redeploy the application. Its normal push outcome is reported with delivery. No paid resource, new origin, D1 mutation test, rollback or owner data restoration was performed.
