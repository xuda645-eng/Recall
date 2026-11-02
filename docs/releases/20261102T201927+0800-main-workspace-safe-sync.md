# Main Workspace Preservation And Safe Sync

## Identity And Scope

- ID: `20261102T201927+0800-main-workspace-safe-sync`.
- Timezone: Asia/Shanghai; audit clock `2026-11-02T20:19:27+08:00`.
- User request: review and preserve uncommitted main changes, commit first,
  then safely synchronize the primary working directory with current main.
- Scope: local preservation commit, history-preserving reconciliation, latest
  source validation and sanitized source/documentation publication. No new
  application behavior, real-library mutation or production deployment intended.
- Status: preservation prepared; reconciliation/validation/publication pending.

## Audit And Preservation

- Primary directory: `/Users/bytedance/Documents/CodexProject/Recall/Recall-next`.
- Initial main: `1c64e517c9ce4030895073ce6e2ec16958c95fda`.
- Fetched remote main: `d424e29cdaa75629a00bd68aeaf523f660a9b6b3`;
  initial ancestry comparison: 0 local-only / 22 remote-only commits.
- Initial outstanding files: six archive implementation/test/PWA drafts, one
  release-index entry and its untracked sanitized Skill task record. Index was
  initially empty; no ignored private card data is staged.
- Six-file binary archive diff SHA256:
  `d5222a2ab92f151c177b61ca95a380b62f794735096642663257846b808cb346`.
  This exactly matches the preserved draft documented in
  [November 2 integration](./20261102T122811+0800-all-pending-media-weread.md).
  The newer shipped source additionally handles empty archived descendants,
  retained filter state and nested restoration. Preserve the draft in history,
  but do not downgrade those newer fixes by reapplying it over current source.
- The existing Skill task record is byte-identical to remote main; its index
  entry is also already published. Keep one entry after reconciliation.
- Independent private backup: `/private/tmp/recall-main-sync-20261102/backup`.
  It contains exact copies of all eight outstanding files, a binary tracked
  patch, file hashes and a complete copy of the old ignored Skill mirror.
- Full initial tracked patch SHA256:
  `101d15c8a8d6b6e85a0f12763b2cbdc4c7f2c0ef2e76157df0d7ef61081d06b6`.
  Also fingerprinted 27 ignored card/Skill/config files without publishing their
  contents. Personal installed Skill remains outside the repository operation.
- New remote main already tracks the generalized screenshot Skill source.
  The old main ignores that mirror and lacks its media additions. Preserve the
  whole old mirror privately, load the incoming tracked source, then retain only
  the three reviewed source-context instruction/template edits from the installed
  package. Do not copy older helper scripts over newer upstream scripts, force-add
  private material or lose the source-reading rules from the preceding task.
- Snapshot commit is a preservation checkpoint, not a tested production release.
  Keep both the checkpoint and remote ancestry through a normal merge; no reset,
  force-push, branch deletion or stash of private data.

## Validation And Recovery

- Windows Obsidian Home/Project Map and Graphify are unavailable; disclosed and
  used the project handoff table plus targeted changed-file inspection.
- Initial sandboxed `git fetch origin main` could not write `.git/FETCH_HEAD`.
  Tool-approved escalated rerun succeeded and only updated fetch/remote metadata.
- `pnpm exec vitest run src/lib/memory-archive.test.ts` failed before tests:
  pnpm attempted automatic dependency repair and aborted modules removal without
  a TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). No purge was authorized.
  Recovery: use the installed test executable directly instead of triggering
  automatic package installation.
- `node node_modules/vitest/vitest.mjs run src/lib/memory-archive.test.ts`:
  baseline 13 tests passed. `git diff --check` passed before checkpoint.
- Reconciled source checks, final code-tree equality, ignored-data preservation,
  Skill tests, production build and mobile simulation: pending. Build output must
  use a task-specific temporary directory, not replace existing served `dist/`.
- Browser checks must use the guarded launcher and approved unsandboxed execution
  on macOS. Synthetic/local browser checks are not physical iPhone acceptance.
- No real-card import or private-document regeneration is included in this task.
  The earlier document-conversion request remains unfinished, not silently imported.

## Publication And Compatible Recovery

- Checkpoint SHA, merge SHA, final normal push and completion time: pending.
- Deployment ID/URL and post-deploy validation: not applicable if reconciled app
  source matches existing remote source. Keep `https://recall-memory.pages.dev/`
  unchanged; do not redeploy an old snapshot or documentation-only update.
- Previous production deployment was not revalidated for this local/source-only
  task. Older recorded deployments are not evidence of current production state.
- Recovery: inspect the checkpoint and exact private backup to recover individual
  original edits. Use reviewed corrective commits if needed, not reset/history
  rewriting. No database, credentials, browser storage or source-photo rollback.
