# Archived Folder Catalog And Whole-Folder Restore

## Scope And Baseline

- Request continued at 2026-11-01T22:01:09+08:00. Release ID:
  `20261101T220109+0800-archive-catalog-restore`.
- Base: `4532c11f169d3b31788f52a9648ecfe05e97c770`, verified against remote main.
  The detached task worktree fast-forwarded from `1c64e51` while retaining
  the six existing, task-related archive drafts without conflicts.
- Worktree: `/Users/bytedance/.codex/worktrees/93ce/Recall-next`.
- Frozen build: `1.0-20261101-2205`. Existing source host:
  `xuda645-eng/Recall`; existing production origin:
  `https://recall-memory.pages.dev/`.
- Status: implementation, applicable local gates, normal source push and
  production deployment completed. Owner reported normal online behavior on
  retest; automated public checks are partial with the failures below retained.
  Physical installed-PWA acceptance remains unverified.
- Authenticated preflight confirmed account `751b9fca4f5173fd70e0dfb69cff81e2`,
  the existing `recall-memory` project and previous Production/main deployment
  `23bfd544-c0cc-4ed3-82a4-1ec38cad5af9`, source `d52d1bf`, version `2125`.
  No new resource, plan, binding, DNS or origin is introduced.
- Windows Obsidian Home/Project Map and Graphify are absent on this Mac.
  The disclosed architecture-table fallback routed inspection to the archive,
  folder rows, workspace, serial persistence queue and their focused tests.
  No Graphify update is possible here.

## Changes

- Fully archived card subtrees disappear from the home shortcuts and normal
  folder directory instead of remaining as zero-card rows. This is derived
  from existing card archive state, so previously archived groups work too.
  Independent empty folders and partially active folders remain available.
- Empty descendants within a fully archived subtree stay with its archive
  hierarchy and return when the subtree is restored. No deck is deleted,
  reparented or assigned a new identifier.
- The archive defaults to hierarchical group rows plus separately archived
  cards. Cards already represented by a group are not duplicated at the root.
  Open a group to browse children and local cards, or choose cards-only to
  expand the current archived scope. Search includes paths and descendants.
- The existing filter sheet is available in the archive: all/folders/cards,
  new/due/familiar review state, newest/oldest archive time, name and recent
  modification. Group archive time uses the latest descendant archive time.
  State filtering uses preserved schedules/progress for inspection only;
  archived cards stay out of learning/review queues.
- Group rows and the open-group view offer whole-subtree restoration
  with explicit scope/count confirmation and cancellation. The existing
  serial persistence queue saves one snapshot. Restoration only removes
  `archivedAt` from archived cards inside the selected subtree, including
  earlier archives, without changing content, schedules, review history,
  stable identities, credentials or settings. Other groups remain untouched.
- Review found and fixed empty-child search propagation and unusable zero-card
  restore actions. Empty descendants are searchable through their containing
  group and explicitly return with that group. Deep navigation returns to the
  immediate archived parent; the all-archives shortcut remains available.
- Existing three-second archive undo stays operation-scoped. Whole-group
  restore is available after that window; per-card restore is retained.
- No schema migration, cloud API/binding change, new resource, paid service,
  secret publication, production-library mutation test or origin change.

## Validation And Recovery

All browser checks use guarded `scripts/run-playwright.mjs`, cached Chromium
and WebKit, the 393 x 852 CSS-pixel/DPR 3 iPhone 15 baseline and isolated
synthetic data. They do not prove physical iPhone installed-PWA acceptance.

- Focused archive/persistence: 33 tests passed. Includes existing archive
  migration, empty descendants, subtree-only restoration, retained progress,
  one persistence write and save failure/retry without partial state changes.
- Focused TypeScript and affected-file ESLint passed with no errors.
- Full unit/coverage: 83 files / 1438 tests passed.
- Final full ESLint: 0 errors / 132 existing warnings. Both `tsc -b --noEmit`
  and `tsc -b` passed. Frozen root-path production build passed, retaining
  the existing large-chunk warning. Manifest/icons/SW contract and all 202
  bundle files were inventoried for exact committed-bundle verification.
- Focused Chromium/WebKit acceptance: 16 passed, including confirmation,
  cancel/focus, prior archives, hierarchy/search/content/state/time filters,
  whole/per-card restore, 3-second undo and refresh persistence.
- Insets and secondary viewports include 59px top/34px bottom, 320px width,
  760/761px breakpoint, 852 x 393 landscape and control reachability.
  WebKit synthetic archive/restored-directory screenshots were visually
  inspected. The existing design language is unchanged.
- `pnpm test -- src/lib/memory-archive.test.ts src/services/__tests__/memory-actions.test.ts`
  and the corresponding `pnpm test:e2e` command failed before tests with
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`: the bundled pnpm attempted
  dependency reinstallation after task-local dependencies were copied.
  Recovery used the already-installed package CLI entry points directly.
  No dependency deletion, lockfile update or runtime configuration change.
- Initial guarded browser command rejected `RECALL_BROWSER_SANDBOX` before
  any browser launch. The exact command reran outside Seatbelt with approval;
  startup preflight and both engines passed. No guard/security change.
- Initial `git fetch origin`/fast-forward hit shared Git metadata EPERM.
  Escalated retry fast-forwarded cleanly and preserved every draft.
- Initial Wrangler read-only preflight hit npm cache EPERM. The exact command
  reran with escalation and confirmed the recorded account/project/deployment.
- The first broad mobile run passed all 100 checks before the final review
  refinements. The final version reran all 100: 99 passed, 1 WebKit assertion
  failed because a 48px placeholder measured `47.999969482421875` during
  navigation. No functional action failed. An unchanged targeted retry in
  both Chromium and WebKit passed (2/2); no assertion or geometry was relaxed.
  The complete final batch is recorded as failed/recovered, not a clean pass.
  Final unit/coverage and lint/type checks were rerun after all product edits.
- Final independent source/test-code review found no remaining concrete issues
  after the empty-child findings were fixed. It was read-only, not additional
  execution or physical-device evidence. Documentation/diff checks passed:
  46 local links, no new private key/token values or disallowed prose dashes.
- The pnpm-created 8KB `.pnpm-store` was moved intact to a task-owned temporary
  directory. Copied dependencies, cache, test artifacts and screenshots are
  not source/publication content.

```sh
node node_modules/vitest/vitest.mjs run src/lib/memory-archive.test.ts src/services/__tests__/memory-actions.test.ts
node node_modules/vitest/vitest.mjs run --coverage
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/typescript/bin/tsc -b
RECALL_BUILD_VERSION=1.0-20261101-2205 RECALL_STUDY_PORT=4436 node scripts/run-playwright.mjs --config e2e/memory-study.config.ts --grep '整组归档|归档目录|归档复用|归档复习状态|归档卡组' --workers=2
RECALL_BUILD_VERSION=1.0-20261101-2205 RECALL_STUDY_PORT=4436 node scripts/run-playwright.mjs --config e2e/memory-study.config.ts --workers=2
RECALL_BUILD_VERSION=1.0-20261101-2205 RECALL_STUDY_PORT=4446 node scripts/run-playwright.mjs --config e2e/memory-study.config.ts --grep '统计归档导入无无关顶部操作' --workers=2
RECALL_BUILD_VERSION=1.0-20261101-2205 node node_modules/vite/bin/vite.js build --mode production
node /private/tmp/recall-archive-artifacts.mjs --record
```

Browser commands also set `RECALL_CHROMIUM` and `RECALL_WEBKIT` to the cached
1223/2272 binaries. Logs are under `/private/tmp/recall-archive-*` and remain
private/local, as do synthetic screenshots and bundle verification inventory.

## Publication And Rollback

Implementation commit: `59f70c508df32d93c557ca483d057020f9561190`, created
2026-11-01T22:23:51+08:00. Normal `git push origin HEAD:main` completed at
22:23:56+08:00 (`4532c11..59f70c5`); remote main was verified at that SHA.
Only the nine reviewed task files were committed. The task worktree was clean.

The committed source rebuilt with the same frozen version; every one of the
202 files matched the validated bundle inventory. Immediately before upload,
authenticated production was still the verified previous deployment.

```sh
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main --commit-hash 59f70c508df32d93c557ca483d057020f9561190
```

Deployment completed at 2026-11-01T22:25:44+08:00 as
`dd286cc8-ab18-4ec5-92e5-e31dd9b3c92d`. Authenticated Pages listing verified
Production/main/source `59f70c5`. Deployment URL:
<https://dd286cc8.recall-memory.pages.dev/>. Stable origin:
<https://recall-memory.pages.dev/>, live metadata `1.0-20261101-2205`.
Existing Functions compiled/uploaded unchanged; no database operation.
No force push, dirty deployment, new infrastructure or credential change.

Public checks used fresh anonymous contexts and synthetic local data only.
Results and recovery are recorded below. The documentation-only follow-up
publishes this evidence and owner feedback without redeploying the app.

### Public Checks And Recovery

```sh
RECALL_BUILD_VERSION=1.0-20261101-2205 RECALL_URL=https://recall-memory.pages.dev/ node scripts/run-playwright.mjs --grep '归档目录兼容|归档复用内容|归档复习状态|PWA部署路径' --workers=2 --max-failures=1
node /private/tmp/recall-archive-artifacts.mjs --public
RECALL_BUILD_VERSION=1.0-20261101-2205 RECALL_URL=https://recall-memory.pages.dev/ node scripts/run-playwright.mjs --grep '归档复用内容|归档复习状态|PWA部署路径|版本刷新检查后' --workers=1 --max-failures=1
```

- Initial public browser batch: 3 passed, 1 failed, 1 interrupted, 3 not run,
  plus a runner-level error reported after the failure cap. Both Chromium and
  WebKit passed hierarchy/search/empty-folder handling/whole-group restore,
  cancellation, progress preservation and restored-data reload persistence.
  WebKit also passed content/time sorting and default group de-duplication.
- Chromium's next sorting case failed at `Readiness: visible-app` before any
  feature action, after the 30-second visible-app gate. The concurrently
  starting WebKit status case was interrupted when the failure cap stopped
  the batch. This batch is not a complete public pass.
- Initial public resource probe failed at
  `/assets/i18n-ncnN4eWC.js` with curl 28/TLS connection timeouts, after earlier
  transfer timeouts and internal retries. The exact probe reran outside the
  sandbox with approval. Public version was separately verified as `2205`.
- Single-worker browser recovery retained all readiness/SW/cache gates: 1
  passed, 1 failed, 6 not run, plus the runner-level failure-cap error.
  Chromium passed version refresh/reload, offline update failure messaging and
  retained data. The next sorting case timed out after 300 seconds at
  `Readiness: sw-control`, before its feature actions. No check was bypassed.
- The escalated resource retry failed at `/assets/index-CofeoYrL.js` with curl
  28/partial transfer timeouts. Neither aggregate curl probe passed.
- A guarded, 240-second-bounded single-context WebKit helper
  (`node /private/tmp/recall-archive-public-cached.mjs`) verified all 21 sampled
  resource hashes, root manifest/icons, public version `2205` with no-store,
  active SW control and anonymous `/api/sync` and `/api/devices` 401 gates.
  Its later reload failed with `WebKit encountered an internal error`.
  The helper did not log which reload phase failed, so this run is not evidence
  of a completed public state-filter/offline scenario. Full automated public
  acceptance remains incomplete; successful resource checks are not discarded.
- These results do not establish a new functional regression or prove a
  network-only cause. No owner data, D1 mutation, storage reset or rollback
  was performed during these anonymous/synthetic checks.

### Owner Retest And Documentation Follow-Up

Recorded at 2026-11-01T22:59:35+08:00: the owner confirmed that the online
version now behaves normally and requested commit/push. An earlier apparent
missing restored group was visibly present under its original parent during
read-only UI inspection, with its seven cards counted in that parent's total.
The current-page footer also confirmed build `2205`. No real-library archive,
restore, move, import or storage operation was performed by the agent.

The owner asked to hold further changes while retesting. The proposed extra
post-restore navigation/highlight change was not implemented. No additional
application code or deployment is included in this follow-up; shipped source
remains `59f70c508df32d93c557ca483d057020f9561190`. Private group names and
screenshots are excluded from public documentation. The owner's statement is
reported online acceptance, not a claim of physical iPhone/Safari-install,
offline cold start or exhaustive PWA acceptance.

Final checks passed: 39 local documentation links and `git diff --check`;
verified only these two release-document files changed and no application
files are pending. The normal follow-up push is represented by this
documentation-only commit. No app tests or app deployment are required for
these evidence-only edits.

Rollback target is `23bfd544-c0cc-4ed3-82a4-1ec38cad5af9`, compatible with the
unchanged card archive field and schema. Use that previous deployment only after
checking that a newer release is not being overwritten. It only rolls back
assets: it cannot undo device data, cloud state or SW caches. Do not reset D1,
clear phone storage, rewrite Git history or change credentials.
