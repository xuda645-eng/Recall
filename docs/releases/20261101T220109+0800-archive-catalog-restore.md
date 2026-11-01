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
- Status: implementation and applicable local gates complete; publication
  pending. Source commit, push and deployment outcomes are appended after
  publication. Physical installed-PWA acceptance remains unverified.
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

Local gates completed with the recovered measurement failure above. Recheck
authenticated production/main immediately before
publishing, preserve remote history and deploy only the clean committed bundle.
Record its full source SHA, normal push result, deployment ID and stable URL.
Verify public file hashes, anonymous API gates, SW/offline behavior and relevant
archive flows using fresh anonymous contexts with synthetic local data only.

Rollback target is `23bfd544-c0cc-4ed3-82a4-1ec38cad5af9`, compatible with the
unchanged card archive field and schema. Use that previous deployment only after
checking that a newer release is not being overwritten. It only rolls back
assets: it cannot undo device data, cloud state or SW caches. Do not reset D1,
clear phone storage, rewrite Git history or change credentials.
