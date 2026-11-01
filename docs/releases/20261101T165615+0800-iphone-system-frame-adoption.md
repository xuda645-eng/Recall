# Adopt The Physically Clear F Mechanism For iPhone Standalone

- ID: `20261101T165615+0800-iphone-system-frame-adoption`.
- Start: 2026-11-01T16:56:15+08:00.
- Source base: `1c8d3935e976486d3098aac9c596fc6b2948ce8e`, verified main.
- Fixed build version: `1.0-20261101-1656`.
- Previous production: `8856d0ab-334a-48f2-b71e-06209c438300`, source
  `165219c`, verified via existing account/project read-only checks. Preserve
  the previously published WeRead daily budget and uncapped action changes.
- Scope: iPhone standalone viewport boot script, root HTML ordering, tests,
  physical F acceptance evidence and docs. No CSS, card, auth, API, schema,
  manifest/install identity, domain or infrastructure change.
- Status: implementation and local validation completed; publication pending.

## Evidence And Change

The owner confirms F's effect is good in the original installed PWA at 16:52.
Their screenshot shows sharp Logo/title/+ upper edges and no visible overlap
with the status region. Unlike earlier speculative strips/sticky structures,
this is a successful physical same-install candidate. It does not establish
all real-app flows or the underlying native bug's root cause.

Adopt F's browser-managed insetting for iPhone standalone only. The root HTML
still declares `viewport-fit=cover`, with a small same-origin parser-blocking
script immediately after the viewport meta and before application scripts/
styles. For an iPhone user agent and either Safari standalone flag or standalone
display-mode, it replaces only viewport-fit cover with auto. All other cases
retain cover, as does the non-JavaScript fallback. Selection does not depend
on OS-version guesses, query inputs, screen-height arithmetic or stored prefs.

No manual inset reset, negative offset, forced screen height or shadow removal.
All four CSS env safe areas, dynamic height, 48px controls, 8px gaps, 14px
radii and existing foreground/drawer behavior remain. Landscape stays in the
same mode within the iPhone installed window rather than toggling on width.
Actual browser inset changes determine the space, not a hardcoded 59px hack.

The script reads only device/display-mode and the viewport meta, not cards,
storage, cookies or credentials, and sends no requests. Its static load is
same-origin, base-aware and covered by the existing SW precache glob. The
existing local display report already includes the actual viewport meta.
Diagnostic A/B/C/F documents are unchanged, so comparative evidence remains
available. New unit tests exercise the real reported UA shape and wrong-device/
browser/no-meta cases. Local mobile tests simulate old cover to new auto SW
updates, initial app rendering, inset stress, drawer, landscape/short viewport
and offline reopening with identical synthetic snapshots. No real data writes.

Windows vault and Graphify remain unavailable; used the supplied map and
targeted owning HTML/script/tests. Unrelated worktrees preserved. Latest main
was fast-forwarded while clean before editing; no optional parallel Skill
activation or branch creation.

## Validation

Local validation completed and final bundle rechecked at
2026-11-01T17:11:02+08:00. Remote main still matched the inspected base.

Fixed version `1.0-20261101-1656` throughout. Existing shared dependencies used
without reinstalling them. Commands from the isolated task worktree:

```sh
node --check public/pwa-viewport.js
node node_modules/vitest/vitest.mjs run src/lib/pwa-viewport.test.ts src/lib/status-diagnostics.test.ts src/components/__tests__/memory-display-diagnostics.test.tsx
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/vitest/vitest.mjs run --coverage
RECALL_BUILD_VERSION=1.0-20261101-1656 node node_modules/vite/bin/vite.js build --mode pages --outDir /tmp/recall-f-adoption-pages-dist
```

- Focused units: 21 passed / 3 files. Script syntax passed.
- Full lint: 0 errors / 132 pre-existing warnings. Typecheck passed, repeated
  after final test edits. Changed-file lint and diff whitespace passed.
- Full coverage: 1423 tests / 82 files passed. Thresholds passed: statements
  41.79%, branches 39.56%, functions 36.53%, lines 45.31%.
- Final full mobile regression: 74 passed / no skips (1.9min), both Chromium
  and WebKit. Covers the corrected app/diagnostic return and true old-cache
  update, initial auto viewport, device gating, inset stress, drawer, shortened
  viewport/landscape, offline reopening, review/import/archives and persistence.
- Root production build passed through the guarded mobile launcher. Separate
  pages fallback build passed; `/Recall/pwa-viewport.js` retains blocking order,
  precache entry and manifest scope/start URL. Root deployment dist unaffected.
  Existing large-chunk and NO_COLOR/FORCE_COLOR warnings remain.
- Static artifact verification: 202 root bundle files inventoried in local
  `/tmp/recall-f-adoption-bundle-sha256.json`. Script matches reviewed source,
  precedes app modules, is precached; version is 1656 and not precached;
  manifest identity/icons remain root-based. Changed Markdown links passed.

Browser commands include the installed Chromium and WebKit executable overrides
and use `scripts/run-playwright.mjs` through approved unsandboxed execution,
with unchanged launch guards/global setup. Primary dimensions 393 x 852 CSS
pixels, DPR 3, plus shortened viewport, landscape and inset stress.

```sh
export RECALL_BUILD_VERSION=1.0-20261101-1656
export RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
export RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'
node scripts/run-playwright.mjs --grep 'iPhone系统安全框首帧' --project iphone15-webkit --workers=1
node scripts/run-playwright.mjs --workers=2
node /tmp/recall-f-adoption-artifacts.mjs --record
git diff --check
```

### Failed Checks And Recovery

1. Initial focused mobile run: 13 passed / 1 WebKit failure at immediate
   `noOverflow(page)` during the old-to-new test's responsive loop. Closing
   drawer class removal did not wait for the transform animation to finish.
   Added the existing animation-finished wait after closing, dimension shots
   and a bounded width/overflow poll; did not weaken the overflow assertion.
   A WebKit-only rerun passed (1 test, 12.9s); 852 x 393 screenshot showed the
   established landscape/desktop sidebar layout without horizontal clipping.
2. First full mobile run: 72 passed / 2 failures (2.1min), both in the newly
   extended public-safe app/diagnostic return test. The text locator matched
   both the Logo link `返回 Recall 设置` and the `返回 Recall` link. Added
   exact matching. No application changes or data reset for this test issue.
3. Strengthened the legacy update fixture to omit the new boot script from
   the old SW precache as well as old HTML, so the update must fetch and cache
   the newly introduced file before the offline reload. Final full rerun
   passed all 74 tests; all earlier failures remain recorded, not erased.

Logs remain local: `/tmp/recall-f-adoption-focused.log`,
`/tmp/recall-f-adoption-full-mobile.log`,
`/tmp/recall-f-adoption-full-mobile-final.log`,
`/tmp/recall-f-adoption-lint.log`, `/tmp/recall-f-adoption-unit.log` and
`/tmp/recall-f-adoption-pages-build.log`. Synthetic screenshots only.

Physical F is clear. Browser simulation does not implement the native iOS
overlay. The complete original app's post-update native appearance, keyboard,
drawer, offline and safe-area behavior remain unverified until owner feedback.

## Publication And Recovery

Commit/push/deploy IDs/URLs and public checks pending. Reuse `recall-memory`,
main and <https://recall-memory.pages.dev/> on account
`751b9fca4f5173fd70e0dfb69cff81e2`. Exact tested/committed bundle only.
No authenticated production mutation, database migration or credential change.

For a release regression, prior compatible deployment is `8856d0ab` after
rechecking active production. Same data/auth/budget contracts, but old header
may still be blurred. Use normal Pages rollback, preserve D1/local cards and
handle SW updates normally; never clear storage or reinstall to recover.
