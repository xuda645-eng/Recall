# Approved Drawer Design Implementation

Checkpoint: 2026-11-05T22:30:50+08:00 (Asia/Shanghai).
First focused unit checkpoint: 2026-11-05T22:20:06+08:00.
Status: validated implementation; source publication and deployment pending.

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
files remain excluded. Actual source SHA, normal push and deployment outcomes
are appended after publication.

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

Related: [approved prototype](./20261105T220933+0800-drawer-holistic-reconsideration.md),
[previous production](./20261105T191943+0800-drawer-unified-sync-update.md).
