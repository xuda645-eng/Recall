# Interaction Recovery And Immediate Media Preview

Record checkpoint: 2026-11-06T00:35:00+08:00 (Asia/Shanghai).
Audit started: 2026-11-05T23:55:20+08:00. Local validation completed at
2026-11-06T00:42:54+08:00. Status: validated with retained recovery evidence;
awaiting commit, push and deployment.

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
  public verification is pending.
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
  `prototypes/style-lab/` is excluded. Implementation SHA, commit/push timestamps
  and results will be appended after successful validation/publication.
- Read-only Wrangler preflight verified account
  `751b9fca4f5173fd70e0dfb69cff81e2`, existing `recall-memory` project and
  previous production `083c047d-cf0c-485e-8dee-e11c5119525d`, source
  `fae5cdc8bc9cfe14a927d13bb93da03ec5e7fe8a`, V1.1-20261105-2307.
  First sandboxed invocation hit npm cache EPERM; the same read-only operations
  succeeded after tool-approved escalation. No cache ownership changes.
- Stable origin remains https://recall-memory.pages.dev/. No new resources,
  migrations, credentials, plan upgrades, DNS changes or production test data.
- Deployment ID/immutable URL, source push result and public outcomes are pending.

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

Pending. Production is unchanged at this checkpoint; no rollback performed.
