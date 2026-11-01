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
- Status: implementation, local validation, source push and production upload
  completed. Public bytes/auth and three browser cases passed; one Chromium
  startup case failed including its bounded retry. On 2026-11-01 at 18:04 the
  owner confirmed the real app's upper-edge appearance is now good. Other native
  PWA acceptance paths remain separately unverified.

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

2026-11-01T17:11:33+08:00: committed reviewed task changes as
`b5e79fd804d6255d71a26911294b045e4cc0e62b`.
2026-11-01T17:11:47+08:00: normal `git push origin HEAD:main` succeeded,
`1c8d393..b5e79fd`; remote main matched the implementation SHA. No force push,
new branch, private attachments or unrelated dirty work included.

2026-11-01T17:12:25+08:00: deployed the previously inventoried 202-file root
bundle, unchanged after tests/commit, using:

```sh
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main --commit-hash b5e79fd804d6255d71a26911294b045e4cc0e62b
```

- Production deployment: `b15d48db-31e7-453e-b9d7-82667eca7ff5`.
- Deployment URL: <https://b15d48db.recall-memory.pages.dev/>.
- Stable production: <https://recall-memory.pages.dev/>.
- Pages listing confirmed Production/main/source `b5e79fd`; existing account,
  project and previous `8856d0ab` were rechecked before publication.
- Worker compiled and uploaded with unchanged Functions/production binding
  configuration. No authenticated production mutation, database migration,
  credential, schema, domain or paid-resource change.

### Public Verification

Commands used the same browser overrides and guarded unsandboxed launcher:

```sh
node /tmp/recall-f-adoption-artifacts.mjs --public
node /tmp/recall-f-adoption-artifacts.mjs --recovery
RECALL_URL=https://recall-memory.pages.dev/ node scripts/run-playwright.mjs --grep '系统安全框引导脚本公开可用|原安装显示诊断公开只读入口' --workers=1
RECALL_URL=https://recall-memory.pages.dev/ node scripts/run-playwright.mjs --grep '原安装显示诊断公开只读入口' --project iphone15-chromium --workers=1 --output /tmp/recall-f-adoption-public-mobile-retry
```

- 15 public resources returned 200 and matched tested bundle SHA256: root HTML,
  version, manifest, boot script, SW/Workbox, favicon, three install icons and
  five static diagnostic documents/scripts/styles. Root HTML and manifest,
  icon192, diagnostic boot and index each required a second attempt after
  `curl` SSL connection timeout (exit 28). No mismatched bytes observed.
- The first aggregate command then failed at anonymous `/api/session` due to
  SSL timeout. A bounded targeted recovery passed anonymous 401 and four
  additional main/workspace JS/CSS hashes. Workspace JS first timed out after
  45s with only 6018 bytes; its second attempt fully matched. Partial responses
  were not accepted. Completed recovery at 2026-11-01T17:17:01+08:00.
- First public browser batch completed at 2026-11-01T17:18:21+08:00:
  3 passed / 1 failed (5.7min). Both engines passed the new boot-script/app/
  diagnostic-return check; WebKit also passed the full A/B/C/F diagnostic
  switching and return check. Chromium's latter test failed before interactions
  at `Readiness: visible-app` (30s poll), showing `正在加载`. These are independent
  fresh browser contexts, not the owner's installed PWA or card library.
- The bounded Chromium-only retry completed at
  2026-11-01T17:22:57+08:00 and failed again at `Readiness: visible-app` before
  interactions, with the same loading snapshot. Stop retrying this case;
  full public A/B/C/F navigation in Chromium remains unverified. Both engines
  passed the new boot/app-return case and all 74 local cases passed. No proven
  new layout/data regression from this loading failure; exact native/browser
  cause remains undetermined. No rollback was performed or falsely reported.

Public logs remain local in `/tmp/recall-f-adoption-public-assets.log`,
`/tmp/recall-f-adoption-public-recovery.log`,
`/tmp/recall-f-adoption-public-mobile.log` and
`/tmp/recall-f-adoption-public-mobile-retry.log`. No real card writes, login,
credential read, user screenshot publication or test seeding on production.

### Owner Handoff And Evidence Follow-Up

Use the existing Recall icon and normal Logo-menu refresh/update to reach
`1.0-20261101-1656`. Check actual home-page upper edges, scrolling and drawer
opening/closing, not just the F static document, and provide the new screenshot.
No separate install, removal, storage clearing or reauthorization is required
by this change. Native full-app acceptance awaits that feedback.

At 2026-11-01T17:23:47+08:00 the public checks and limits were reconciled into
this record and the release index. Final evidence is a documentation-only
follow-up commit touching this record and `docs/RELEASES.md`, discoverable with
`git log -- docs/releases/20261101T165615+0800-iphone-system-frame-adoption.md`.
It publishes evidence to main without rebuilding or redeploying the unchanged
1656 app. Report its actual normal push result after completion.

For a release regression, prior compatible deployment is `8856d0ab` after
rechecking active production. Same data/auth/budget contracts, but old header
may still be blurred. Use normal Pages rollback, preserve D1/local cards and
handle SW updates normally; never clear storage or reinstall to recover.

## Real-App Physical Result And Lessons

Feedback received 2026-11-01T18:05:28+08:00, with a screenshot timestamped 18:04.
Following the production-update handoff, the owner says the app is now good and
asks for a lessons summary. In the real app's scrolled home view, the Logo,
title and right control upper edges are sharp and safely below the status
region. This accepts the originally reported upper-edge appearance issue on
the owner's Safari-installed iPhone PWA, not just isolated F. This message does
not display a build identifier or provide separate drawer, keyboard, native
offline/restart or device-update recordings. Do not expand visual acceptance
into a claim that all PWA paths or the prior failed Chromium case passed.
No private screenshot, card text or authorization information is published.

### What Worked

The effective intervention was browser-managed viewport insetting: use
`viewport-fit=auto` only for iPhone standalone, selected by a parser-blocking
same-origin script immediately after the viewport meta, before app rendering.
Keep cover for other devices/tabs and the no-script fallback. Preserve all four
env safe areas, dynamic height, Logo geometry, shadows and data. Static F was
physically clear before adoption, and the owner now accepts real-app appearance.
This is evidence for the practical workaround on this tested device/context,
not proof of a particular internal WebKit defect or a universal iOS fix.

### Reusable Investigation Rules

1. Reproduce in the original runtime. A Safari tab, desktop WebKit emulation,
   separately installed preview and existing home-screen PWA are not equivalent
   test contexts. Clear isolated A/B/C and full-shell D/E, including unchanged
   baselines, did not demonstrate a fix because they did not reproduce blur.
2. Keep a failing baseline in the same install and origin. The read-only static
   page reproduced blur without cards, cloud sync or app scripts. Same-install
   A/B/C remained blurred; changing viewport-fit in F distinguished an effective
   mechanism. Do not promote an unreproduced baseline's variants to production.
3. Compare actual computed values, not formulas alone. B reported env top 59px,
   Logo top 69px and sampler 69px; clear D reported Logo top 10px/sampler 11px.
   Both had screen height 852px and viewport height 793px. That shared 59px delta
   was not a root-cause proof or permission to subtract safe-area padding.
4. Verify delivered version, then stop blaming stale code without evidence.
   Earlier sampling fixes were active yet failed physically. Repeated reinstall,
   storage clearing or reauthorization would risk data while changing the test
   context. Use visible version, exact deployed bytes and normal SW updates.
5. Separate candidate efficacy from regression protection. Real-device F found
   the effective candidate; unit/browser checks protected device gating, initial
   rendering, geometry, responsive/drawer behavior, old SW updates and offline
   data preservation. Simulated native blur absence was never proof of efficacy.
6. Fix test timing and selectors without weakening gates. Wait for drawer
   animations and responsive layout, use exact link names, and model an old SW
   without the newly introduced file. Keep genuine overflow assertions and all
   failures. Bound public retries; incomplete downloads and unresolved startup
   failures remain failed/unverified even after physical visual acceptance.
7. Ship the smallest proven change and close the loop. No Logo asset, shadow,
   card/schema/cloud, install identity or origin changes were necessary. Commit,
   push and deploy the exact validated bundle; ask for real-app feedback and
   retain the distinction between visual acceptance and wider PWA acceptance.

This acceptance/retrospective update touches documentation only: this record,
the PWA contract and release index. Markdown links and diff checks are required;
no app rebuild, new deployment, device mutation or memory-store edit is needed.
Implementation remains `b5e79fd` / deployment `b15d48db` / version `1656`.

2026-11-01T18:06:41+08:00: `node /tmp/recall-f-adoption-artifacts.mjs` passed
Markdown links and reconfirmed the unchanged 202-file bundle;
`git diff --check` passed. Only the three stated docs changed, and remote main
still matched `0f5e8f3`. This docs-only follow-up will be committed/pushed normally
without another deployment; its actual push result is reported at handoff.
