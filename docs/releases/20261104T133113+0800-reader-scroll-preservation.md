# Preserve Answer Reading Position

## Identity And Scope

- Release ID: `20261104T133113+0800-reader-scroll-preservation`.
- Status: implementation and all local gates passed; publication/public verification pending.
- Requested scope: fix the two confirmed answer/excerpt scroll-reset paths documented in [the diagnosis](./20261104T125914+0800-reader-scroll-diagnosis.md).
- Baseline: `c2b62942`, clean `main`, `xuda645-eng/Recall`. Production app at discovery: `40a39dae-4e2c-4d8d-8646-702ea2f4363e`, source `e65081541b4dc297418b0b93453eb9df831d1a19`, version `1.0-20261104-1057`.
- First captured validation: 2026-11-04 13:31:13 +08:00. Broad checks started 2026-11-04 13:34:11 +08:00. Publication and completion timestamps are appended after actual outcomes.
- Planned app version: `1.0-20261104-1334`, builtAt `2026-11-04T05:34:00.000Z`, Asia/Shanghai.

## Implementation

- `src/components/memory-reader.tsx`: make reveal idempotent for already revealed answers and excerpts. The first question-to-answer reveal still opens the answer at its top. Pointer thresholds, vertical-scroll axis handling and rating choices are unchanged.
- Record panel scroll events in the existing per-card reading-position ref without React state updates or persistence writes. Ignore events from disconnected panels so a removed question panel cannot overwrite its answer's saved offset.
- Restore saved scroll only for newly mounted panel elements, tracked in a WeakSet. Existing panels receive no scripted `scrollTop` writes during an identical card-array refresh, callback/queue-reference changes or an error revision. This avoids stopping momentum even when an offset happens to be unchanged.
- Reset the rail only for actual panel/index/queue/restoration changes, not equivalent data refreshes. Explicit preference replanning still cancels and resets an interrupted transition. Wait for the reconciled index's render before restoring newly mounted panels.
- `src/components/__tests__/memory-reader.test.tsx`: eight focused tests cover first reveal, repeated reveal, excerpts, identical snapshots before scroll delivery, an in-flight transition, equivalent queue/callback/font props, removed-panel restoration, independent positions across distant navigation, and failed-rating revisions.
- `e2e/memory-workspace.spec.ts`: three browser regressions cover native taps and short touches after long-answer scrolling, excerpts/options/font/distant navigation, and actual synchronization initiated by reconnect and a clock-advanced 60-second poll with unchanged synthetic card content.
- `docs/PWA.md`: document the reading-position contract. No other application component, store, cloud API, scheduling algorithm, schema, credential, origin or infrastructure change.

## Safety And Bootstrap

- Windows Obsidian Home/Project Map and Graphify are unavailable on this Mac, as established in the diagnosis. Continue from the session handoff, architecture map and targeted owning-source routes. Graphify update is unavailable; no vault sync is claimed. No nested source/test/docs instructions were found.
- Keep all owner cards, device credentials, private import files and unrelated work outside staging. The working tree was clean at the task start.
- Tests use isolated browser contexts and synthetic cards only. The sync regression intercepts every `/api/**` request, supplies a synthetic device session and rejects unexpected sync writes. No authenticated mutation requests go to the production library.
- Only the dedicated routed-sync test simulates an unavailable Service Worker, ensuring deterministic API interception in WebKit. All ordinary PWA cache, offline, refresh and update tests retain Service Workers and runtime-error assertions. The simulated-sync scenario is not offline or real-cloud acceptance.
- Primary mobile simulation: 393 x 852 CSS pixels, DPR 3, Chromium and WebKit. Chromium vertical gestures use CDP touch events; WebKit uses synthetic pointer events and panel scroll assignments. Browser-native taps run in both engines. Physical Safari-installed iPhone scrolling, native inertia, background lifecycle and real-device offline/update acceptance remain unverified.

## Validation And Recovery

Use existing dependencies directly, as allowed by `SELFHOST.md`, avoiding pnpm's previously diagnosed automatic dependency-purge prompt. Exact browser environment for acceptance commands:

```bash
RECALL_BUILD_VERSION=1.0-20261104-1334
RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'
```

- Red test run: `node node_modules/vitest/vitest.mjs run src/components/__tests__/memory-reader.test.tsx`, one passed / seven failed. Five failures demonstrate application defects (scroll writes/resets, transition interruption and lost restoration); two initial keyboard tests dispatched to `window` rather than an element and were corrected to dispatch to `document.body`. Do not describe harness-target errors as application regressions.
- Fixed focused run: the same command, 8/8 passed. `node node_modules/typescript/bin/tsc -b --noEmit` and scoped ESLint passed.
- Broad run: `node node_modules/vitest/vitest.mjs run`, 96 files / 1587 tests passed, 17.55s. `node node_modules/eslint/bin/eslint.js .`, zero errors / 132 existing warnings. `node node_modules/typescript/bin/tsc -b --noEmit`, passed.
- Production build: `RECALL_BUILD_VERSION=1.0-20261104-1334 node node_modules/vite/bin/vite.js build --mode production`, passed. PWA precaches 162 entries; existing large-chunk warning remains. No application source changes followed these checks.
- Browser tests use `node scripts/run-playwright.mjs --config /private/tmp/recall-reader-fix/playwright.config.ts`, the existing launch guard/global preflight and approved execution outside Seatbelt. The temporary config extends `e2e/product-review.config.ts` but previews the already built directory on port 4198 without rebuilding served `dist/`.
- Focused command adds `--grep '答案滚动后|摘录轻触|每分钟刷新|长正反面|固定四档预览|进行中修改配比|表单焦点' --workers=2`. First result: 11 passed / 3 failed. The excerpt fixture used identical creation timestamps, so the production tie-breaker correctly placed `fourth` before `second`; give synthetic cards sequential creation times rather than change production ordering. WebKit's Service Worker bypassed routed API responses; move only this synthetic scenario to an explicitly isolated, no-SW test.
- Second focused result: 12 passed / 2 failed, both due to Workbox registration errors caused by the artificial blocked-SW context. Simulate the API as unavailable before app initialization, assert it is unavailable, and retain all runtime-error assertions. No production Service Worker or application registration code was changed or error assertions weakened.
- Final focused command with `--output=/private/tmp/recall-reader-fix/focused-acceptance-results`: 14/14 passed in 36.3s, zero skips/retries. Both engines pass reconnect and the real 60-second synchronization interval, retaining 500px then 700px positions without changed cards/review logs.
- Final whole-repository ESLint rerun after test-harness corrections: zero errors / 132 existing warnings. `git diff --check` and documentation links/new-record dash checks passed. Source hashes matched the frozen build's recorded implementation/test files.
- Full local command: same browser environment and temporary config, `--workers=2 --output=/private/tmp/recall-reader-fix/full-results`; log `/private/tmp/recall-reader-fix/full-e2e.log`. Result: 140/140 passed in 4.1 minutes, zero skips/retries. Includes core PWA/mobile, study, media, import choices, deck picker and product-review suites; narrow/760px/landscape/desktop, safe areas, forms, long reading, rating/undo, archive, Markdown update, real Service Worker update activation and offline persistence all passed.
- Visually inspected the final-source Chromium 393 x 852 long-answer screenshot: retained shell, readable answer body, internal card scrolling and footer below the reading panel. This is synthetic browser evidence, not a physical phone screenshot.
- Frozen root-path build: `/private/tmp/recall-reader-fix/release/dist`, copied from the tested `dist/`. Implementation/test source hashes are stored alongside it, outside the deployment directory, and will be rechecked before publication. Do not deploy unrelated dirty work or rebuild the served/frozen bundle.
- Cloud/D1 owning code is unchanged; no D1 mutation suite or migration is required. Public checks are anonymous or entirely routed to synthetic responses.

## Publication And Recovery

- Read-only account/project/deployment checks used `npx --yes wrangler@4.156.0 whoami`, `pages project list` and `pages deployment list --project-name recall-memory --environment production`. Verified existing OAuth account `751b9fca4f5173fd70e0dfb69cff81e2`, project `recall-memory`, branch `main` and deployment `40a39dae`. No new resources or paid bindings.
- 2026-11-04 13:43:18 +08:00: public `/version.json` still reports `1.0-20261104-1057`. Remote main matches the task baseline `c2b62942d1ac38df8f1f89a30e93ebf5a6f78540`. No concurrent source or production change was detected before task publication.
- Source SHA, push result, deployment ID/URL, post-deploy public version/assets/reader/update checks and completion time: pending actual publication; append to this record in a documentation-only follow-up.
- Compatible asset rollback target: `40a39dae-4e2c-4d8d-8646-702ea2f4363e`, URL `https://40a39dae.recall-memory.pages.dev`, source `e65081541b4dc297418b0b93453eb9df831d1a19`, version `1.0-20261104-1057`. It is compatible with the unchanged storage/schema and restores prior behavior, including the diagnosed scroll defects; it is not known-good for the fixed reader behavior.
- If this release introduces a different regression, first verify that it is still the current production deployment. Wrangler 4.156.0 has no Pages rollback command; use the existing-account Pages REST endpoint `POST /accounts/751b9fca4f5173fd70e0dfb69cff81e2/pages/projects/recall-memory/deployments/40a39dae-4e2c-4d8d-8646-702ea2f4363e/rollback`, with OAuth handled privately. Restore only compatible Pages assets and recheck public version, hashes and affected flows; append the incident here.
- Keep D1, IndexedDB, card bodies, review history, device authorization and Service Worker/device caches. Do not clear website data, restore a database, force push or select the previously rolled-back deck-picker deployment as a known-good target. A source correction uses a new scoped commit and normal validation/publication.
