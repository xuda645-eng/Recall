# Preview Delivery And Explicit Parallel Authorization

## Identity And Scope

- Release ID: `20261101T020208+0800-preview-delivery-policy`.
- Started: `2026-11-01T02:02:08+08:00` (first inventory clock sample).
- Follow-up authorization clarification: `2026-11-01T02:03:53+08:00`
  (inspection clock sample after the user's AGENTS.md request).
- Scope: Skill instructions/metadata, application agent rules, documentation and
  a local parent-workspace rule mirror. No app/server code or schema changes.
- Status: task snapshot integrated and pushed with main `a319c3b`; updated Skill
  installed. No separate app deployment for this instruction-only task.
- Requests: add preview delivery to the optional parallel Skill, then clarify
  its precedence relative to the existing no-repeat-confirmation delivery rules.

## Changes And Authorization Boundaries

- Update `skills/recall-parallel-delivery/SKILL.md` with an applicable preview
  deliverable, preferring an iPhone-accessible independent HTTPS preview. Require
  viewing steps, source SHA, acceptance items, availability/access conditions,
  verification and explicit blockers or suitable file/test alternatives.
- Add preview fields to developer handoffs and integrator inventory. Do not
  conflate a preview, browser simulation, user acceptance or production release.
- Update discovery/UI descriptions without changing the Skill name, default
  invocation prompt or `allow_implicit_invocation: false`.
- Clarify both application `AGENTS.md` and the parent local `AGENTS.md`: normal
  tasks retain automatic validation/commit/main push/production publication.
  Only explicitly enabled parallel developers use branch/preview/handoff delivery;
  the assigned integrator publishes the combined main/production version.
- Safe task-branch pushes and previews on existing authorized infrastructure need
  no repeated business confirmation. New/paid resources, private-data publication,
  security changes and tool-enforced approvals remain outside this exemption.
- Previews are task-specific non-main versions on existing infrastructure, not
  replacements for the production origin or another task's preview. Keep
  production D1, secrets, real cards and paid services isolated. Backend-dependent
  behavior needs authorized isolated test data or explicit mock/unavailable status.
- Align `docs/RELEASES.md` and the documentation-index entry. Developers keep
  unique pending records; only the integrator edits the shared release index.
- Maintaining/installing this Skill does not activate its parallel developer
  mode for this maintenance task or for other chats. No global configuration,
  automation, memory, hosting settings or production data is changed.

## Validation

- `UV_CACHE_DIR=/tmp/recall-skill-uv-cache uv run --no-project --with PyYAML python
  /Users/bytedance/.codex/skills/.system/skill-creator/scripts/quick_validate.py
  skills/recall-parallel-delivery`: passed, `Skill is valid!`.
- `UV_CACHE_DIR=/tmp/recall-skill-uv-cache uv run --no-project --with PyYAML python
  /tmp/recall-parallel-skill-check.py skills/recall-parallel-delivery docs/README.md
  docs/RELEASES.md`: 8 metadata/package checks, 13 documentation-index links and
  20 release-index links passed before adding this record. Boolean false implicit
  invocation policy, exact invocation name and instruction-only package retained.
- `git diff --check`: passed. Validation clock sample:
  `2026-11-01T02:04:52+08:00`. Checks are rerun after adding this record and after
  updating the installed Skill.
- Manual policy review: default tasks continue normal release; explicit developers
  deliver branch/preview/handoff; explicit integrator performs combined release;
  new/paid or unsafe preview resources require approval; a missing preview is
  reported, not invented. This is instruction review, not independent-chat testing.
- No application, browser or physical-iPhone test is run for this documentation
  update. No actual hosted preview is created. Future preview accessibility,
  selector refresh and agent behavior remain unverified by this task.

## Source, Installation And Publication

- Repository: `https://github.com/xuda645-eng/Recall`, branch `main`.
- Initial source: `a9ce6d8fe1dd6897692156b81cd8966ab43bee5b`, clean at inventory.
- Read-only `git fetch origin` succeeded; main/remote divergence was `0 0`.
- Task snapshot: `db0c145cb6a60ddbcd84675ab00054bd864984a0`, committed in the
  isolated integration workspace at `2026-11-01T02:29:55+08:00`, merged with
  history in `47805f5`. Original policy worktree remains untouched.
- A user follow-up clarified that the integrator defaults to all pending Recall
  work unless specific tasks are explicitly listed. The consolidated release
  adds this rule without enabling implicit Skill invocation.
- Source/installed Skill equality and installed validation passed at
  `2026-11-01T02:33:28+08:00`, after preserving the prior installed version.
- Main push outcome is recorded by the
  [all-pending integration](./20261101T022522+0800-all-pending-integration.md).
- Parent workspace `AGENTS.md` is a local mirror outside the application's Git
  root. Keep it in sync locally; do not initialize, commit or publish the parent
  empty repository or its private contents.
- Production/deployment: not applicable, no app build, Pages upload or rollback.
  Origin stays `https://recall-memory.pages.dev/` with respect to this task.
- Last recorded production is `0a8d051f-3349-4a20-afbf-c1d12deeaf9e`, source
  `b19818947471d0c078b7d72c9fd95e01e9839a13`, deployment URL
  `https://0a8d051f.recall-memory.pages.dev/`, per the
  [main integration record](./20261101T010911+0800-main-integration.md).
  This task does not independently query or reverify live production.

## Recovery

- No Pages rollback is necessary. For rule/Skill corrections, use a scoped fix
  or history-preserving revert, validate and push normally. Synchronize installed
  Skill and parent local mirror through the applicable approval paths.
- Preserve the prior validated instruction version from the
  [original Skill delivery](./20261101T014756+0800-explicit-parallel-skill.md).
  Do not reset Git history, clear device data, delete task worktrees, change
  production bindings or automatically uninstall the optional Skill.
