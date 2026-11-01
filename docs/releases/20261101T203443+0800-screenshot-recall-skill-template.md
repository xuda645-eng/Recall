# Screenshot Recall Skill And Personal Recording Template

## Identity And Scope

- ID: `20261101T203443+0800-screenshot-recall-skill-template`.
- Date/time: Asia/Shanghai; first captured task clock
  `2026-11-01T20:28:04+08:00`. Exact initial start time was not captured.
- Request: extend the existing personal Skill with screenshot red-frame
  selection and create a reusable Lark document containing an image table.
- Scope: private-local Skill implementation and installation, a new user-owned
  blank Lark template, and this sanitized documentation record/index.
- Status: implementation validated and installed, template created and fetched
  back; documentation record normally pushed, evidence follow-up prepared.
- No Recall product code, application data, schema, cloud API, authentication,
  origin, paid infrastructure or deployed bundle changed.

## Changes

- Preserve `lark-yellow-to-recall` and its existing default yellow-only CLI.
  Add screenshot mode to the entrypoint, UI metadata and source/format contract.
- Screenshot inventory traverses table cells in document order, skips empty
  cells, records image block IDs/media tokens, and uses row/column for traceability
  rather than stable card identity.
- Agents visually review red frames and transcribe text/diagram relationships.
  Scripts check source identity/version, complete image coverage, PNG/JPEG
  signatures, local file boundaries, image hashes, normalized bounds, review
  flags, stable region/unit keys and evidence coverage. These structural checks
  do not prove OCR accuracy or automatically detect red frames.
- Only selected text becomes answers through refs. Outside context stays in
  evidence; unresolved images remain documented. Source images and temporary
  file paths are not copied into archived manifests.
- Reuse immutable batches, IDs, duplicate detection, actual PWA parser and
  in-memory import/update/progress verification. No automatic APP import.
- Add a blank XML template: source/topic fields, a three-column/four-row
  screenshot table with 12 placeholders, optional notes and brief selection
  rules. Create it as the user in `my_library`; no original material, screenshots,
  public sharing command or existing source-document modification.

## Privacy And Source Tracking

The personal Skill mirror was already excluded by the repository's local
`.git/info/exclude`. It is not a tracked source package. Preserve that existing
boundary: do not force-add the Skill, private source responses, screenshots,
selection evidence, template URL/token or card batches to GitHub. Only this
sanitized record and the release index are published.

The installed Skill is `/Users/bytedance/.codex/skills/lark-yellow-to-recall`;
its local project mirror is `skills/lark-yellow-to-recall/`. Installation changed
only task-related files and preserved the previous installation in an independent
temporary backup. The template URL is delivered only in the user chat.

Installed artifact SHA256 at `2026-11-01T20:37:38+08:00`:

- `SKILL.md`: `59104617613f7e1996d51523c2dcda67c2f3c597a2500e9cab96f82f8bbbe85e`.
- `scripts/recall_batch.py`:
  `830c957679fd9f57201afb58caca8b872e10f45c735288f970ec9eb026cbfee4`.

Baseline repository main was `aa3ac69cb4ed60e4154d2e6079aedca5299f3870`.
After checking a clean worktree and remote commits, normal fetch/fast-forward
updated it to `1dc2c66960c9e78d531f39043be1cf263db3574b` before editing. No reset,
force push, new branch, stash or unrelated worktree modification occurred.

## Validation And Recovery

- `RECALL_PROJECT=/Users/bytedance/Documents/CodexProject/Recall/Recall-next
  python3 -m unittest discover -s skills/lark-yellow-to-recall/scripts/tests -v`:
  50 passed, including 13 screenshot tests and actual parser integration. Final
  local run completed after the captured `2026-11-01T20:34:43+08:00` clock.
- Initial focused screenshot run: 12 passed, one integration error because the
  synthetic project copied the parser without its internal source dependencies.
  Recovery: copy the actual source tree into the isolated fixture and rerun.
  Full runs then passed, including first/repeated import, revised answers with
  unselected updates left untouched, confirmed update and old-card/progress
  preservation. No real library writes.
- `python3 -m py_compile` on the changed script/test: passed.
- `UV_CACHE_DIR=/tmp/recall-screenshot-skill-uv-cache uv run --no-project
  --with PyYAML python
  /Users/bytedance/.codex/skills/.system/skill-creator/scripts/quick_validate.py
  skills/lark-yellow-to-recall`: passed. System Python initially lacked PyYAML;
  use an isolated uv environment, not a system install.
- `extract --mode screenshots` on an authorized real table response found both
  image cells in order and correctly left them unreviewed without a selections
  file. It did not generate real cards or silently use whole images as answers.
- Official Lark `docs +script init-draft` with the knowledge contract, then
  `parse` on the template: assessment `passed`. `docs +create` succeeded as user;
  full fetch verified one table, four rows, three cells per row and no images.
- Install equality, local reference links, UI metadata, template source/remote
  structure, document links and whitespace checks are repeated before publication.
- Installed-package verification followed the captured
  `2026-11-01T20:36:26+08:00` clock: all 50 tests passed again with bytecode writes
  disabled; Skill structure passed; all 10 source/installed files matched.
  `/tmp/recall-screenshot-skill-check-20261101.py` verified local reference links,
  metadata, punctuation and both 3x4 templates, plus release-index/record links.
  `git diff --check` and staged diff checks passed.
- At `2026-11-01T20:37:38+08:00`, removed only the task-generated Lark draft
  workspace after successful creation/fetch. The live template, temporary
  read-only verification evidence and previous Skill backup were retained.
- Windows Obsidian vault and Graphify are unavailable on this Mac. State the
  limitation and route through the project handoff/map plus targeted inspection.
  No product code was edited, so no graph update is possible or needed here.
- No app lint/build/browser/physical-iPhone acceptance is claimed for this
  private Skill and documentation task. No PWA deployment or real APP import.
- Default visibility of the new document was not independently audited; no
  permission/share settings were altered. Source screenshots remain private-local.

## Publication And Compatible Recovery

- Documentation source:
  `9064ee27feb56250c803b30bef6435582bc50245`. At the captured
  `2026-11-01T20:37:14+08:00` clock, normal `git push origin HEAD:main` succeeded
  (`1dc2c66..9064ee2`). Independent `git ls-remote origin refs/heads/main`
  matched the full record SHA. Only the sanitized record and index were staged.
- Evidence follow-up: documentation-only update to this record/index; final
  SHA and observed push result are reported in chat without another recursive
  self-describing commit. No app deployment follows this evidence update.
- App deployment: not applicable; keep `https://recall-memory.pages.dev/` and
  its existing bundle unchanged.
- Previous production evidence, not revalidated by this task:
  [raised WeRead dock release](./20261101T193000+0800-weread-raised-dock.md)
  records source `f419d7ae9bda0c94eb675e9d3e50eb263d95f03a` and deployment
  `5f34b25a-5e6d-4d5c-ab36-c5f7c4900389`.
- Recovery: restore only the affected personal Skill files from its preserved
  local backup if needed. For published documentation, use a scoped corrective
  commit, never history rewriting. The template can remain unused; deletion or
  permission changes require a separate explicit request. No application/data
  rollback is needed or authorized by this task.
