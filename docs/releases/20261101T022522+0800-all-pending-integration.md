# All Pending Recall Tasks - Unified Integration

## Identity And Authorization

- Release ID: `20261101T022522+0800-all-pending-integration`.
- Role: explicitly enabled `$recall-parallel-delivery` integration owner.
- Inventory snapshot clock: `2026-11-01T02:25:22+08:00` (Asia/Shanghai).
- User scope: integrate, commit, push and publish all pending Recall tasks.
  Unless the user explicitly lists specific tasks, the integration batch defaults
  to all pending project work. No user-provided SHA list is required.
- Repository: `https://github.com/xuda645-eng/Recall`.
- Integration worktree: `/private/tmp/recall-integration-all-pending-20261101`.
- Branch: `codex/integration-all-pending-20261101`, baseline
  `3e6a08ed133169541ce3aa48f9f79f3533360091`.
- Status: combined validation passed; source publication next; this chat
  has not pushed main or deployed production yet.
- Production origin remains `https://recall-memory.pages.dev/`.

## Inventory And Integration Results

| Pending task | Source and traceability | Result |
|---|---|---|
| Whole-folder archive, visible build version, safe refresh and local preview tooling | `用内置浏览器打开 Recall 项目 (2)`, `/Users/bytedance/.codex/worktrees/0c38/Recall-next`, base `a9ce6d8`; frozen snapshot `638a1d777e59706c3fc8c5c1ff0c2beed9730edd` | Source chat interrupted before commit. Captured task files in an isolated workspace, repaired Node test environment, passed focused gates and merged with history in `8addd66`. |
| Explicit parallel preview and delivery authorization | `排查失败并避免多任务代码冲突`, application main worktree, base `a9ce6d8`; frozen snapshot `db0c145cb6a60ddbcd84675ab00054bd864984a0` | Validated and merged in `47805f5`; release-index conflict resolved by retaining both task rows, not selecting one entire file. |
| Status-sampling publication evidence | `用内置浏览器打开 Recall 项目 (3)`, `/private/tmp/recall-status-sampling-20261101`, base `3e6a08e`; evidence snapshot `27539f3b5db99b1108463cf26a6cef774e8cb467` | Merged documentation in `13ec7d9`. App fix was already on main and production; it was not applied again. Captured evidence has public Chromium/final-completion limits, which remain explicit. |
| Integration-scope Skill correction | User instructions in the current integration chat | Default all-pending scope, autonomous inventory and isolated capture of attributable inactive work added; explicit-only invocation and safety boundaries retained. |
| Historical review queue and detached iOS record | `c3db6fc`, `fd5b45d`, historical integration record | Review commits are ancestors of main. `git cherry origin/main fd5b45d` identifies the detached evidence as equivalent; no duplicate integration. |
| Older untracked Skill draft and README in `/Users/bytedance/.codex/worktrees/9cfc/Recall-next` | Original `d6eecb4` worktree | Existing main contains the original Skill and later deliberate wording correction. Newer preview/scope rules preserve its functionality; obsolete draft is not published over the newer version. |

All source chats were idle at inventory. No chat was created or automatically
bound to this Skill. Their original worktrees and uncommitted content remain
untouched. Task-scoped tracked patches and explicit untracked files were captured
locally before integration; no private card batches, credentials, internal
handoffs or parent empty repository were included.

Captured tracked-patch SHA-256 values:

- Folder/version: `561f79cbe9421c7dfa35d6c75cfff843fd0b4f07aad75dcd53506b9d9f13efb1`.
- Preview policy: `4e15607a30a623ab73b0962b00f7e02491c947d106fe4e16f058b51ed1203f24`.
- Status evidence: `011a8c5275135a414757d69f86a0df007b8a6419c1ec8fa47824476227a9e3cd`.

## Behavior And Compatibility

- Folder management confirms archival of active cards in the whole subtree.
  Folder hierarchy, existing archives, content, schedules and review history are
  retained. Three-second undo restores this operation only, checking timestamps.
- Drawer footer exposes the bundled version and accessible refresh control.
  Frozen release identity: `1.0-20261101-0230`. Anonymous `/version.json` is
  `no-store`, excluded from precaching and must match the rendered build.
- Manual refresh waits for worker installation/activation, reports failures and
  avoids duplicate manual/Workbox reloads. It does not clear local data.
- Existing safe-area sampling height and its stress tests survive the merge.
  Browser simulations do not prove that physical iPhone native blur is fixed.
- Local preview tooling is loopback-only, may seed synthetic data only on an
  empty independent origin, and rejects all `/api` calls. It is not production
  cloud functionality or a hosted iPhone link.
- No Functions, D1 schema/migration, cloud protocol, secret, production-card,
  paid-resource or origin change. The desktop package remains `1.3.0`.

## Validation And Recovery

- Windows vault and Graphify are absent on this Mac. Session handoff and targeted
  architecture routing were used; no graph update is claimed.
- Independent dependencies were copied into the integration worktree without
  altering the original dependency directories or lockfile.
- Sandbox `git fetch origin` and `git worktree add` failed with protected Git
  lock/FETCH_HEAD permissions. Approved retries succeeded; no sandbox bypass.
- Initial focused units: 66 passed, 8 failed because the preview-server tests
  used happy-dom CORS. Applied the existing `@vitest-environment node` convention.
  Focused recovery: 7 test files, 74 passed.
- Browser launcher refused `RECALL_BROWSER_SANDBOX` before engine startup.
  Approved escalated retries kept the guard and preflight, using cached
  Chromium/WebKit at 393 x 852 CSS pixels, DPR 3 and synthetic local data.
- Focused mobile command: `RECALL_BUILD_VERSION=1.0-20261101-0230
  RECALL_STUDY_PORT=4416 node scripts/run-playwright.mjs
  --config e2e/memory-study.config.ts --grep '版本刷新激活|整组归档'
  --workers=2 --output=/tmp/recall-all-pending-focused-mobile`: 10 passed.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 132 existing warnings.
- `node node_modules/vitest/vitest.mjs run --coverage`: 78 files, 1382 passed.
  Start `2026-11-01T02:31:42+08:00`; duration 17.69s. Coverage: statements
  41.58%, branches 39.33%, functions 36.31%, lines 45.08%, all thresholds passed.
- `node node_modules/typescript/bin/tsc -b`: passed.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts`:
  3 files, 187 passed; `2026-11-01T02:32:10+08:00`. Synthetic local SQLite only.
  No remote D1 mutation or migration was run; cloud source is unchanged.
- `UV_CACHE_DIR=/tmp/recall-skill-uv-cache uv run --no-project --with PyYAML
  python /Users/bytedance/.codex/skills/.system/skill-creator/scripts/quick_validate.py
  skills/recall-parallel-delivery`: passed. Package checker passed 8 metadata
  invariants and relative Markdown links; rerun after final record/index edits.
- Full combined mobile command: `RECALL_BUILD_VERSION=1.0-20261101-0230
  RECALL_STUDY_PORT=4416 node scripts/run-playwright.mjs
  --config e2e/memory-study.config.ts --workers=2
  --output=/tmp/recall-all-pending-mobile`: 78 Chromium/WebKit checks passed,
  2.5 minutes. Covers home, study rounds, folder tree, cards, archive/undo,
  Markdown preview/update, long-card scrolling, rating/undo, statistics, forms,
  safe-area stress, narrow/breakpoint/landscape/desktop and offline persistence.
- `RECALL_BUILD_VERSION=1.0-20261101-0230 node scripts/run-playwright.mjs
  --config /private/tmp/recall-all-pending-update.config.mts --workers=2
  --output=/tmp/recall-all-pending-update`: 2 passed, 10.4s. Local server switched
  from the exact previous production bundle to the integrated build; actual old
  update prompt delivered the new version and retained synthetic card/deck,
  archive/review state and an unrelated preference. Guard/preflight retained.
- `curl -L --fail --connect-timeout 15 --max-time 60 -sS
  https://recall-memory.pages.dev/ -o /tmp/recall-all-pending-previous-index.html`
  and comparison with the previous update-test bundle: byte-identical.
- `RECALL_BUILD_VERSION=1.0-20261101-0230 RECALL_WEREAD_PORT=4418
  node scripts/run-playwright.mjs --config /private/tmp/recall-all-pending-weread.config.mts
  --workers=2 --output=/tmp/recall-all-pending-weread/results`: 38 passed, 1.1m.
  Dedicated build/port, synthetic card data, intercepted APIs, no production AI.
- `RECALL_BUILD_VERSION=1.0-20261101-0230
  node node_modules/vite/bin/vite.js build --mode production`: passed at
  `2026-11-01T02:36:34+08:00`; 154 precache entries, 3254.18 KiB. Existing
  RichCard large-chunk advisory retained. All 196 output file hashes captured
  before commit for comparison with the committed rebuild.
- Root manifest and uncached version metadata checks passed. Original tracked
  snapshot hashes still matched and `git ls-remote origin refs/heads/main`
  remained `3e6a08e`; current production listing remained `2d0c437c`.
- Final metadata/package and Markdown-link checks passed, as did `git diff --check`.
  Committed rebuild/hash equality and public checks are appended after execution.
  No public mutation tests are permitted.

Physical iPhone 15 home-screen installation, native top-edge effect, dynamic
system safe areas, keyboard, offline cold launch and this update's device delivery
remain unverified. No physical acceptance is claimed.

## Skill Installation

- Updated `/Users/bytedance/.codex/skills/recall-parallel-delivery` through approved
  escalation after verifying both existing files against known base `a9ce6d8`.
- Previous two-file installation backed up locally. Source/installation equality
  and installed quick validation passed at `2026-11-01T02:33:28+08:00`.
- No global configuration, automation, memory or unrelated Skill was changed.

## Source And Publication

- Main push, final implementation SHA, committed build hash checks, deployment
  ID/URL, timestamps and public results: pending and appended after publication.
- Existing account verified: `751b9fca4f5173fd70e0dfb69cff81e2`, existing
  `recall-memory` Pages project. Latest observed production at inventory:
  `2d0c437c-ef6b-4f0a-98ae-3a3c0b8aa3b5`, source `3e6a08e`, deployment URL
  `https://2d0c437c.recall-memory.pages.dev/`.
- Remote main and production must be rechecked before push/deploy. Do not force
  push, deploy after rejected push, upload dirty work or replace another release.
- Evidence follow-up is documentation-only and does not redeploy the app.

## Recovery Boundaries

- Compatible asset rollback target: previous production
  `2d0c437c-ef6b-4f0a-98ae-3a3c0b8aa3b5`. It already supports card `archivedAt`;
  no schema/data rollback is required. Its physical blur result is unverified,
  not a known-good native visual result.
- Before rollback, confirm this release remains current, then use the existing
  Pages deployment rollback to that target and verify public assets/auth and
  relevant flows. Record actual incidents and outcomes in this file.
- Never reset D1/device storage, reinstall the PWA, rewrite history or force push.
  Asset rollback cannot undo local data or Service Worker cache state.
