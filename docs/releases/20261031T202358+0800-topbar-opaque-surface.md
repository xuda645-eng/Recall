# 20261031T202358+0800 - Opaque Mobile Topbar Surface

## Status And Publication Hold

- Scope: mobile browser/PWA shell, focused acceptance tests and documentation.
- Status: local topbar checks passed; waiting for the other requested Recall
  changes to finish and for a combined release to pass validation.
- Record started: `2026-10-31T20:23:58+08:00`.
- User instruction: wait for the concurrent tasks and publish together. Do not
  deploy this topbar fix separately or upload the currently changing worktree.
- Source repository/branch: `xuda645-eng/Recall`, `main`.
- Base source: `ca5f434`; implementation commit, push, combined source SHA,
  deployment and completion timestamps are pending, not successful outcomes.
- Production origin remains <https://recall-memory.pages.dev/>. No new
  deployment was made for the opaque topbar change.

## Changes And Reason

The user's installed iPhone screenshot showed that the previous 10px spacing
change did not remove the blur over the Logo's upper edge. The shifted row was
visible in that screenshot; this was not treated as evidence of a stale cache.

- `src/components/memory-appearance.css`: retain the 10px gap below the raw
  safe-area inset and the 48px controls, 8px slot gaps and 14px radii. On mobile,
  extend the fixed header to the viewport's top and both horizontal edges, with
  an opaque theme-aware paper background and no backdrop filter or gradient.
- Put the mobile page scroller below the header, including on the reading route.
  Adjust internal padding/margins so the initial content and reading geometry
  stay in the same positions. Fix the outer mobile app to the viewport so the
  document itself does not scroll. Preserve the moving foreground shell and
  stationary drawer, as well as the existing desktop layout.
- `e2e/memory-workspace.spec.ts`: cover raw top insets 0/59/80, top-edge header
  hit testing, light/dark opaque backgrounds, home/folders/settings/advanced/
  statistics/import routes, separated scrolling, reading bounds, drawer first
  frame and closing paths, reduced motion, focus and responsive layouts.
- `docs/PWA.md`: describe the new shell contract and record that the previously
  deployed spacing-only change did not pass physical-device acceptance.

This task changes no API, D1 schema, credentials, card contents or review
progress. Concurrent WeRead AI/frontend/server work is a separate task; it has
not been reviewed or declared ready by this record.

Design investigation used WebKit's
[fixed-container edge sampling implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalFrameView.cpp)
and [its color sampling change](https://github.com/WebKit/WebKit/pull/43516),
alongside [a similar project change](https://github.com/feuerwehr-oberwil/kp-rueck/pull/143).
These informed a fixed opaque edge surface rather than another spacing-only
patch. They do not establish the exact iOS version or prove suppression of the
system effect on the user's physical phone.

## Local Validation

Environment: Node `22.22.0`, installed project dependencies, production root-path
Vite build. Browser baseline: 393 x 852 CSS pixels, DPR 3. Playwright Chromium
and WebKit used the installed cached executables via `RECALL_CHROMIUM` and
`RECALL_WEBKIT`; this is browser simulation, not physical-device testing.

| Command | Outcome | Observed completion (Asia/Shanghai) |
|---|---|---|
| `node node_modules/vite/bin/vite.js build --mode production` | Passed; 145 precache entries; existing chunk-size warning | `2026-10-31T20:09:21+08:00` |
| `node node_modules/typescript/bin/tsc -b --noEmit` | Passed | Before lint completion below |
| `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json --noEmit` | Passed | Before lint completion below |
| `node node_modules/eslint/bin/eslint.js .` | 0 errors, 131 existing warnings | `2026-10-31T20:12:29+08:00` |
| `node node_modules/vitest/vitest.mjs run --coverage` | 67 files, 1131 tests passed | `2026-10-31T20:12:45+08:00` |
| `RECALL_CHROMIUM=... RECALL_WEBKIT=... node node_modules/@playwright/test/cli.js test --workers=2` | 42 passed, including local caching/offline persistence checks | `2026-10-31T20:17:56+08:00` |

The initial focused run had 10 passes and 2 failures in the newly added test:
the app reads the URL hash on initialization, not on arbitrary hash changes.
The test was changed to use the real navigation controls. The first full rerun
then had 40 passes and 2 failures because edge hit testing ran during the
drawer's closing transition. Waiting for that animation to finish fixed the
test synchronization; the final 42-test run passed without weakening the edge
or offline assertions.

These results apply to the topbar build produced before the concurrent WeRead
implementation was complete. They do not validate a future combined bundle.
The temporary preview server used by this task was stopped after validation
so another task does not accidentally test this older bundle via server reuse.

## Public Preflight And Remaining Gates

- Before this publication hold, the authenticated Cloudflare account, existing
  `recall-memory` project and current production deployment were read-only
  checked. Production still pointed at the earlier spacing-only deployment.
- The earlier broad public regression could not complete initial loading or
  Service Worker takeover. A narrower recovery attempt was run against the
  current production origin:
  `RECALL_URL=https://recall-memory.pages.dev/ RECALL_CHROMIUM=... RECALL_WEBKIT=... node node_modules/@playwright/test/cli.js test --grep 'PWA部署路径' --workers=2 --output=/tmp/recall-top-surface-preflight`.
- That attempt completed at `2026-10-31T20:16:28+08:00`: Chromium failed after
  120 seconds at `page.goto`, waiting for the `load` event. The WebKit case
  passed against the test's isolated local static server, not against the public
  origin. Do not count it as a public Service Worker/offline pass. The timeout's
  root cause was not established, and no caching assertion was removed.
- A combined release must rebuild the finished, reviewed source, rerun the
  applicable frontend/cloud/mobile checks, resolve critical public loading and
  caching validation, and record exact commit/push/deployment evidence.
- Physical iPhone 15 installed-PWA blur, safe-area changes, keyboard, cold
  offline reopening and update behavior remain unverified. Browser geometry
  checks do not prove the original physical blur is fixed.

## Previous Production And Recovery

- Previous deployment observed: `8adde351-c4c8-4c8d-aa5b-cdd100a3affe`,
  <https://8adde351.recall-memory.pages.dev/>. Cloudflare reported source
  `d76f615`, but the spacing-only assets were deployed from a dirty worktree
  before the new commit-before-release discipline. That SHA does not identify
  the exact deployed topbar source.
- The prior deployment `8e3a2d28-e70e-49af-bea1-c609038fed7e` is also retained.
  Neither is a physically verified known-good fix for this blur issue.
- No rollback is needed while this change is unpublished. Before any later
  rollback, recheck production to avoid replacing another task's newer release.
  Use a compatible, verified Pages deployment rollback only; do not reset D1,
  remove device storage or rewrite Git history. A combined release containing
  separate schema changes must assess their compatibility independently.

## Combined Release Follow-Up

Pending: finished-task review, combined validation evidence, implementation
commit SHA/time, normal push result, previous production at publication time,
deployment ID/URL, non-destructive public verification, any incident/recovery
and final completion time. This record is a hold/handoff, not a published fix.

## Source Publication Follow-Up

The user explicitly resumed publication of all pending work. The topbar changes
were reviewed with the finished WeRead source and passed 42 combined mobile
tests, lint/type/unit/build checks and local D1/online-import suites. Source was
committed as `2ae24fffa5508b36bbd976bd580043d1374ae80a` at
2026-10-31T21:09:45+08:00 and normally pushed to `origin/main`, verified at
2026-10-31T21:13:59+08:00. Private data was excluded.

The combined public load/SW gate still failed after network/browser recoveries.
No new Pages deployment or D1 migration was performed; production remains
`8adde351-c4c8-4c8d-aa5b-cdd100a3affe`. The topbar is published as source but is
not yet a production or physically verified fix. Exact combined commands,
failures and remaining release steps are in
[the publication audit](./20261031T210732+0800-publish-pending.md).
