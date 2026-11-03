# Remove The Public WeRead Demo Entry

## Identity And Scope

- Release: `20261103T100802+0800-remove-weread-demo-entry`.
- Started: `2026-11-03T10:08:02+08:00`, Asia/Shanghai.
- Status: published and publicly verified. Publication evidence was appended
  during the next WeRead task after the user confirmed unrelated Skill changes
  should be ignored. No separate repeat deployment of this release is needed.
- Repository: `xuda645-eng/Recall`, branch `main`. Starting HEAD and remote
  main: `3725e29ac30a92e8f1a44dcb6a5a818ac296c9e1`.
- Request: remove the public synthetic merge example button from the WeRead
  connection page. No private document conversion or library import is part of
  this release.

## Changes And Safety

- Removed the example button, click handler and unused imports from
  `src/components/memory-weread-online-import.tsx`. The connection page retains
  real WeRead connection and other import methods. Normal individual generation
  and intelligent merge remain unchanged.
- Tests seed synthetic merge drafts directly into their isolated IndexedDB;
  there is no new production test hook. The existing draft format and recovery
  remain compatible, including drafts previously created through the demo.
- Added absence and retained-controls checks to mobile and public tests.
  Existing tests still cover multi-tab cancellation safety and synthetic preview
  splitting without AI calls or implicit card writes.
- Updated `docs/WEREAD_IMPORT.md`. No CSS, API, database schema, migrations,
  credentials, infrastructure, user-card or storage-clearing changes.
- Runtime source diff against previous deployed source `9cef3f0` is confined
  to this component. Private card batches remain ignored/local.
- Bootstrap: the Windows Obsidian vault is unavailable on this Mac and
  `graphify` is absent. Used the session handoff/map and targeted source reads.

## Validation

- Focused: `node node_modules/vitest/vitest.mjs run
  src/lib/weread-merge-session.test.ts`: 6/6 passed at
  `2026-11-03T10:10:25+08:00`.
- Types: `node node_modules/typescript/bin/tsc -b --noEmit`: passed.
- Focused lint: `node node_modules/eslint/bin/eslint.js
  src/components/memory-weread-online-import.tsx e2e/weread-merge.spec.ts`:
  zero errors, one existing hook-cleanup warning.
- Full units: `node node_modules/vitest/vitest.mjs run`: 90 files / 1558 tests
  passed, 22.08 seconds, started `2026-11-03T10:11:24+08:00`.
- Full lint: `node node_modules/eslint/bin/eslint.js .`: zero errors / 132
  existing warnings. Logs: `/private/tmp/recall-remove-merge-demo-{unit,lint}.log`.
- Production build: `RECALL_BUILD_VERSION=1.0-20261103-1015 node
  node_modules/vite/bin/vite.js build --mode production --outDir
  /private/tmp/recall-remove-merge-demo-20261103/dist`: passed, 161 precache
  entries / 3341.58 KiB. Existing large-chunk warning retained. Neither the demo
  button text nor synthetic demo book ID occurs in the shipped assets.
- Mobile merge command: `RECALL_BUILD_VERSION=1.0-20261103-1030
  RECALL_MERGE_OUTPUT=/private/tmp/recall-remove-merge-demo-20261103/merge
  node scripts/run-playwright.mjs --config e2e/weread-merge.config.ts
  --workers=2`: 18/18 passed, 45.3 seconds. This initial focused bundle uses a
  synthetic test version; it is not the deployment bundle.
- Browser runs use the protected launcher outside the macOS sandbox with
  Chromium-1223 and WebKit-2272. Baseline: 393 x 852 CSS pixels / DPR 3.
  Landing assertions include 59px top / 34px bottom safe-area stress, widths
  320/760/761 and landscape; retained controls are at least 44 x 44 pixels with
  no page horizontal overflow. Reviewed the local WebKit landing screenshot.
- Core production-bundle PWA checks: 72 passed / 10 intentionally skipped in
  the first run, 1.8 minutes. Run from the isolated temporary
  directory with `RECALL_URL=http://127.0.0.1:4236/ node
  /Users/bytedance/Documents/CodexProject/Recall/Recall-next/scripts/run-playwright.mjs
  --config /Users/bytedance/Documents/CodexProject/Recall/Recall-next/playwright.config.ts
  --workers=2 --output=/private/tmp/recall-remove-merge-demo-20261103/pwa-results`.
  The isolated working directory ensures worker/offline fixtures use this
  production bundle without rebuilding a served main-directory `dist/`.
- `RECALL_URL` causes five pairs of local-only tests to skip, even with a local
  URL. Supplemental run without that variable used the protected temporary
  `pwa-local.config.mts`, inheriting the shipped config and overriding only its
  base URL, server and absolute file paths. Command: `node
  /Users/bytedance/Documents/CodexProject/Recall/Recall-next/scripts/run-playwright.mjs
  --config /private/tmp/recall-remove-merge-demo-20261103/pwa-local.config.mts
  --grep '正式应用仅iPhone|iPhone系统安全框|原安装显示诊断往返|原安装静态诊断离线|原安装方案保持'
  --workers=2 --output=/private/tmp/recall-remove-merge-demo-20261103/pwa-local-results`:
  10/10 passed, 24.5 seconds. All 82 distinct core cases passed across the two
  runs, not in one aggregate run. Coverage includes import/update, reading,
  rating/undo, editing, drawer, old-to-new worker activation, refresh persistence,
  manifest/icons, offline and installed-identity simulation.
- First supplemental attempt used `pwa-local.config.ts` and failed before test
  execution: `SyntaxError: The requested module './browser-runtime.mjs' does not
  provide an export named 'verifyBrowserRuntime'`. Switching the temporary config
  to explicit ESM `.mts` and repeating the same checks recovered successfully;
  no browser guard or test assertion was weakened. Logs:
  `/private/tmp/recall-remove-merge-demo-pwa{,-local,-local-recovered}.log`.
- `git diff --check`: passed. All 50 local links in the three changed Markdown
  files resolve. The two changed E2E specs have zero lint errors/warnings.
- Captured 310 tracked production inputs and 203 bundle-file hashes in private
  local `bundle-integrity.json`. Before deployment, compare every input against
  the committed Git blob and every package file against this immutable manifest.
  Package inventory and source-check results will be appended after commit.
- Cloud/D1 mutation checks are not applicable: no server or schema changes.
  No test sends real highlights or mutates the owner's production library.
- Physical iPhone Safari home-screen installation, native keyboard and physical
  offline/update acceptance remain unverified. Browser simulation is not
  physical-device acceptance.

## Hosting And Recovery

- Read-only commands `npx --yes wrangler@4.156.0 whoami`,
  `pages project list` and `pages deployment list --project-name recall-memory
  --json` verified the existing account
  `751b9fca4f5173fd70e0dfb69cff81e2`, project `recall-memory` and main production.
- Previous production: `fe6e0d5d-80a8-49b3-8e76-b8ea695ca77c`, source `9cef3f0`,
  deployment URL `https://fe6e0d5d.recall-memory.pages.dev`.
  Previous evidence is in
  [the confirmation-flow record](./20261102T134923+0800-weread-confirm-flow.md).
  Its recorded Chromium manual-reader hit-test limitation is historical, not
  claimed resolved by this task. No unrelated manual-reader changes are made.
- Production origin remains `https://recall-memory.pages.dev/`. No plan,
  binding, D1, secret or domain changes are authorized by this task.
- Compatible asset rollback target is the previous deployment above. Recheck
  production first; if still this release, restore the recorded deployment via
  the existing Pages dashboard rollback action, then verify public assets,
  connection controls, worker/update behavior and local-data persistence.
  Do not clear local storage, restore databases, reverse migrations or rewrite
  shared Git history. Asset rollback restores the old example entry but does
  not roll back user data. Prior physical-iPhone acceptance is not assumed.

## Publication

- App source: `460aa03c2d4fa29001b01de3035be110c9941f05`. Normal HTTPS push
  advanced main from `3725e29` to `460aa03`, confirmed at
  `2026-11-03T10:16:58+08:00`. Worktree was clean and all 310 committed input
  hashes / 203 package-file hashes matched before publication.
- Command: `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes
  wrangler@4.156.0 pages deploy /private/tmp/recall-remove-merge-demo-20261103/dist
  --project-name recall-memory --branch main
  --commit-hash 460aa03c2d4fa29001b01de3035be110c9941f05
  --commit-message 'fix: remove public WeRead merge demo entry'`.
  No dirty flag. Uploaded 27 files, reused 174, compiled the unchanged Worker
  and uploaded headers/Functions/routes. Completed
  `2026-11-03T10:18:01+08:00`.
- Deployment: `1abcd1e9-9798-44ea-b400-a8764e60d3dd`, Production/main/source
  `460aa03`, URL `https://1abcd1e9.recall-memory.pages.dev`.
  Stable version `1.0-20261103-1015` verified HTTP 200 / `Cache-Control: no-store`.
- `RECALL_VERIFY_DIST=/private/tmp/recall-remove-merge-demo-20261103/dist node
  scripts/run-playwright.mjs --config e2e/weread-public.config.ts --workers=1
  --output=/private/tmp/recall-remove-merge-demo-20261103/public-results`:
  3/3 passed, 12.7 seconds. Live entry is absent; retained connection controls,
  synthetic selection/generation and 11 resource hashes / five anonymous API
  401/no-store gates passed.
- `RECALL_MERGE_URL=https://recall-memory.pages.dev/
  RECALL_MERGE_OUTPUT=/private/tmp/recall-remove-merge-demo-20261103/public-merge
  node scripts/run-playwright.mjs --config e2e/weread-merge.config.ts
  --workers=2 --timeout=120000`: 18/18 passed, 1.0 minute.
- Public PWA command from the isolated bundle directory: `RECALL_URL=https://recall-memory.pages.dev/
  node /Users/bytedance/Documents/CodexProject/Recall/Recall-next/scripts/run-playwright.mjs
  --config /Users/bytedance/Documents/CodexProject/Recall/Recall-next/playwright.config.ts
  --grep '抽屉显示固定构建版本|版本刷新检查后|PWA部署路径'
  --workers=2 --output=/private/tmp/recall-remove-merge-demo-20261103/public-pwa-results`:
  6/6 passed, 1.4 minutes. Five cases use the public origin; WebKit's offline
  case is the shipped isolated-local fallback, not public WebKit offline proof.
  Total across suites: 26 public-origin cases plus one local fallback.
- Supplemental read-only probe checked 14 entry/preload/Workbox hashes and
  anonymous same-origin merge POST `{}` returned 401/no-store. Across this probe
  and the public resource test, 25 distinct resource hashes and six anonymous
  gates passed. Local evidence: `public-extra.json` in the isolated task folder.
  The probe itself passed; an ancillary tail command ran before the PWA log
  existed and returned exit 1. Later log/evidence checks passed; this was not a
  failed resource/auth check and no security assertion was changed.
- Public test chain completed `2026-11-03T10:21:18+08:00`; no rollback occurred.
  Physical iPhone acceptance remains unverified. The subsequently reported
  completed-session routing bug is handled by the next release, not retroactively
  claimed resolved by this button-only release.
- Evidence follow-up is included with the next task's reviewed changes after
  the user allowed continuation. Its Git locator is the commit updating this
  section; this does not cause a second deployment of the unchanged old app.
