# Interaction Recovery And Immediate Media Preview

Record checkpoint: 2026-11-06T00:35:00+08:00 (Asia/Shanghai).
Audit started: 2026-11-05T23:55:20+08:00. Local validation completed at
2026-11-06T00:42:54+08:00. Status: published V1.1-20261106-0036; public
app/cache/hash verification completed at 2026-11-06T00:59:18+08:00 with retained
network recovery history and explicit extended-live/physical-phone limits.

## Scope

The user requested fixes for the five remaining interaction findings, excluding
the illustrated-backup package-limit work. No per-folder backup was restored.

- Unsaved card, folder and move inputs persist in a whitelisted local draft.
  Reload restores valid editing; browser navigation retains an explicit recovery
  panel. Saving or confirmed discard clears the draft. Quota/storage failures
  show a warning without deleting the previous saved library.
- Draft content is not uploaded or committed automatically. A changed editable
  base requires overwrite confirmation and is revalidated during the commit.
  Scheduling fields remain intact. Deleted targets are not silently resurrected;
  a deleted-card draft can explicitly become a new card with a new identity.
- Folder context, search, filters, sorting, list scroll, reader queue/index,
  per-card answer/scroll, minimal scheduling undo and session references survive
  reload. Removed/archived cards and unverified undo references are filtered.
  Browser Back/Forward restores the relevant workspace entry.
- Restoring a reader never replays a rating. Free browsing requires explicitly
  enabling scoring again after remount. Undo refuses to overwrite a later review.
- Adding, replacing or removing a media reference refreshes the DOM-backed
  preview and draft immediately. Search matches deeply nested empty folder names
  while retaining the existing hierarchy.

New local keys: `recall.workspace.draft.v1` and `recall.workspace.context.v1`.
Neither contains device credentials or joins cloud synchronization. Existing
snapshot, media storage, cloud schema/API, auth, bindings and origin are unchanged.

## Validation And Retained Failures

- Windows Obsidian vault and Graphify are unavailable on this Mac. The supplied
  architecture table and repository handoff routed targeted source inspection.
- Initial focused type/lint checks caught a nullable draft, render-time ref reads
  and an unused media variable. Corrected without unrelated cleanup.
- Initial quota tests tried mocking HappyDOM Storage directly; its Proxy did not
  exercise the failure. Replaced those mocks with a scoped global storage stub.
- First browser focus: 20/22 passed. Both engines exposed Back/Forward losing the
  selected index before lazy reader mounting. Reader entry now initializes its
  minimal resume state before mounting. The failed run is retained locally.
- First complete browser run: 178/184 passed, six update/reload failures across
  both engines. Context history updates produced spurious same-document
  navigation during persistence/beforeunload. Omitting the URL alone did not
  resolve this: a subsequent run passed 182/188 with the same six update failures.
  Lifecycle flushing now only writes local storage, never History API state.
  Normal in-app state updates omit the URL; actual route changes retain it.
  No readiness assertions were weakened to conceal this regression.
- Focused recovery: 26/26 passed in 58.4 seconds. Includes actual image
  replacement, folder draft, deleted-card recovery, storage failure, changed-base
  confirmation, reader/no-replay/undo, history and nested-empty-folder tests.
- Lifecycle/update focus: 6/6 passed in 24.1 seconds with the corrected lifecycle
  flushing, including the assertion that worker activation causes one reload.
- A complete-run startup attempt had a misspelled `chrome-mac-arm-arm64` path.
  The browser preflight rejected it before workers; zero tests passed. Corrected
  to the verified `chrome-mac-arm64` path and reran the same frozen build.
- Final full unit run: 106 files / 1716 tests passed in 53.21 seconds. Type check
  passed; full ESLint has 0 errors / 132 existing warnings.
- Root-path production build passed, with the existing large-chunk warning and
  165 precache entries / 3366.68 KiB. Frozen release artifact:
  `/private/tmp/recall-interaction-fixes-lifecycle/build`, V1.1-20261106-0036.
  Earlier failed builds were isolated; none was rebuilt while served.
- Final complete browser run: 187/188 passed in 5.2 minutes; the only failure was
  WebKit media's five-second wait for a controlling Service Worker. Unchanged
  two-engine single-worker recovery passed 2/2 in 13.1 seconds, including stopped
  server/offline image reopening and unchanged review data. All 188 distinct cases
  now passed across the complete run and recovery, not a clean 188/188 command.
  No app or test assertion changes were made for this recovery. Post-deployment
  public verification and its incomplete extended-live scope are recorded below.
  Chromium/WebKit use 393 x 852 CSS / DPR 3, synthetic local data and isolated
  browser contexts. Relevant suites include safe-area/narrow/760-breakpoint/
  landscape/desktop, drawer focus/motion, folders, imports, editing, long reading,
  ratings/undo, statistics, update and offline persistence.
- Cloud/D1 mutation tests are not required for unchanged cloud code. No tests
  mutate the production owner's library. Physical Safari home-screen installation,
  keyboard/background eviction and actual phone update acceptance remain unverified.

Commands (existing installed dependencies, no dependency reinstall):

```sh
node node_modules/vitest/vitest.mjs run src/services/__tests__/memory-workspace-state.test.ts src/components/__tests__/memory-reader.test.tsx
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
RECALL_BUILD_VERSION=1.1-20261106-0040 node node_modules/vite/bin/vite.js build --mode production --outDir /private/tmp/recall-interaction-fixes-final/build
RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-final-focus RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-final/build RECALL_RECOVERY_PORT=4402 RECALL_RECOVERY_PREBUILT=1 node scripts/run-playwright.mjs --config e2e/interaction-recovery.config.ts --grep '交互恢复|版本刷新按钮|Service Worker 激活|系统框架' --workers=2
RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-final-full RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-final/build RECALL_RECOVERY_PORT=4403 RECALL_RECOVERY_PREBUILT=1 node scripts/run-playwright.mjs --config e2e/interaction-recovery.config.ts --workers=2
node node_modules/vite/bin/vite.js build --mode production --outDir /private/tmp/recall-interaction-fixes-lifecycle/build
RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-lifecycle-focus RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-lifecycle/build RECALL_RECOVERY_PORT=4404 RECALL_RECOVERY_PREBUILT=1 node scripts/run-playwright.mjs --config e2e/interaction-recovery.config.ts --grep '系统安全框首帧|版本刷新' --workers=2
RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-lifecycle-full-recovery RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-lifecycle/build RECALL_RECOVERY_PORT=4405 RECALL_RECOVERY_PREBUILT=1 node scripts/run-playwright.mjs --config e2e/interaction-recovery.config.ts --workers=2
RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-media-recovery RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-lifecycle/build RECALL_RECOVERY_PORT=4406 RECALL_RECOVERY_PREBUILT=1 node scripts/run-playwright.mjs --config e2e/interaction-recovery.config.ts --grep '来源图片缩略、放大拖动关闭不评分' --workers=1
```

The focused grep collected only the 26 recovery cases; update cases are covered
by the complete run, not miscounted as focused passes. Browser commands use
`RECALL_CHROMIUM` and `RECALL_WEBKIT` pointing to the installed test binaries and
run through the guarded launcher outside macOS Seatbelt. Full command output,
traces and screenshots remain private under `/private/tmp/recall-interaction-fixes-*`.

## Source And Hosting

- Repository: `xuda645-eng/Recall`, branch `main`; source base
  `c2b62a98dd61b60e44d482960dbdefb977e03157`. Unrelated untracked
  `prototypes/style-lab/` is excluded. Implementation SHA:
  `732577116e3693a66285fef159d6a8f175b4514b`.
- Read-only Wrangler preflight verified account
  `751b9fca4f5173fd70e0dfb69cff81e2`, existing `recall-memory` project and
  previous production `083c047d-cf0c-485e-8dee-e11c5119525d`, source
  `fae5cdc8bc9cfe14a927d13bb93da03ec5e7fe8a`, V1.1-20261105-2307.
  First sandboxed invocation hit npm cache EPERM; the same read-only operations
  succeeded after tool-approved escalation. No cache ownership changes.
- Stable origin remains https://recall-memory.pages.dev/. No new resources,
  migrations, credentials, plan upgrades, DNS changes or production test data.
- Production deployment ID: `95d991cd-58f3-45de-9fd7-62a477388022`.
  Immutable URL: https://95d991cd.recall-memory.pages.dev/.

## Compatible Recovery

Rollback target: existing production deployment
`083c047d-cf0c-485e-8dee-e11c5119525d`. Audit verified its 205 public asset
hashes against the frozen prior bundle. No schema/API or scheduling-format
changes are introduced here; the two new local cache keys are ignored by the
previous app. That older app lacks the new draft/navigation recovery controls.

If a regression is confirmed while this release is still active, recheck the
current production deployment first, restore the recorded prior deployment via
Cloudflare Pages rollback, then verify the public app/assets/SW and append the
incident. Do not replace someone else's newer deployment. Do not clear phone
storage, undo user ratings/imports, restore D1 snapshots or rewrite Git history.
Asset rollback does not undo user data or installed Service Worker caches.

## Publication Outcomes

- Implementation committed at 2026-11-06T00:43:53+08:00. Normal source push
  succeeded, `c2b62a98..73257711`, `HEAD -> main`; remote main matched the exact
  implementation SHA at the 2026-11-06T00:44:22+08:00 push checkpoint.
- A clean detached delivery worktree at
  `/private/tmp/recall-interaction-fixes-delivery` contains that exact commit,
  excluding the owner's untracked prototype. Four owning source-file SHA-256
  hashes matched the validated workspace. Copied the frozen verified bundle into
  ignored `dist` without rebuilding; delivery worktree remained clean.
- Deployment completed at 2026-11-06T00:45:14+08:00: 205 assets, 28 uploaded /
  177 reused; Functions, headers and routes compiled/uploaded successfully.
  No dirty-deployment flag was used. A subsequent read-only production list
  confirmed deployment `95d991cd-58f3-45de-9fd7-62a477388022` maps to source
  `7325771`. Displayed releaseVersion is `1.1-20261106-0036`; legacy metadata
  stays `1.0-20261106-0036` for update compatibility.
- Public app/cache/hash checks completed with the limits below. No rollback
  performed; no confirmed new application regression was identified. The evidence follow-up
  is documentation-only and does not rebuild or deploy the app; its Git locator
  is `git log -1 -- docs/releases/20261106T003500+0800-interaction-recovery.md`.

Publication command from the clean delivery worktree:

```sh
git push origin HEAD:main
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main --commit-hash 732577116e3693a66285fef159d6a8f175b4514b --commit-message 'fix: preserve workspace drafts and navigation context'
```

## Public Verification And Limits

- Stable-origin version returned HTTP 200 with `releaseVersion`
  `1.1-20261106-0036`. Read-only hosting confirmation at
  2026-11-06T00:45:52+08:00 matched the exact implementation/deployment pair.
- Both initial Node HTTPS asset-hash commands failed with AbortError/timeouts,
  including the tool-approved retry using current DNS A record 172.66.47.169.
  Neither is reported as a passing aggregate. A bounded curl HTTP/1.1 verifier
  checked the same static-file list and committed SHA-256 expectations:
  204/205 passed; only unchanged `assets/updater-C9fM6nR-.js` timed out after
  three reads. A same-file retry using verified A record 172.66.44.87 matched
  its expected digest. All 205 distinct public hashes are verified across the
  initial curl run and recovery, not a clean original script pass. Failed and
  recovered JSON reports remain separate and private.
- Initial eight-case public core run: four WebKit passes, one interrupted
  Chromium cache case and three not run. WebKit checked all 161 unique precache
  paths, activated controller, online refresh persistence, the actual version,
  current home/drawer geometry, twelve committed resource digests and five real
  anonymous 401/no-store API gates. Two WeRead cases use intercepted synthetic
  data; they are not real model, owner-library or authenticated-sync acceptance.
- A single-worker Chromium TCP/TLS recovery on A record 172.66.47.169 passed
  2/4; the cache and synthetic generation cases failed at initial page navigation
  with net::ERR_TIMED_OUT. The same assertions on the other verified A record,
  172.66.44.87, passed both cache/resource cases in 3.0 minutes. An uncached
  offline fetch failed as expected; the cached app reopened with identical
  synthetic data. The remaining synthetic-generation case then passed unchanged
  in 17.1 seconds. All eight distinct core cases passed across these runs, not a
  clean eight-case command. HTTPS origin and certificate validation were retained;
  only QUIC was disabled in isolated diagnostic browsers, not in the product.
- Expanded 26-case live recovery run: 9 passed, 7 failed, 2 interrupted and 8
  not run. Failures were initial navigation or app-readiness timeouts. It was
  stopped to avoid competing cold-start downloads while bounded focused recovery
  continued. A TCP single-worker expansion passed 2 cases, failed initial
  navigation on the third, interrupted the fourth and did not run 22. Its first
  temporary config attempt failed import.meta/module loading before any test;
  moving the config into ignored project-local quality tooling fixed module
  resolution without changing the app.
- Final focused WebKit recovery passed 4/4 in 3.9 minutes, including deep-empty
  search, new-card draft reload/save-once, malformed cache and quota warnings.
  Only the live diagnostic wait was raised to 120 seconds; interaction/data
  assertions, source and deployed bundle were unchanged. Together with earlier
  completed cases, 15 distinct live recovery cases passed. The extended live
  26-case matrix remains incomplete; local full coverage is separately established
  by the 188 distinct mobile cases. Unrun/interrupted cases are not counted as
  passes and transport timeouts are not concealed by changing product code.
- Public WebKit offline simulation and physical iPhone Safari home-screen launch,
  safe areas/keyboard/background eviction/update acceptance remain unverified.
  Public Chromium offline reopening and local stopped-server WebKit image reopening
  are separate evidence. No owner data was rated, imported, deleted or backed up.

Exact public entry points (the same browser variables as local validation):

```sh
node scripts/verify-pwa-assets.mjs /private/tmp/recall-interaction-fixes-lifecycle/build /private/tmp/recall-interaction-fixes-public-assets.json
RECALL_PRODUCTION_IPV4=172.66.47.169 node scripts/verify-pwa-assets.mjs /private/tmp/recall-interaction-fixes-lifecycle/build /private/tmp/recall-interaction-fixes-public-assets-recovery.json
node /private/tmp/recall-verify-public-curl.mjs
RECALL_VERIFY_DIST=/private/tmp/recall-interaction-fixes-lifecycle/build node scripts/run-playwright.mjs --config e2e/v11-public.config.ts --output /private/tmp/recall-interaction-fixes-public-core --workers=1
RECALL_URL=https://recall-memory.pages.dev/ RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-public-recovery RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-lifecycle/build node scripts/run-playwright.mjs --config e2e/interaction-recovery.config.ts --grep '交互恢复' --workers=2
RECALL_URL=https://recall-memory.pages.dev/ RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-public-tcp-recovery RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-lifecycle/build node scripts/run-playwright.mjs --config quality/interaction-recovery/public.config.ts --grep '交互恢复' --workers=1
RECALL_VERIFY_DIST=/private/tmp/recall-interaction-fixes-lifecycle/build node scripts/run-playwright.mjs --config quality/interaction-recovery/public-core.config.ts --workers=1
RECALL_VERIFY_DIST=/private/tmp/recall-interaction-fixes-lifecycle/build node scripts/run-playwright.mjs --config quality/interaction-recovery/public-core-dns44.config.ts --grep 'V1.1 公网缓存|公网已提交资源' --workers=1
RECALL_VERIFY_DIST=/private/tmp/recall-interaction-fixes-lifecycle/build node scripts/run-playwright.mjs --config quality/interaction-recovery/public-core-dns44.config.ts --grep '四并发合成' --workers=1 --output /private/tmp/recall-interaction-fixes-public-generation-recovery
RECALL_URL=https://recall-memory.pages.dev/ RECALL_RECOVERY_OUTPUT=/private/tmp/recall-interaction-fixes-public-webkit-focus RECALL_E2E_BUILD_DIR=/private/tmp/recall-interaction-fixes-lifecycle/build node scripts/run-playwright.mjs --config quality/interaction-recovery/public.config.ts --grep '深层空卡组|新卡草稿|损坏.*缓存|草稿存储失败' --project iphone15-webkit --workers=1
```

The curl recovery retained the original failing report and wrote
`/private/tmp/recall-interaction-fixes-public-curl/report-recovery.json` after
matching the one re-downloaded updater against the frozen bundle. All logs,
transport configs, local verification copies and synthetic screenshots stay local;
diagnostic fixtures and tooling are not uploaded. Production contains only the
validated application bundle. No second app deployment occurs for this evidence
update.
