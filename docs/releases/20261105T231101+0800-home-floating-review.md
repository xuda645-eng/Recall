# Floating Home Review Action And Smaller Drawer Metadata

Record checkpoint: 2026-11-05T23:11:01+08:00 (Asia/Shanghai).
Status: published V1.1-20261105-2307; public verification passed with retained
recovery history and explicit physical-phone/WebKit-offline limits.

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
The validated app source was published after the complete mobile run.

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

## Publication Outcomes

- Source: `fae5cdc8bc9cfe14a927d13bb93da03ec5e7fe8a`, committed at
  2026-11-05T23:15:42+08:00. Normal push succeeded: `ad0f3f11..fae5cdc8`,
  `HEAD -> main`. Remote main matched the exact app source before upload.
- Deployment: `083c047d-cf0c-485e-8dee-e11c5119525d`, upload completed at
  2026-11-05T23:17:04+08:00. Read-only production confirmation at
  2026-11-05T23:17:49+08:00 mapped this deployment to source fae5cdc8.
  Immutable URL: https://083c047d.recall-memory.pages.dev/.
  Stable production: https://recall-memory.pages.dev/.
- Published the frozen root-path artifact without a dirty deployment flag:
  205 assets, 28 new / 177 reused, with Functions/headers/routes. No new cloud
  resources, origin changes or data mutations. Displayed releaseVersion is
  `1.1-20261105-2307`; legacy metadata version stays `1.0-20261105-2307` for
  existing update compatibility.
- No rollback performed. Previous compatible deployment remains bd069dc9.
  Final public checks established cache activation, core resource identity and
  persistence without a known application regression.

## Public Verification

- Initial public run: 6/8 passed in 4.8 minutes. Both Chromium failures were
  network-read timeouts: the cache case timed out after 120 seconds awaiting
  initial DOMContentLoaded; the resource case timed out inside its bounded
  browser fetch. These failures are retained, not counted as passes.
- WebKit verified the new single transparent home action, 14/12/12px drawer
  text, version/icon alignment, all 161 unique precache paths, activated
  controller and online refresh persistence. Its resource check passed eleven
  exact committed digests, including manifest/icons/app/SW, and five anonymous
  401/no-store API gates. Both engines passed synthetic WeRead UI/generation
  checks; those use intercepted data and are not real model/owner sync tests.
- Recovery removed only the optional diagnostic IP override, using ordinary
  DNS and the same origin, source, bundle, assertions and API isolation.
  Both single-case Chromium runs failed: the cache test showed an installing
  worker and existing precache but no activated controller within 120 seconds;
  the resource case timed out awaiting initial DOMContentLoaded. These are not
  passes. No application or security changes were made for the recovery.
- A further bounded diagnostic uses an ignored TCP/TLS browser config, the
  other current production DNS A record `172.66.47.169`, and one worker. Only
  QUIC transport is disabled in this isolated test browser; HTTPS certificate
  verification, same-origin/API isolation and all original assertions remain.
  This changes no production, OS or application setting. Both TCP diagnostic
  cases failed: one exceeded the 30-second lazy-workspace visibility window,
  while the resource case again timed out at initial DOMContentLoaded.
- Final cache recovery preserved every assertion but used a bounded 120-second
  workspace loading window and 300-second cold-cache activation window, with a
  600-second maximum case timeout. Same frozen build and TCP/TLS profile:
  Chromium 1/1 passed in 2.8 minutes. All 161 unique precache paths, activated
  controller, genuine uncached offline-probe rejection, offline reload,
  synthetic snapshot persistence and the new drawer/home geometry passed.
- Final resource recovery kept static requests native rather than routing
  every asset. External-origin and API requests remain intercepted and guarded;
  all static requests are monitored for same-origin GET and no credentials.
  All digest and anonymous gate assertions remain. Chromium 1/1 passed in
  35.4 seconds: eleven exact committed digests and five 401/no-store API gates.
- Combined: all eight distinct public cases passed across initial/recovery
  runs, not a clean single 8/8 run. The application bundle was not changed or
  redeployed to obtain these results. No 205-resource full hash scan or physical
  phone pass is claimed for this task.
- Public WebKit actual-offline simulation and physical iPhone installed PWA
  acceptance remain unverified; local WebKit stopped-server offline checks
  passed in the complete mobile run. No owner storage, cards, progress or
  credentials were cleared, imported or changed during public verification.

```sh
RECALL_VERIFY_DIST=/private/tmp/recall-home-floating-final-dist node scripts/run-playwright.mjs --config=e2e/v11-public.config.ts --project=v11-public-chromium --grep '公网缓存' --workers=1 --output=quality/home-floating/public-native-recovery
RECALL_VERIFY_DIST=/private/tmp/recall-home-floating-final-dist node scripts/run-playwright.mjs --config=e2e/v11-public.config.ts --project=v11-public-chromium --grep '公网已提交资源' --workers=1 --output=quality/home-floating/public-assets-recovery
RECALL_VERIFY_DIST=/private/tmp/recall-home-floating-final-dist node scripts/run-playwright.mjs --config=quality/home-floating/public-tcp.config.ts --grep '公网缓存|公网已提交资源' --workers=1 --output=quality/home-floating/public-tcp-recovery
RECALL_VERIFY_DIST=/private/tmp/recall-home-floating-final-dist node scripts/run-playwright.mjs --config=quality/home-floating/public-tcp.config.ts --grep '公网缓存' --workers=1 --output=quality/home-floating/public-slow-cache
RECALL_VERIFY_DIST=/private/tmp/recall-home-floating-final-dist node scripts/run-playwright.mjs --config=e2e/v11-public.config.ts --project=v11-public-chromium --grep '公网已提交资源' --workers=1 --output=quality/home-floating/public-assets-native
```

Retained public logs are
`/private/tmp/recall-home-floating-{public,public-native-recovery,public-assets-recovery,public-tcp-recovery,public-slow-cache,public-assets-native}.log`.
Hosting outcomes are `/private/tmp/recall-home-floating-{deploy,after}.log`.

Verification-only follow-up source:
`282add69c08f3b6ec607db40cb2933cd01356cb0`, committed at
2026-11-05T23:34:30+08:00. Scoped ESLint and staged diff checks passed for both
public test files. Normal push succeeded: `fae5cdc8..282add69`, `HEAD -> main`.
This change only makes test loading windows and request
routing consistent with the recorded recovery; it does not change the app,
Service Worker, production transport or deployment. Documentation closeout is
published separately without another app deployment.

```sh
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy /private/tmp/recall-home-floating-final-dist --project-name recall-memory --branch main --commit-hash fae5cdc8bc9cfe14a927d13bb93da03ec5e7fe8a --commit-message 'fix: float home review action and reduce drawer metadata size'
RECALL_VERIFY_DIST=/private/tmp/recall-home-floating-final-dist RECALL_PRODUCTION_IPV4=172.66.44.87 node scripts/run-playwright.mjs --config=e2e/v11-public.config.ts --workers=2 --output=quality/home-floating/public
```

The resolver override uses a currently verified production DNS A record while
preserving the hostname, HTTPS validation and origin; it does not change DNS or
disable security. Browser paths and outside-sandbox guards are as above.

Related: [previous release](./20261105T223050+0800-drawer-approved-implementation.md),
[PWA acceptance](../PWA.md), [deployment](../DEPLOYMENT.md).
