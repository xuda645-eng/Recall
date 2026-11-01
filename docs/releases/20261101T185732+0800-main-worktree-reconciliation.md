# Main Worktree Reconciliation

## Identity And Scope

- ID: `20261101T185732+0800-main-worktree-reconciliation`.
- Inventory: `2026-11-01T18:57:32+08:00` (Asia/Shanghai).
- Request: commit all content pending in the application's main worktree.
- Repository: `https://github.com/xuda645-eng/Recall`.
- Scope: preserve six existing drafts, synchronize local main with already
  published source, and commit this documentation record and release index.
- Status: original drafts preserved, local main synchronized and clean; record
  committed and normally pushed, documentation evidence follow-up prepared.
- No new application, dependency, schema, secret, infrastructure or data change.

## Inspection And Preservation

The application main worktree was at
`a9ce6d8fe1dd6897692156b81cd8966ab43bee5b`, 36 commits behind the observed
remote tip `e197e45c82ba3ea8ab2cb9780f2bae470a641b3c`. It contained five modified
tracked files and one untracked record, with no staged changes:

- `AGENTS.md`.
- `docs/README.md`.
- `docs/RELEASES.md`.
- `skills/recall-parallel-delivery/SKILL.md`.
- `skills/recall-parallel-delivery/agents/openai.yaml`.
- `docs/releases/20261101T020208+0800-preview-delivery-policy.md`.

Each file matched the already committed task snapshot
`db0c145cb6a60ddbcd84675ab00054bd864984a0` byte-for-byte. That task commit is an
ancestor of the latest main. These are not missing source changes; republishing
the old complete files would overwrite newer Skill scope rules and release
evidence. All six original versions remain in main's history.

Before moving main, copied all six drafts and the tracked binary diff into an
independent private local backup. Preserved a scoped Git stash including the
untracked record, without dropping it:
`50e83fa560b7bc23707bdab8c5705b7870875862`.
Tracked patch SHA-256:
`4e15607a30a623ab73b0962b00f7e02491c947d106fe4e16f058b51ed1203f24`.
Verified all tracked stash versions and the untracked third-parent version
against their backup copies. No original content was discarded.

Approved `git fetch origin`, followed by scoped `git stash push
--include-untracked -- <the six paths>` and `git merge --ff-only origin/main`,
synchronized original main to `e197e45` at `2026-11-01T18:58:38+08:00`.
`git status --porcelain` was empty and main matched origin/main. No reset,
force push, stash drop, unrelated file staging or production upload was used.

The integration owner prepared this record in the existing isolated integration
worktree. Other developer worktrees remain untouched and are outside this
specifically main-scoped request. Ignored private card batches, credentials,
local handoffs, dependencies and build output were not staged or published.

## Validation

- File-by-file `git show db0c145:<path> | cmp -s - <path>`: all six matched.
- `git merge-base --is-ancestor db0c145 origin/main`: passed.
- Exact pending-path inventory and staged-empty checks: passed before stash.
- Backup/stash byte equality: all six passed after synchronization.
- Original main `git status --porcelain`: empty after synchronization.
- Documentation validation at `2026-11-01T19:00:33+08:00`:
  `UV_CACHE_DIR=/tmp/recall-skill-uv-cache uv run --no-project --with PyYAML
  python /tmp/recall-parallel-skill-check.py skills/recall-parallel-delivery
  docs/RELEASES.md docs/releases/20261101T185732+0800-main-worktree-reconciliation.md`:
  8 metadata/package checks, 34 release-index links and 1 task-record link passed.
  `git diff --check` passed, and the application/public/server/dependency diff
  was empty. Repeat documentation/diff checks before the evidence follow-up.
- No app tests/build/browser or physical-device acceptance is run for this
  documentation-only reconciliation. Existing validation limits are unchanged.

## Publication And Recovery

- Record commit: `1ef1be842f9621ed694412b1404cce79f3980707`,
  `2026-11-01T19:01:48+08:00`, containing this record and its index entry only.
- `git fetch origin` still matched `e197e45` before commit. Normal
  `git push origin HEAD:main` succeeded: `e197e45..1ef1be8 HEAD -> main`.
  `git ls-remote origin refs/heads/main` independently returned the full record
  SHA at `2026-11-01T19:01:52+08:00`. No force push or new app deployment.
- Evidence follow-up: documentation-only Git commit updating this record/index;
  its exact SHA, push result and final original-main synchronization are reported
  at handoff without another self-describing commit or app release.
- Production deployment: not applicable; no app code changed or bundle uploaded.
  Production origin stays `https://recall-memory.pages.dev/`.
- Prior production evidence is in
  [iPhone system-frame adoption](./20261101T165615+0800-iphone-system-frame-adoption.md):
  implementation `b5e79fd`, deployment `b15d48db-31e7-453e-b9d7-82667eca7ff5`.
  No new hosting query or physical revalidation is claimed by this task.
- Recovery: inspect the preserved commit/stash/backup and recover specific
  necessary edits into an isolated worktree. Do not blindly apply the old stash
  over current main, reset shared history, clear storage or roll back production.
- Evidence follow-up is documentation only and must not redeploy the app.
