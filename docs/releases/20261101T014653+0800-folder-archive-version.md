# Folder Archive And Visible PWA Build Version - Developer Preview

## Identity And Scope

- Release ID: `20261101T014653+0800-folder-archive-version`.
- Repository: `https://github.com/xuda645-eng/Recall`.
- Role: developer task, explicitly enabled by `$recall-parallel-delivery` for
  pre-integration preview on `2026-11-01`.
- Task branch: `codex/folder-archive-version-preview-20261101`.
- Worktree: `/Users/bytedance/.codex/worktrees/0c38/Recall-next`.
- Work started: `2026-11-01T01:46:53+08:00`.
- Version request inspected: `2026-11-01T01:56:47+08:00`.
- PWA build identity: `1.0-20261101-0200`, fixed before validation. Its suffix is
  the Shanghai build minute, not the current browser clock or deployment time.
- Status: awaiting integration, not published; final preview validation pending.
- Production origin: `https://recall-memory.pages.dev/`, unchanged.
- Implementation/handoff SHAs and preview completion time: append after commits.
- Main push, production deployment and public verification: not performed by
  this developer task. Prior delivery authorization is narrowed by the user's
  explicit Skill invocation. Shared release index is left to the integrator.
- Initial source: `d6eecb4d41c030a9fe8854ddb6be55e7f5462500`.
- Current validated base: `a9ce6d8fe1dd6897692156b81cd8966ab43bee5b`.
- Previous production: `0a8d051f-3349-4a20-afbf-c1d12deeaf9e`, source
  `b19818947471d0c078b7d72c9fd95e01e9839a13`, confirmed by authenticated Pages
  listing. Prior acceptance evidence is in the main-integration release record;
  it is not full physical-iPhone acceptance.

## Changes

- Existing-folder management adds a secondary `归档整个卡组` button and active
  card count. Confirmation explicitly includes every descendant folder and
  explains data preservation. Empty active subtrees disable the action.
- Archive/undo each persist one snapshot through the existing serial commit
  queue. Only previously active cards receive the archive timestamp. Folder
  structure, original archives, sibling folders, content, scheduling, settings,
  review logs and sessions are retained. Three-second undo restores only this
  operation's IDs, checks their archive timestamps and retains subsequent edits.
  After expiry, the existing archive library restores individual cards.
- Drawer footer displays the actual bundled PWA version and an understated
  icon-only refresh control with a 44 CSS-pixel minimum touch area. Beijing-time
  formatting handles midnight and rejects invalid release overrides. The desktop
  package remains `1.3.0`; no desktop release or tag is created.
- Vite embeds build metadata and emits `version.json`. `RECALL_BUILD_VERSION`
  freezes identity and metadata across validation and committed rebuilds. Public
  metadata is anonymous, `no-store` and excluded from offline precaching.
- Manual refresh checks current public metadata and Service Worker state, waits
  for installation/activation and then reloads. A shared provider guard prevents
  manual and Workbox callbacks from reloading twice. Errors/timeouts leave the
  current page and data usable, permit retry and never assert offline freshness.
  Saving disables the refresh control; users must save unsubmitted inputs first.
- No cloud API, D1 schema, migration, secret, authorization, production-card
  write, origin change, paid infrastructure or private-data publication.
- Local preview tooling serves the compiled app at a dedicated loopback origin,
  optionally seeds synthetic demo data only if that origin has no snapshot, and
  rejects all `/api` requests without proxying. Preview HTML injection does not
  edit the bundled production files. Existing demo edits survive reopening.

## Validation And Recovery

- Windows Obsidian paths and Graphify are missing on this Mac. Used the supplied
  architecture map and targeted source inspection. No graph update was possible.
- Initially reused installed dependencies via an ignored `node_modules` symlink.
  After explicit parallel-mode activation, preserved that task-created link in
  temporary storage and copied dependencies into this worktree for independent
  caches/output. No package installation, lockfile change or directory purge.
- Detected a main-worktree advance during archive validation and paused before
  publishing. On the follow-up request, inspected `d6eecb4..a9ce6d8`: only the
  explicit parallel-delivery Skill and documentation changed. Preserved those
  commits and fast-forwarded this worktree without invoking that Skill or agents.
  Sandbox `git merge --ff-only main` failed on protected `ORIG_HEAD.lock`; the
  same command succeeded with approved escalation.
- Initial archive units: 25 passed. Initial browser archive checks needed
  asynchronous persistence/readiness waits rather than immediate snapshots;
  repository normalization also adds default shortcuts on the first save. Kept
  exact card/history checks and assertions that existing settings are preserved.
- Initial browser command was blocked with `RECALL_BROWSER_SANDBOX` before
  launching any engine. Approved escalated guarded retries were used. No marker
  was unset and no OS security setting was weakened.
- Version focused units: 65 passed. A default-port browser attempt reused an
  unrelated preview at port 4193, so it was stopped (exit 130, not a pass).
  Switched to `e2e/memory-study.config.ts` with port 4396 and
  `reuseExistingServer: false`, leaving the other task's server untouched.
- Isolated checks found the Workbox activation/reload race. Fixed the
  implementation and guarded manual/Workbox reload callbacks. Corrected the
  test's navigation counter to count document requests, not same-document
  `history.replaceState` events. Retained an actual synthetic Worker activation
  test requiring exactly one reload. Drawer resizing checks
  wait for existing animations; touch geometry rounds only floating-point noise
  below 0.001 CSS pixels while the CSS minimum remains 44px.
- Final commands/results/times are appended below after completion. Browser
  contexts use synthetic local data at 393 x 852 CSS pixels, DPR 3, Chromium and
  WebKit. No owner credentials or production-library mutations are used.
- Real iPhone 15 Safari home-screen installation, keyboard/system safe areas and
  physical offline/update behavior remain unverified. Browser simulation is not
  a claim of physical-device acceptance.

## Preview And Integration Handoff

- Commit only reviewed task files on the isolated developer branch. Do not merge
  main, push main, deploy production or edit other task worktrees. The user's
  latest request is a reviewable deliverable before integration/publication.
- Freeze `RECALL_BUILD_VERSION=1.0-20261101-0200` for build/acceptance/deploy.
  Check committed rebuilt resources against the validated bundle SHA-256 list.
- Planned preview package contains the exact compiled `dist`, a standalone Node server,
  synthetic data, review instructions, screenshots, checksums and source identity.
  It is not a public hosted link or physical-installed-PWA acceptance.
- Shared overlap points: `memory-workspace.tsx`, PWA update provider, appearance
  styles, `vite.config.ts`, TypeScript build declarations, mobile/public tests
  and `docs/PWA.md`. Integrator must review semantic conflicts with other shell
  or build tasks. No lockfile/database contract or API changes are involved.
- The main worktree had known concurrent edits to agent/Skill/release policy at
  the last preflight. They were not copied, staged, overwritten or published.
  Only the appointed integration chat can reconcile those policies and this task.
- Future integration must rerun combined checks, preserve the production origin
  and verify public version/header, root manifest/icons, SW, bundle hashes and
  anonymous API rejection. This task's public test updates are not live passes.
- Compatible asset rollback target: production deployment
  `0a8d051f-3349-4a20-afbf-c1d12deeaf9e`. It already understands card
  `archivedAt`; no schema/data rollback is needed. If this release regresses,
  first ensure it remains the latest production deployment, then use the
  existing Pages project's deployment rollback to that target. Verify public
  assets/auth and reopening; record the incident here. Do not clear device data,
  reset D1 or rewrite Git history. Older bundles lack the new footer/metadata
  controls; browser SW updates still require confirmation of installed behavior.

## Final Evidence

The developer chat stopped before producing implementation/handoff commits.
On `2026-11-01`, the user appointed the integration chat to commit and publish
all pending Recall tasks, including unfinished submissions. The original
worktree remains unchanged. Its tracked diff and eleven untracked task files
were frozen in an isolated integration workspace from base `a9ce6d8`.
Tracked patch SHA-256: `561f79cbe9421c7dfa35d6c75cfff843fd0b4f07aad75dcd53506b9d9f13efb1`.

- Initial integration-focused units: 66 passed, 8 preview-server tests failed
  because the browser test environment imposed CORS on the loopback Node server.
  Added the existing project convention `@vitest-environment node` to that test.
- Recovery command: `node node_modules/vitest/vitest.mjs run
  src/lib/memory-archive.test.ts src/lib/build-version.test.ts
  src/services/__tests__/pwa-refresh.test.ts
  src/services/__tests__/task-preview.test.ts
  src/services/__tests__/memory-actions.test.ts
  src/components/__tests__/pwa-app-version.test.tsx
  src/components/__tests__/pwa-update-prompt.test.tsx`: 7 files, 74 passed,
  starting `2026-11-01T02:28:54+08:00`.
- `RECALL_BUILD_VERSION=1.0-20261101-0230 RECALL_STUDY_PORT=4416
  node scripts/run-playwright.mjs --config e2e/memory-study.config.ts
  --grep '版本刷新激活|整组归档' --workers=2
  --output=/tmp/recall-all-pending-focused-mobile`: 10 Chromium/WebKit checks
  passed with cached engines after the guarded sandbox refusal and approved retry.
  This retests the captured reload guard; earlier double-reload failures are
  not relabeled passes. No production-library data was used.
- Full combined gates, fixed source SHA, preview and publication outcomes are
  recorded by the integrator. The integrated build uses frozen identity
  `1.0-20261101-0230`, not this developer draft's original `0200` identity.
