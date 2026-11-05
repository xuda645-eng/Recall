# Floating Home Review Action And Smaller Drawer Metadata

Record checkpoint: 2026-11-05T23:11:01+08:00 (Asia/Shanghai).
Status: local validation passed; source publication and deployment pending.

## Requested Changes

- Replaced the solid, full-width home dock with one floating start-review
  button. Removed the last-selection caption and home review-plan link; plan
  configuration remains available under settings. Start still opens the
  existing deck picker and does not directly rate or change cards.
- The dock has no fill, border or pointer interception. Only the button has
  pointer events and a restrained shadow. It stays above the home indicator,
  centered in the available content column with a 420px maximum width. Main
  content retains measured clearance so its final card can scroll above it.
- Changed the height observer to border-box observation. Safe-area padding
  changes now update content clearance even when button content height stays
  unchanged. This corrects a real issue found by the inset stress test.
- Drawer status stays 14px; the two metadata lines, last-sync time and build
  identity, are 12px. They share a single size token that tracks enlarged text.
  Text axes, row gaps, refresh-icon centering and its transparent 44px target
  are unchanged. No cloud API, credentials, data/schema or sync-order changes.

## Validation And Recovery

- Focused component units: 42/42 passed. Final height-observer unit: 2/2
  passed, including resize cleanup and disabled action checks.
- Initial full unit command collected an ignored temporary Playwright asset
  test left by the previous release. The 105 app files / 1684 units passed,
  but the foreign suite failed with Playwright's test-registration error and
  a localhost:3000 ECONNREFUSED diagnostic. Not a successful full command.
  Recovery excluded only ignored `quality/**` artifacts: all 105 files /
  1684 units passed in 19.29 seconds. App tests were not removed or weakened.
- Type check and scoped lint passed. Full ESLint: 0 errors / 132 existing
  warnings. Production build passed with the existing chunk-size warning,
  165 precache entries / 3353.97 KiB. Final root-path artifact is frozen at
  `/private/tmp/recall-home-floating-final-dist`, V1.1-20261105-2307, served on
  loopback port 4432. The initial failed-boundary build on port 4431 is not
  released. Neither artifact was rebuilt while it was served.
- First mobile focus: 2/4 passed; both new dock cases exposed missing height
  updates after changing safe-area padding. Fixed border-box observation.
- Second focus: 2/4 passed; mobile geometry succeeded, but the test incorrectly
  tried to scroll the mobile content container at the desktop breakpoint.
  Corrected it to use document scrolling on desktop, leaving app code unchanged.
- Third focus: 3/4 passed; WebKit completed layout checks but rejected native
  wheel input in a mobile context. Chromium keeps its native wheel check;
  WebKit uses a real touchscreen tap through the transparent margin plus
  programmatic scroll and unchanged-data assertions. This does not claim a
  native WebKit swipe was exercised. Shared touch/long-reading tests remain.
- Final complete mobile suite includes both engines at 393 x 852 CSS / DPR 3,
  320/525/760/761/1280 widths, landscape, 59/34px inset stress, dark/reduced
  motion, enlarged drawer metadata, end-of-content clearance, transparent hit
  testing, picker/cancel, folders/imports/reading/ratings/undo/settings/sheets,
  persistence/offline/update and the same-origin iPhone preview.
  Final complete run: 166/166 passed in 4.4 minutes, no skipped cases. Both new
  dock cases and both drawer typography cases passed in this complete run.
- All local acceptance uses synthetic contexts, not owner data. Physical
  iPhone Safari home-screen acceptance is not claimed. Windows vault/Graphify
  are unavailable here, disclosed; the supplied architecture map and known
  owning files were used instead.

Commands from the clean delivery worktree:

```sh
node node_modules/vitest/vitest.mjs run src/components/__tests__/memory-paper-home.test.tsx src/components/__tests__/pwa-app-version.test.tsx src/components/__tests__/memory-cloud.test.tsx
node node_modules/vitest/vitest.mjs run
node node_modules/vitest/vitest.mjs run --exclude 'quality/**'
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vite/bin/vite.js build --outDir /private/tmp/recall-home-floating-final-dist
node node_modules/vite/bin/vite.js preview --outDir /private/tmp/recall-home-floating-final-dist --host 127.0.0.1 --port 4432 --strictPort
node scripts/run-playwright.mjs --config=quality/home-floating/local.config.ts --grep '首页只悬浮|抽屉采用确认' --workers=2 --output=quality/home-floating/focused-recovery
node scripts/run-playwright.mjs --config=quality/home-floating/local.config.ts --workers=2 --output=quality/home-floating/full-mobile
```

Mobile commands set RECALL_E2E_BUILD_DIR to the frozen build and the installed
Chromium/WebKit paths via RECALL_CHROMIUM / RECALL_WEBKIT. RECALL_URL is omitted
so local acceptance guards do not skip tests. The ignored config has the fixed
4432 baseURL, no rebuild server, browser-launch guard and global preflight.
Browsers run outside macOS Seatbelt. Logs and synthetic screenshots remain
local under `/private/tmp/recall-home-floating-*.log` and ignored
`quality/home-floating/`; no private card content is published.

## Source, Hosting And Rollback

Source base: `ad0f3f11ed59f831620d48e6f686fd758ca30423`. The original dirty
trial worktree and unrelated style-lab remain untouched and excluded. Only the
two requested UI adjustments, their root fix/tests and documentation are staged.
Source SHA, normal push, deployment and public outcomes follow validation.

Read-only Wrangler preflight verified existing authorized account
`751b9fca4f5173fd70e0dfb69cff81e2`, project recall-memory, main production and
previous deployment `bd069dc9-4aa9-4058-81b4-871d42e6509e`, source
`fe91e8daaa23d54c15a12dd3765bab90c5a95ee1`, V1.1-20261105-2224. The origin
stays https://recall-memory.pages.dev/. No new resources, plans, bindings,
DNS changes, migrations or production test seeds.

Compatible rollback target: that previous bd069dc9 deployment. Schemas/APIs,
device credentials and review scheduling are unchanged. If a new regression is
confirmed while this release is still active, restore that existing Pages
deployment and verify public recovery. Do not clear device storage, undo owner
reviews/imports, restore D1 snapshots, rewrite history or force-push. Asset
rollback alone does not undo later user data changes.

Related: [previous release](./20261105T223050+0800-drawer-approved-implementation.md),
[PWA acceptance](../PWA.md), [deployment](../DEPLOYMENT.md).
