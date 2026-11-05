# Approved Drawer Design Implementation

Checkpoint: 2026-11-05T22:30:50+08:00 (Asia/Shanghai).
First focused unit checkpoint: 2026-11-05T22:20:06+08:00.
Status: published V1.1-20261105-2224; post-publication checks completed with
recorded recoveries and limitations. Publication confirmed at
2026-11-05T22:34:30+08:00. Record checkpoint: 2026-11-05T22:59:28+08:00.

## Accepted Scope

The user approved the holistic drawer prototype and requested implementing it.
This ends the prototype-only hold for this design. Normal standing delivery
authorization applies: validated source on main, then the existing production
project/origin. No parallel-delivery exception was enabled.

Navigation and settings share 14px semibold labels, 30px leading icon slots and
14px gaps. Settings is a real navigation entry, not a footer note. Cloud status,
time and build identity use 14px regular text, 22px line height, equal 8px row
gaps and the same text axis. The version omits redundant Recall text but retains
the full `V1.1-20261105-2224` identity.

The version-paired 18px open-ring refresh arrow uses a transparent 44px target,
with no floating circular backing or full-row action label. A new opt-in compact
presentation on PWAAppVersion leaves legacy/non-compact behavior intact. The
accessible sync/update label, in-flight lock, failure feedback, sync-before-check
ordering and storage preservation remain. New-version guidance correctly refers
to the right-hand icon. Pending items, media hints, errors and conflicts remain
visible. Local-preview cloud isolation remains intact.

Real-app enlarged-text acceptance found a bottom-safe-area issue. The drawer's
scroll viewport now ends above `--safe-bottom`, with footer allowance for the
icon target, so long messages can scroll without controls entering the home
indicator region. The shared 48px Logo/appbar and foreground/drawer movement
remain unchanged. No cloud API, data/schema, credential or paid-resource changes.

## Validation

- Focused sync/update/UI units: 87/87 passed.
- Full final unit suite: 1684/1684 in 105 files, 34.65 seconds. Type check passed.
- Full ESLint: 0 errors, 132 existing warnings. Final touched-file lint passed.
- Production build: passed; 165 precache entries / 3354.60 KiB. Existing chunk
  size warning retained. Final artifact is frozen at
  `/private/tmp/recall-drawer-approved-final-dist`, served on loopback port 4429.
  It was not rebuilt while tests were using it.
- First focused mobile run: 6/8 passed, two real enlarged/safe-area failures.
  After fixing the drawer scroll boundary, final focused run: 8/8, 13.9 seconds.
- Broad product run: 150 passed / 10 skipped in 3.9 minutes. RECALL_URL pointed
  at the isolated loopback server but triggered the suite's public-only skip
  guards; this was not treated as complete validation.
- Recovery config under ignored `quality/drawer-approved/local.config.ts`
  removed that environment marker without rebuilding the frozen artifact.
  Local installed/preview checks: 16/16 passed in 36.8 seconds, covering all ten
  skipped checks, four iPhone preview cases and two repeated diagnostics cases.
  Combined: all 160 product cases plus four preview cases passed across runs,
  164 distinct mobile cases, not a clean single 160/160 aggregate.
- Geometry checks cover 393 x 852 CSS / DPR 3, 320, 525, 760/761 and desktop;
  20px text with long timestamps, 59px top/34px bottom, dark/reduced motion,
  actual text axes, 8px gaps, version/icon centers and 44px hit testing. Broader
  flows include home/folders, imports/updates, long reading, rating/undo,
  statistics, sheets, all drawer closing paths and offline/persistence/update.
- These are browser simulations using synthetic local data. No owner-library
  mutation tests or private-card publication occurred. Physical iPhone Safari
  home-screen acceptance remains separate and is not claimed.

Commands from repository root:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vite/bin/vite.js build --outDir /private/tmp/recall-drawer-approved-final-dist
node node_modules/vite/bin/vite.js preview --outDir /private/tmp/recall-drawer-approved-final-dist --host 127.0.0.1 --port 4429 --strictPort
node scripts/run-playwright.mjs --config=e2e/product-review.config.ts --workers=2 --output=quality/drawer-approved/full-product
node scripts/run-playwright.mjs --config=quality/drawer-approved/local.config.ts --grep '正式应用仅iPhone|系统安全框首帧|原安装|同源iPhone15' --workers=2 --output=quality/drawer-approved/installed-local
```

Product run environment: `RECALL_URL=http://127.0.0.1:4429/`,
`RECALL_E2E_BUILD_DIR=/private/tmp/recall-drawer-approved-final-dist`. The recovery
omits RECALL_URL and uses the ignored config with the same baseURL. Installed
Chromium/WebKit paths were supplied via RECALL_CHROMIUM / RECALL_WEBKIT; browsers
ran outside macOS Seatbelt using the required guard and global startup preflight.

Private local evidence remains ignored in `quality/drawer-approved/`; command
logs are `/private/tmp/recall-drawer-implementation-{final-lint,final-units,final-build,product,installed}.log`.
The Windows vault/Graphify remain unavailable; targeted ownership paths and
the existing project map were used as previously disclosed.

## Hosting Preflight And Recovery

Wrangler 4.156.0 read-only checks verified the existing authorized account
`751b9fca4f5173fd70e0dfb69cff81e2`, recall-memory project, main production and
previous deployment `8c11afc0-2e41-4515-8598-bc9210e031e4` / source
`7e55bc939eaaf35f372dba26f339fd8d88a5211b`. No new resources or plan changes.

The first sandboxed npx reads failed with npm-cache EPERM; approved unsandboxed
retries succeeded. No chown or permission/security changes were performed.
Ordinary curl and IPv4 curl version reads timed out. A TLS-verified HTTPS read
using the current DNS A record `172.66.47.169` succeeded with HTTP 200 and
releaseVersion `1.1-20261105-1919`. A first ad hoc Node lookup callback was
incompatible with Node's all-address signature; correcting that callback
resolved the diagnostic failure. These were network/tool failures, not app passes.

The asset verifier now optionally accepts RECALL_PRODUCTION_IPV4, only if it
matches a current production DNS A record, and handles Node's lookup signature.
The original hostname, certificate validation and same-origin checks remain.
This matches the existing Chromium public-check resolver option, not a DNS or
origin change. Syntax and scoped lint passed. Public runtime checks follow upload.

## Source, Deployment And Recovery

Source base: `33763c41fe132fdb5bf2619baeaeeddf89575c62` in the clean delivery
worktree. Only requested implementation/tests/verification and this record/index
are committed; the original dirty trial, unrelated style-lab and all private
files remain excluded.

- Application source: `fe91e8daaa23d54c15a12dd3765bab90c5a95ee1`, committed at
  2026-11-05T22:32:34+08:00. Normal push succeeded: `33763c41..fe91e8da`,
  `HEAD -> main` on xuda645-eng/Recall.
- Production deployment: `bd069dc9-4aa9-4058-81b4-871d42e6509e`, confirmed by
  the existing project's deployment list at 2026-11-05T22:34:30+08:00. Stable
  URL: https://recall-memory.pages.dev/. Immutable deployment:
  https://bd069dc9.recall-memory.pages.dev/.
- Uploaded the frozen validated build using the exact application source SHA:
  205 assets, 28 new / 177 reused, with Functions, headers and routes. No dirty
  deployment flag, new resources or production-origin changes.
- User-facing `releaseVersion` is `1.1-20261105-2224`. The legacy `version`
  field remains `1.0-20261105-2224` for existing update identity compatibility;
  this is not a downgrade of the displayed V1.1 release.
- Verification-only follow-up: `276e43af697ff28470d85739e2f3189a991750e1`,
  committed at 2026-11-05T22:57:57+08:00. Native static requests are retained in
  public PWA tests, API interception remains isolated, failure diagnostics were
  added and raw HTTPS reads have a 30-second total abort deadline. Scoped lint,
  syntax and staged diff checks passed. Initial sandboxed push failed because
  the GitHub credential helper was unavailable; the approved outside-sandbox
  retry succeeded normally: `fe91e8da..276e43af`, `HEAD -> main`.
- This verification-only change and the documentation closeout do not alter
  the deployed app bundle or trigger another app deployment.

```sh
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy /private/tmp/recall-drawer-approved-final-dist --project-name recall-memory --branch main --commit-hash fe91e8daaa23d54c15a12dd3765bab90c5a95ee1 --commit-message 'feat: implement approved compact drawer design for V1.1'
```

Target: existing https://recall-memory.pages.dev/ and recall-memory main. Publish
the exact frozen root-path bundle, not dirty source or a Pages-base preview.
No DB migration, auth/secret change, new origin, paid resource or owner test seed.
Cloud/UI safety code is unchanged except read-only presentation.

Compatible fallback: production deployment `8c11afc0-2e41-4515-8598-bc9210e031e4`,
source `7e55bc939eaaf35f372dba26f339fd8d88a5211b`, build V1.1-20261105-1919.
Compatibility follows unchanged schemas/APIs and the preserved sync/update
protocol; the original-to-new offline/persistence tests passed. If this release
regresses, first confirm it is still the active production, then roll back to
that deployment using recall-memory's Pages deployment rollback in the existing
dashboard/API and verify public recovery. Asset rollback does not undo device
reviews/imports or caches. Never clear owner storage, restore private snapshots,
reset D1, rewrite history or force-push as rollback.

No rollback was performed. The final critical activation/cache checks passed;
the unresolved ICO read below is an unchanged noncritical-resource verification
limitation, not evidence of a new app regression.

## Public Verification And Retained Failures

- Initial public run: 6/8 passed in 5.6 minutes. Both cache cases timed out
  waiting for an activated controller. The six successes include intercepted
  synthetic WeRead UI/generation, eleven key committed resource digests and
  five anonymous API gates returning 401/no-store, across both engines. These
  do not establish authenticated owner sync or a real model call.
- Cache recovery using the current DNS IPv4 `172.66.44.87`: 1/2 passed in
  4.4 minutes. Chromium verified all 161 unique precache paths (165 manifest
  entries), activated controller, rejection of a genuinely uncached offline
  probe, offline reload and synthetic snapshot persistence. WebKit still failed.
- Another WebKit diagnostic attempt with whole-site routing failed. The final
  recovery intercepted only API requests, leaving static resources native;
  same-origin/GET guards and all cache/persistence/layout assertions remain.
  Final WebKit recovery: 1/1 passed in 1.7 minutes, with all 161 unique paths
  cached, controller activated and online refresh persistence confirmed.
- Combined: all eight distinct public cases passed across initial/recovery
  runs, not a clean single 8/8 run. No product Service Worker code changed to
  obtain these results. Public WebKit actual-offline simulation remains
  unverified; local WebKit stopped-server offline checks passed separately.
- Full asset scan: raw Node/curl reads were unstable across both current DNS
  addresses. An earlier unbounded Node scan was cancelled; a bounded retry
  failed. Chromium browser scan aborted; the WebKit scan collected all 205
  resource results but failed to load `favicon.ico`. Offline comparison of the
  saved browser digests against the frozen deployed build verified 204/205
  exact SHA-256 hashes, with no other mismatches. No 205/205 pass is claimed.
- The legacy ICO is byte-identical before/after this app release, SHA-256
  `15e5f91a3cabfa007b57f9c25226a099f31aad0cefbb9e1ac201a90fb8460582`.
  Dedicated ICO retries against both DNS addresses also timed out. It is not
  a primary manifest icon and is not precached. Manifest PNG icons, SVG icon,
  app resources and Service Worker were verified. ICO availability remains a
  recorded noncritical network-read limitation; unrelated icon changes were
  not made to hide it.
- Physical iPhone Safari home-screen installation/launch, actual device safe
  areas and updates have not been tested in this task. Browser simulations are
  not physical phone acceptance. No owner-library data was cleared, imported,
  rated or otherwise mutated by the acceptance tests.

Public commands from the clean delivery worktree, with installed browser paths
in RECALL_CHROMIUM / RECALL_WEBKIT and RECALL_VERIFY_DIST set to the frozen build:

```sh
node scripts/run-playwright.mjs --config=e2e/v11-public.config.ts --workers=2 --output=quality/drawer-approved/public
RECALL_PRODUCTION_IPV4=172.66.44.87 node scripts/run-playwright.mjs --config=e2e/v11-public.config.ts --grep '公网缓存' --workers=2 --output=quality/drawer-approved/public-cache-recovery
node scripts/run-playwright.mjs --config=e2e/v11-public.config.ts --project=v11-public-webkit --grep '公网缓存' --workers=1 --output=quality/drawer-approved/public-webkit-native
RECALL_PRODUCTION_IPV4=172.66.44.87 node scripts/verify-pwa-assets.mjs /private/tmp/recall-drawer-approved-final-dist quality/drawer-approved/public-assets.json
node scripts/run-playwright.mjs --config=quality/drawer-approved/assets.config.ts --workers=1 --output=quality/drawer-approved/public-browser-assets
```

Retained evidence: ignored `quality/drawer-approved/public-browser-assets.json`
contains all 205 browser results. An offline replay during closeout confirmed
204 matches and the single ICO read failure. Logs remain local at
`/private/tmp/recall-drawer-implementation-{public,public-cache-recovery,public-webkit-final,public-webkit-native}.log`;
hosting confirmation is `/private/tmp/recall-drawer-production-deployments.log`.
No private input or owner screenshots are included in the public source record.

Related: [approved prototype](./20261105T220933+0800-drawer-holistic-reconsideration.md),
[previous production](./20261105T191943+0800-drawer-unified-sync-update.md).
