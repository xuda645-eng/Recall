# Startup Dependency And Offline Optimization

- Release ID: `20261031T222000+0800-startup-optimization`.
- Scope: requested frontend startup and acceptance optimization, not an API,
  D1 schema/data, credential, origin, DNS, VPN or timeout-policy change.
- Started approximately 2026-10-31T22:10:00+08:00; record created at
  2026-10-31T22:20:00+08:00.
- Status at record creation: local gates passed; publication outcomes below.
- Repository/branch: `xuda645-eng/Recall`, `main`.
- Baseline source: `34052b9f0c3f3df4cddfb9d738ac1148bf16d532`.
- Implementation SHA, push/deployment/verification times and outcomes: appended
  after publication. Git locator: implementation commit containing this record.
- Production origin remains <https://recall-memory.pages.dev/>.
- Previous production rechecked with Wrangler at approximately
  2026-10-31T22:11:00+08:00: `d606405a-f52d-42de-90bc-6ca5b961cfcf`, source
  `552f483398075c0720ed25b6d1c4099ede4df8d8`,
  <https://d606405a.recall-memory.pages.dev/>.
  Its prior public verification was partial due to network variability; do not
  relabel it as fully accepted. Its source runtime was locally validated.

## Changes And Boundaries

- `src/App.tsx` loads the desktop shell/dashboard/quick-add lazily, skips the
  Tauri-only shortcut import in browsers, and mounts `PWAUpdateProvider` outside
  workspace Suspense. Core initialization and cloud-sync behavior are unchanged.
- `src/components/pwa-update-prompt.tsx` moves the existing registration/poll
  lifecycle into the root provider, explicitly requests immediate registration,
  and shares update state with the existing prompt. Prompt placement, dismissal,
  update lock, failure UI and data safety remain covered by unit tests.
- `src/components/memory-workspace.tsx` lazily loads reader, rich Markdown/math,
  stats, review-plan editor, WeRead, advanced settings and compatibility import.
  The shell and sheets retain their close controls while content is loading.
- `src/fonts.css` selects the existing packaged normal variable Latin/Latin-ext
  WOFF2 faces for Inter, Plus Jakarta Sans and JetBrains Mono. Existing English,
  Indonesian and Chinese UI remains readable. Other scripts use system fallback;
  this is not removal or rewriting of card text. Font weights/names/ranges come
  from the installed font package CSS; no package upgrade was needed.
- `vite.config.ts` stops precaching redundant WOFF copies. All generated JS/CSS,
  interface WOFF2 and KaTeX WOFF2 remain precached, including unopened lazy pages.
- Acceptance navigation uses `domcontentloaded`, followed by separate visible-app,
  activated-controller and required-cache phases with sanitized failure diagnostics.
  Local-only held-workspace regression proves registration precedes workspace
  completion. Offline checks now enter previously unopened reader/settings/import/
  stats and verify an actually loaded KaTeX Math face.
- No timeout or retry was increased in this task. Public tests retain the prior
  300-second per-test budget and retries remain zero. Chromium's observed
  `net::ERR_TIMED_OUT` is a browser network failure, not proof of a configurable,
  universal 30-second application or Cloudflare deployment limit.
- Private card batches, backups, internal handoffs, production secrets and unrelated
  parent-workspace files are excluded. No real authenticated production mutations,
  paid model probes, automation restart or infrastructure changes were performed.

## Build Measurements

Both builds use the same installed dependencies, Vite production mode and manifest.
The baseline is a `git archive` of `34052b9` under
`/tmp/recall-startup-baseline-2212`, with a dependency symlink, not a worktree reset.
`node /tmp/recall-startup-metrics.mjs` traverses static imports of the entry and
home workspace without double counting. Numbers are artifact sizes, not a claim
of a guaranteed public loading time or transferred HTTP compression ratio.

| Metric | Baseline | Optimized |
|---|---:|---:|
| First-home static JS files | 39 | 27 |
| First-home static JS bytes | 1,689,139 | 643,700 |
| Individually gzip-compressed first-home JS bytes | 520,442 | 207,246 |
| Unique precached URLs | 141 | 149 |
| Unique precached file bytes | 3,695,795 | 3,276,252 |
| Font URLs in precache | 54 | 25 |
| Lazy workspace imports | 0 | 7 |

First-home raw JS is approximately 61.9% smaller; gzip estimate is 60.2% smaller.
Total unique precache bytes are 11.4% smaller. Splitting increases total cache
URL count, so this is not a claim that every installation makes fewer requests.
Vite reports 145/153 manifest entries because repeated included icons are present;
the table deduplicates URLs. The large RichCard chunk remains, but is deferred
from home and retained for offline functionality.

## Local Validation

Environment: macOS arm64, Node 22.22.0, installed dependencies; cached Chromium
and WebKit, iPhone 15 simulation 393 x 852 CSS pixels, DPR 3. Windows vault and
Graphify are unavailable on this Mac; SESSION_HANDOFF/source map fallback used.
No physical iPhone home-screen validation was performed.

Commands ran from Recall-next unless a different directory is specified:

- `node node_modules/vitest/vitest.mjs run src/components/__tests__/pwa-update-prompt.test.tsx`:
  15 passed, including immediate registration during a suspended workspace.
- `node node_modules/vitest/vitest.mjs run --coverage`: 68 files / 1140 tests passed.
  Coverage: statements 41.43%, branches 38.37%, functions 35.80%, lines 44.46%.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 131 existing warnings.
  Focused E2E lint and `git diff --check` also passed after the final math assertion.
- `node node_modules/typescript/bin/tsc -b --noEmit`: passed.
- `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json --noEmit`: passed.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts`:
  66 tests passed; no production DB access. No local D1 mutation suite required
  for unchanged backend/schema code.
- `node node_modules/vite/bin/vite.js build --mode production --manifest`: passed;
  RichCard's existing large-chunk warning remains. Final deployment build omits
  the diagnostic manifest and is recorded below.
- Baseline measurement initially used unsupported Vite `--root`; recovered by
  running the same build command in the isolated baseline directory. Initial
  optimized build failed because these variable font packages do not export
  `latin.css`; recovered with explicit packaged WOFF2 faces in `src/fonts.css`.
  No failed or partially generated bundle was released.
- With cached `RECALL_CHROMIUM` and `RECALL_WEBKIT` executable paths:
  `node node_modules/@playwright/test/cli.js test --grep 'Service Worker注册|PWA部署路径|表单焦点|iPhone15首页' --workers=2 --output=/tmp/recall-startup-focused`:
  8 passed.
- Same browser paths:
  `node node_modules/@playwright/test/cli.js test --workers=2 --output=/tmp/recall-startup-mobile`:
  all 44 passed. WebKit home screenshot inspected; shared shell retained.
- After extending offline math assertions:
  `node node_modules/@playwright/test/cli.js test --grep 'PWA部署路径' --workers=2 --output=/tmp/recall-startup-offline-math`:
  2 passed. WebKit's isolated static server is stopped, Chromium uses offline
  mode; unvisited routes and Math WOFF2 load without a server.
- Same browser paths:
  `node node_modules/@playwright/test/cli.js test --config e2e/weread-online.config.ts`:
  16 passed with local synthetic APIs, not real books or paid AI calls.

## Cross-Version Update Diagnostic

`node /tmp/recall-startup-update.mjs` serves the archived baseline then optimized
build on the same loopback origin in a fresh context. It changes only synthetic
local `dailyGoal` to 17 and checks exact snapshot equality after accepting the
real Workbox update prompt. No mock registration or storage deletion is used.

- Chromium: automatic old-to-new update, activated controller, exact snapshot
  preservation and zero runtime errors passed.
- WebKit: automatic reload displays the new entry and completes cache cleanup
  to 149 entries, but reports controller/active state `activating` beyond the
  30-second bound. Both RAF waiting and explicit state polling failed. These
  checks are not counted as passing automatic update acceptance.
- Control:
  `RECALL_UPDATE_BROWSER=webkit RECALL_UPDATE_MODE=baseline-marker node /tmp/recall-startup-update.mjs`
  reproduces the same stuck state with unchanged baseline app and only a harmless
  SW revision marker, with 141 cache entries. This is not newly introduced by
  the optimization; its browser/engine root cause is not proven.
- Recovery:
  `RECALL_UPDATE_BROWSER=webkit RECALL_UPDATE_RECOVERY=reload node /tmp/recall-startup-update.mjs`
  performs one ordinary page reload, without clearing storage/cache. Controller
  and active worker become `activated`; exact old-to-new snapshot equality,
  dailyGoal 17 and zero runtime errors pass.
- This existing simulated automatic-update state limitation is recorded, not
  hidden by a longer timeout or new app reload loop. Local startup, cache/offline
  and compatible update recovery are validated. Physical Safari-installed PWA
  automatic update remains unverified and must not be claimed accepted.

## Publication And Recovery

Commit/push/deployment/live outcomes are appended here after delivery. No release
is attempted before the applicable local gates above and scope/privacy review.

Compatible asset rollback target:
`d606405a-f52d-42de-90bc-6ca5b961cfcf`. Recheck current production first so a rollback
does not replace a newer unrelated release. In Cloudflare Dashboard, open Pages
`recall-memory` > Deployments, select that deployment and choose Rollback. Verify
the stable production origin, expected asset hashes, SW/mobile behavior and
anonymous API rejection, then append incident timestamps/outcome to this record.
This task does not change D1/API/storage schema, so no database rollback is
needed or authorized. Do not clear phone storage, delete caches, reset D1,
rewrite Git history or force-push to recover.
