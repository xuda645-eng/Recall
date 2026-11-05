# Drawer Unified Sync And Update

Start: 2026-11-05T19:19:43+08:00 (Asia/Shanghai).
Status: implementation validated; source commit and production publication pending.
Frozen PWA identity: `1.1-20261105-1919`.

## Request And Implementation

The user annotated the production drawer and requested combining the two
sync-looking controls into one at the bottom. They represented distinct
operations: cloud-library synchronization and application update/refresh.

- Replace both drawer icon actions with one bottom full-width labelled button:
  "同步并检查更新". Put Settings above the status/version block. Cloud status,
  pending/conflict counts, source-image state and last success time remain
  visible and read-only. No hidden second sync action is kept in the status row.
- Use the existing cloud-sync operation, then validate its resulting phase,
  pending count and conflicts before invoking the existing PWA updater. Never
  refresh over incomplete synchronization, conflict, loss of authorization or
  reported failure. Preserve data and show a recoverable error instead.
- Local-only/unauthorized devices still check app updates without cloud writes.
  The explicitly flagged loopback preview never calls cloud sync, even if a
  stale cached session exists. Its update-only control remains separate from
  production behavior.
- A same-frame lock covers both operations; duplicate taps do not synchronize
  or refresh twice. The active label identifies the combined work. Existing
  unsaved-edit disabling, Service Worker behavior and legacy metadata alias
  remain unchanged. Management/pairing/conflict handling is reachable through
  Settings > Manage cloud sync, not an ambiguous second drawer control.
- Preserve 48px shared shell/Logo, drawer motion and 14px action radius with
  minimum 44px hit area. No schema, production API, credential, image format or
  infrastructure changes are included. Media synchronization still uses the
  existing durable queue/status rather than a new upload contract.

Source base: `7e3bd2e94c86d4f6c96c14e423933434a5a17a88` in the clean publication
worktree `/private/tmp/recall-v11-release`. The original detached trial contains
inherited modifications and is preserved without staging/reset. The Windows
vault/handoff and Graphify remain unavailable on this Mac; project architecture
instructions and targeted reads were used. No private owner library or mutation
test is published or run against the production library.

## Validation

- Focused unit validation: 4 files / 70 tests passed. New cases cover combined
  ordering/lock/retry, incomplete sync/phase transitions, stale synced labels,
  conflict protection, no-session and local-preview boundaries.
- Full units: 105 files / 1683 tests passed. Types passed. Full lint passed:
  0 errors / 132 existing warnings. Production root-path build passed with 165
  precache entries; existing large-chunk warning remains unchanged.
- First focused iPhone Chromium/WebKit run: 10 passed / 2 failures. The old
  test expected focus to return to the removed drawer management action's Logo
  fallback. Cloud management now opens from Settings; closing correctly returns
  to the initiating Manage cloud sync button. The assertion was corrected to
  that actual trigger, retaining focus restoration and transparent/noncircular
  close-button assertions. The failure is retained, not called a product pass.
- Full product rerun and public outcomes are appended after execution. Geometry
  checks assert one combined button, no status-row button, ordering after
  Settings, click hit-testing, 393/320/525/760/761/1280px, larger action text,
  59px top/34px bottom stress and no page overflow. Existing suites cover all
  drawer closure paths, first frames, long reading/ratings/undo, import and
  offline/update persistence.
- The additional enlarged-text setup crossed from desktop back to mobile after
  testing 1280px. The existing breakpoint handler correctly closes the drawer;
  this new setup omitted reopening it, so both engines timed out waiting for
  the hidden action. Earlier width/hit-testing assertions had passed. Recovery
  must use the real Logo action to reopen the drawer, not alter its production
  breakpoint behavior, force a hidden click or weaken the visibility assertion.
- Physical iPhone Safari-installed acceptance is not performed by desktop
  simulations. Public WebKit offline simulation previously failed in the engine;
  do not reclassify that limitation as a pass. Local stopped-server WebKit and
  public Chromium offline coverage are tracked separately.

Commands (installed browser paths supplied via `RECALL_CHROMIUM` and
`RECALL_WEBKIT`, guarded launcher executed outside Seatbelt with tool approval):

```sh
node node_modules/vitest/vitest.mjs run src/services/__tests__/pwa-cloud-refresh.test.ts src/components/__tests__/memory-cloud.test.tsx src/components/__tests__/pwa-app-version.test.tsx src/services/__tests__/pwa-refresh.test.ts
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/eslint/bin/eslint.js .
RECALL_BUILD_VERSION=1.1-20261105-1919 node node_modules/vite/bin/vite.js build
RECALL_BUILD_VERSION=1.1-20261105-1919 node scripts/run-playwright.mjs --config=e2e/product-review.config.ts --workers=2 --grep '抽屉显示固定构建版本|版本刷新|同步状态仅在抽屉|iPhone15首页|状态栏安全区与Logo行' --output=quality/sync-button/focused
RECALL_BUILD_VERSION=1.1-20261105-1919 node scripts/run-playwright.mjs --config=e2e/product-review.config.ts --workers=2 --output=quality/sync-button/product
```

Logs are local: `/private/tmp/recall-sync-button-focused.log`,
`/private/tmp/recall-sync-button-units.log`,
`/private/tmp/recall-sync-button-lint.log`,
`/private/tmp/recall-sync-button-build.log`,
`/private/tmp/recall-sync-button-mobile-focused.log`,
`/private/tmp/recall-sync-button-product.log`.

Completed browser checkpoint: 2026-11-05T19:35:05+08:00. The full product run
had 158 passes / 2 setup failures in 5.7 minutes, both the omitted drawer reopen
described above. Adding the real Logo click after returning to 393px recovered
the full targeted 12/12 Chromium/WebKit run in 35.6 seconds. There are 160
distinct passing full-product cases across execution/recovery, not a clean
aggregate 160/160 run. Focus restoration, bottom-inset and 20px action text,
all widths, hit-testing and update/offline assertions passed; no timeout or
production breakpoint behavior was changed. Full lint after the setup fix
passed again with 0 errors / 132 existing warnings.

Recovery command used the same focused command above with
`--output=quality/sync-button/recovery`. Evidence:
`/private/tmp/recall-sync-button-mobile-recovery.log` and
`/private/tmp/recall-sync-button-final-lint.log`. Three affected documents / 76
local links passed validation; diff whitespace and reviewed-file privacy checks
passed. Application code did not change after full units/types/build checks.

## Publication And Fallback

Application SHA, normal fork main push, deployment identity and public results
will be recorded after validated publication. Reuse existing Free account
`751b9fca4f5173fd70e0dfb69cff81e2`, Pages project `recall-memory`, main and
`https://recall-memory.pages.dev/`. No resource, DNS, billing or secret change.

Previous known-good production: `aff714f3-478e-41de-8d21-1cc0c0d98ac8`, source
`a276ca87c74b31b81f4a29ac6a1b069eff50aefe`, build `1.1-20261105-1801`, immutable
`https://aff714f3.recall-memory.pages.dev/`. If this revision causes a regression,
recheck the current deployment and use a compatible Pages asset rollback to
that deployment. No card/hierarchy/schema format changed, so it reads current
data. Asset rollback does not undo user reviews/imports or device caches. Never
clear storage, restore earlier private snapshots or reset D1 for rollback.

Related: [V1.1 release](./20261105T180104+0800-v1-1-paper-editorial.md),
[PWA contract](../PWA.md).
