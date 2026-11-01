# Read-Only Diagnostics In The Original Installed PWA

- ID: `20261101T111411+0800-installed-context-diagnostics`.
- Start: 2026-11-01T11:14:11+08:00. Delivery resumed at
  2026-11-01T12:31:46+08:00 after the user explicitly said to continue.
- Scope: app settings diagnostic entry, same-origin static comparison page,
  Service Worker navigation exception, tests and evidence. Not a blur fix.
- Status: committed, pushed and deployed; public checks passed after bounded
  network/readiness retries. Original installed-iPhone static page also blurred.
- Source base: `42d2611494c7b7bfdf104e4cffa334f262fce602`,
  `xuda645-eng/Recall` main. Task worktree is the isolated clean copy; unrelated
  dirty files in the original worktrees were preserved.
- Fixed build version: `1.0-20261101-1114`, retained through build, validation
  and deployment. It is not the eventual deployment clock time.
- Previous production: `2ac571d2-1cc4-4999-93ce-0f3330ce10f2`, source
  `a319c3bed7150080fc322222f260aa719448ca3b`, version `1.0-20261101-0230`.
  Existing Pages project/OAuth and public version were verified read-only.
- No schema, D1, auth, card format or synchronization changes. No real library
  writes, private screenshots or credentials are part of this release.

## Reason For This Diagnostic Release

The owner reported A/B/C and the actual-source D/E preview all clear on the
same iPhone 15 running iOS 27.0.1. After returning to the original Recall
home-screen icon, their 11:13 screenshot again shows a blurred Logo upper edge.
This is a current paired observation, not an assumption based on old images.

The separate installation does not reproduce the symptom. Installation state,
origin, runtime/data and timing differences remain hypotheses; no evidence
yet proves the native installation state is the root cause. More CSS padding,
background patches or additional separately installed previews would not
resolve that uncertainty. This release supplies a local diagnostic route in
the original installation without asking for removal/reinstallation.

## Changes And Safety

- Settings and data has a **顶部显示诊断** section. **显示运行信息** samples only
  version, display-mode flags, viewport/safe-area dimensions, the document's
  status-bar metadata and an explicit list of shell element geometry/styles.
  It does not read page text, user IDs, cookies, storage, credentials or cards.
  Nothing is automatically uploaded, copied or persisted. Sampling is on
  explicit click, not a background telemetry service.
- **打开原安装内对照页** navigates to `status-diagnostics/` under the existing
  origin/scope. The small static document does not mount React or load the
  application/data/sync modules. It retains the established Logo and control
  geometry and the nonpainting standalone sampler for comparison. Its local
  report contains only display values. CSP disallows network connections.
- The static page links back to `#settings` and retains the existing Recall
  manifest/identity; no new install, origin, account or resource is needed.
  Users should enter through the original icon, not a Safari tab or a newly
  installed diagnostic icon. Browser detection alone cannot prove the full
  native installation state.
- Workbox precaches the page/CSS/JS. A base-aware navigation fallback denylist
  keeps the static URL from resolving to the React app document. The normal
  manifest, icons, start URL, status-bar metadata and existing topbar CSS are
  unchanged. Existing root-app caching and update behavior remain in place.
- Only the settings content gains the entry. No style override runs on the
  existing Home page, drawer, reading or card screens.

## Validation

- `node node_modules/vitest/vitest.mjs run
  src/components/__tests__/memory-display-diagnostics.test.tsx
  src/components/__tests__/memory-status-edge.test.tsx`: seven passed.
- `node --check public/status-diagnostics/diagnostics.js`: passed.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 132 existing warnings.
- `node node_modules/vitest/vitest.mjs run --coverage`: 1385 tests across 79
  files passed; thresholds passed (41.7% statements, 39.41% branches,
  36.41% functions, 45.22% lines).
- `node node_modules/typescript/bin/tsc -b --noEmit`: passed.
- With `RECALL_BUILD_VERSION=1.0-20261101-1114`, cached Chromium-1223 and
  WebKit-2272 paths, approved unsandboxed `node scripts/run-playwright.mjs
  --grep '原安装|不透明固定顶栏|状态栏安全区' --workers=2`: initially nine passed,
  one explicit WebKit offline skip. Then extended the new offline test to the
  established WebKit isolated-server-shutdown strategy rather than skipping it.
- Final `RECALL_BUILD_VERSION=1.0-20261101-1114 RECALL_CHROMIUM=<cached-path>
  RECALL_WEBKIT=<cached-path> node scripts/run-playwright.mjs --workers=2`:
  **66 passed, no skips**, in 1.6 minutes. The config rebuilt the root-path
  production bundle before the suite. Both engines checked same-origin
  navigation/return, data preservation and offline first visit to the static
  page. Other checks cover update activation, drawer, safe areas, review,
  import, archived progress, keyboard/focus and responsive layouts.
- Unit tests verify no storage reads/writes/clear or fetch on report capture,
  no copied private text/attributes and same-scope link construction.
- Static-page tests verify no application chunk or API requests, 0/20/59/96px
  top inset and 34px bottom inset, 48px controls and no horizontal overflow.
  Synthetic WebKit screenshot inspected. These do not simulate native blur.
- Documentation links and diff whitespace checked before commit.
- Windows Obsidian paths/Graphify remain unavailable on this Mac; bootstrap
  used the supplied architecture map and targeted owning files. No vault or
  generated graph files were changed.

## Publication And Recovery

- Implementation SHA: `08c6e46c2f452733e74fe27dc074ccbbdde8cca9`.
  `git push origin HEAD:main` advanced main from `42d2611` to `08c6e46`;
  `git ls-remote origin refs/heads/main` confirmed the full SHA before deployment.
- Deployment command started at 2026-11-01T12:54:51+08:00:

  ```sh
  CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main --commit-hash 08c6e46c2f452733e74fe27dc074ccbbdde8cca9 --commit-message 'feat: add read-only display diagnostics inside installed PWA'
  ```

- Successful production deployment: `e31a1318-3c49-48ed-a341-ef310dda5103`.
  Live origin: <https://recall-memory.pages.dev/>. Immutable deployment:
  <https://e31a1318.recall-memory.pages.dev/>. The production deployment list
  confirmed this ID and source `08c6e46` at 2026-11-01T13:11:39+08:00.
- The clean worktree and all 199 tested bundle files were rechecked against
  their SHA-256 inventory before publication. Wrangler uploaded 29 changed
  static files, reused 168, and uploaded the existing Functions bundle and
  routing/headers. No dirty source, migration, binding or secret change.
- Reuse existing `recall-memory` production `main`, not the prior synthetic
  preview project aliases. Publish only the exact reviewed committed build.
- Public checks must exercise the read-only entry only, not mutate the owner's
  library. Verify normal app/manifest/icons/SW plus the diagnostic URL/return.
- For a release regression, compatible prior app deployment is `2ac571d2`:
  it predates only this diagnostic addition and has the same data/schema/auth
  contracts. It is not a known blur-free fix. Recheck current deployment before
  using the existing Pages production rollback to that ID; never overwrite a
  newer unrelated release or reset card data. A rollback may require normal
  Service Worker update handling, not storage deletion.
- Native installed-instance result remains unverified and must be supplied
  by the user. This release does not claim to resolve the original blur.

## Public Verification And Retry Evidence

- With the same cached browser paths and guarded launcher:

  ```sh
  RECALL_URL=https://recall-memory.pages.dev/ RECALL_CHROMIUM=<cached-path> RECALL_WEBKIT=<cached-path> node scripts/run-playwright.mjs --grep '原安装显示诊断公开只读入口' --workers=2 --output=/tmp/recall-installed-diag-live-results
  ```

  Chromium passed in 1.2 minutes. WebKit failed at `Readiness: sw-control`
  after the unchanged 300-second timeout. The settings page and new entry
  rendered, but that first WebKit run did not establish SW control or complete
  the diagnostic roundtrip. It is recorded as a failure, not a pass.
- One bounded single-worker WebKit retry used the same test, with
  `--project iphone15-webkit --workers=1 --reporter=list,json`, JSON output at
  `/tmp/recall-installed-diag-live-webkit-retry.json` and results at
  `/tmp/recall-installed-diag-live-webkit-retry-results`. It passed in 1.2
  minutes without changing assertions, timeout, app code or browser security.
  Thus both engines eventually verified SW control/cache readiness, local
  report display, same-origin static navigation and return to settings.
- The initial public-byte verifier used four concurrent `curl -L --fail
  --silent --show-error --connect-timeout 10 --max-time 45` requests. It failed
  with SSL connection timeout on `icons/apple-touch-icon.png`. The required
  unsandboxed retry failed similarly on `workbox-9c191d2f.js`. A separate
  version request also timed out despite receiving HTTP 200 and its body;
  that request was not counted as successful.
- Recovery changed transport only: one serial, reusable HTTP/1.1 curl process,
  10-second connect / 30-second per-transfer limits, with each response checked
  against the validated SHA-256 inventory. All **27 selected public assets**
  matched: app document/entry assets, workspace JS/CSS, manifest, four PWA
  icons, SW/Workbox, version and diagnostic HTML/CSS/JS. This passed at
  2026-11-01T13:12:01+08:00. The final version request completed with HTTP 200,
  `Cache-Control: no-store` and `1.0-20261101-1114`.
- Anonymous `GET /api/session` returned 401. No authorized request, fixture
  import or production-card mutation was performed. Live checks ran in fresh
  isolated browser contexts, not the owner's authenticated browser.
- Local tests establish offline first entry/return in both engines and
  old-to-new SW/data persistence. Public checks establish live cache readiness
  and online roundtrip, not physical iPhone offline/update acceptance. No
  release regression was detected in completed checks; no rollback performed.
- Evidence logs remain local under `/tmp/recall-installed-diag-live-*`;
  private screenshots, browser state and credentials are not published.

## Device Handoff

Keep the original Recall home-screen icon. Apply the normal app update to
`1.0-20261101-1114`, then open **Logo menu > 设置与数据 > 顶部显示诊断 >
打开原安装内对照页**. Report whether this page's Logo upper edge is still
blurred and supply its screenshot. Return through **返回 Recall**. Do not
install another icon, clear website data or remove/reinstall the original app.
This is a new diagnostic entry, not a claim that another refresh fixes blur.

## Original Installed Static Page Result

2026-11-01T13:34+08:00: the owner's new screenshot shows the same upper-edge
blur on the static page's Logo and controls. The visible label reports
home-screen PWA mode. This establishes that the symptom occurs without the
React workspace, card rendering or cloud scripts. It does not establish the
original installation itself, rather than native viewport/edge behavior, as
the cause. The screenshot includes an expanded Dynamic Island/live activity;
earlier blurred screenshots do not, so this is not evidence that the activity
is necessary. The private screenshot is not published.

The original-context reproduction is now available. Next compare painted
safe-area and sticky/document-scroll variants inside this same diagnostic
page, without changing the real app's header or installing another icon.
