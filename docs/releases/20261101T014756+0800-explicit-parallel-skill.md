# Explicit-Only Parallel Delivery Skill

## Identity And Scope

- Release ID: `20261101T014756+0800-explicit-parallel-skill`.
- Scope: instruction-only Skill, local installation and documentation. No app,
  server, dependency, schema, credential or production data change.
- Inventory timestamp observed: `2026-11-01T01:44:32+08:00`.
- Validation timestamp observed: `2026-11-01T01:47:56+08:00`.
- Status: Skill validated and installed; source commit/push pending.
- User request: package the parallel development and single integration-owner
  workflow as an optional Skill. Do not automatically add or activate it when
  the user has not explicitly added it; state this boundary in its description.

## Changes And Decisions

- Add `skills/recall-parallel-delivery/SKILL.md` and
  `skills/recall-parallel-delivery/agents/openai.yaml`.
- Both the discovery description and UI description state explicit-only use.
  Metadata sets `policy.allow_implicit_invocation: false`; this is not merely
  a prose request to avoid automatic selection.
- Creating, installing, viewing or discussing the Skill is not activation.
  Its scope is the invoking chat and named batch, not every chat in the project.
  Other participating chats must explicitly add it themselves.
- Developer mode uses isolated worktrees and task commits, with no direct main
  push or production release. Integrator mode serializes reviewed fixed-SHA
  integration, combined validation, main publication and production deployment.
- Preserve the existing authorization outside an explicitly enabled task.
  No global settings, AGENTS.md, schedules, memory or default delivery policy
  are modified. Role restrictions do not override tool-enforced approvals.
- Include task handoff fields, overlapping-file coordination, shared-folder
  boundaries, startup guard reuse, remote-main/production race checks and
  docs-only no-redeployment behavior. The Skill is not a file or deployment lock.
- Add a reference to the Skill in `docs/README.md`. Store this unique task record
  and its release-index entry without activating the new parallel mode.
- Install the exact two-file Skill into the user's existing Codex Skill location
  through approved escalated execution. The installer refuses an existing target
  and verifies byte equality; it does not overwrite another Skill.

## Validation And Limitations

- The system `python3` initially lacked PyYAML (`ModuleNotFoundError: No module
  named 'yaml'`). Recovery uses an isolated temporary uv environment/cache,
  without modifying the app's packages or global Python installation.
- `UV_CACHE_DIR=/tmp/recall-skill-uv-cache uv run --no-project --with PyYAML python
  /Users/bytedance/.codex/skills/.system/skill-creator/scripts/quick_validate.py
  skills/recall-parallel-delivery`: passed, `Skill is valid!`.
- `UV_CACHE_DIR=/tmp/recall-skill-uv-cache uv run --no-project --with PyYAML python
  /tmp/recall-parallel-skill-check.py skills/recall-parallel-delivery docs/README.md
  docs/RELEASES.md`: 8 metadata/package checks passed; 13 documentation-index
  and 19 release-index local link targets passed before adding this record.
  Checks include boolean false policy, exact invocation name, UI field types,
  description length and the instruction-only two-file package.
- `git diff --check`: passed before staging; rerun before publication.
- Installation command: `test ! -e
  /Users/bytedance/.codex/skills/recall-parallel-delivery && cp -R
  /Users/bytedance/Documents/CodexProject/Recall/Recall-next/skills/recall-parallel-delivery
  /Users/bytedance/.codex/skills/recall-parallel-delivery && diff -qr
  /Users/bytedance/Documents/CodexProject/Recall/Recall-next/skills/recall-parallel-delivery
  /Users/bytedance/.codex/skills/recall-parallel-delivery`:
  passed through approved escalated execution; installed files match source.
- Manual decision review covers no mention, generic parallel-work request,
  installation-only request, explicit developer role, explicit integrator role,
  incomplete task handoff and concurrent-main/production changes. These are
  instruction reviews, not empirical independent-chat or UI invocation tests.
- No app code changes: app unit tests, production build and iPhone browser tests
  are not required for this instruction/documentation-only change. Physical
  iPhone acceptance, Skill selector refresh and future chat compliance are not
  claimed. Temporary validation helpers and caches are not published.

## Source And Publication

- Repository: `https://github.com/xuda645-eng/Recall`, branch `main`.
- Initial source HEAD: `d6eecb4d41c030a9fe8854ddb6be55e7f5462500`.
- Worktree was clean at inventory. Stage only this Skill and scoped docs, not
  the pre-existing local yellow-highlight Skill or private batches.
- Implementation commit/push: pending; exact SHA and actual outcomes will be
  appended after source publication in a documentation-only follow-up.
- Installation completed after the validation timestamp above; exact completion
  time and installed validation outcome will be appended during publication.
- Production deployment: not applicable. No app bundle is rebuilt or deployed.
- Production origin: `https://recall-memory.pages.dev/`, unchanged by this task.
- Last recorded production deployment:
  `0a8d051f-3349-4a20-afbf-c1d12deeaf9e`,
  `https://0a8d051f.recall-memory.pages.dev/`, implementation source
  `b19818947471d0c078b7d72c9fd95e01e9839a13`, per the
  [main integration record](./20261101T010911+0800-main-integration.md).
  This task does not independently requery or revalidate live production.

## Recovery

- No Pages rollback is needed because this task does not replace the app.
- If the Skill needs correction, create a scoped fix or history-preserving revert
  of this Skill/docs commit, validate it and normally publish the source. Do not
  reset main or force-push. Install updates through the normal approval path.
- Until corrected, do not invoke this optional Skill. Any removal of the local
  installed directory remains a separately requested operation, not an automatic
  cleanup. Do not delete task worktrees or private data as a recovery action.
