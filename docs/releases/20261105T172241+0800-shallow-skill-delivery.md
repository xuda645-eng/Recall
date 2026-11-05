# Shallow Skill Import Delivery

## Identity And Scope

- ID: `20261105T172241+0800-shallow-skill-delivery`.
- Started: `2026-11-05T17:22:41+08:00`, Asia/Shanghai.
- Request: make generated import files easy to find inside the Recall project,
  using a shallow location and short topic-plus-date filenames.
- Status: complete; validated, installed and normally pushed to `main`.
- Source baseline: `4bd7fa07a54e82989dbc3a1b867ae8f48e411fb6`, fork
  `https://github.com/xuda645-eng/Recall.git`, branch `main`.
- Skill source, instructions and Git privacy rule only. No app, API, D1,
  credentials, cloud infrastructure or production bundle changes.
- No real learning files are regenerated, moved or imported as part of this
  Skill-maintenance request. Synthetic artifacts remain in temporary projects.

## Changes

- Add `skills/lark-yellow-to-recall/scripts/deliver.py` as the final delivery
  step for yellow, screenshot and combined-source modes.
- Copy final verified artifacts into the project's one-level `待导入/`
  directory. Use names such as `主交互-2026-11-05.recall-media.json` and the
  matching Markdown; cap topic length at 20 characters and use the archive's
  generation date converted to the configured timezone.
- Preserve unique internal archives, stable card IDs, manifests and original
  files. Same-topic/day collisions receive short numeric suffixes; repeated
  delivery of unchanged files reuses the existing output. Markdown splitting
  retains short part suffixes. Changed copies never get silently overwritten.
- Keep `delivery.json` in the internal batch as the mapping and checksum record.
  Do not expose source responses, raw screenshots, plans or review metadata in
  the shallow import folder. Ignore `/待导入/` in Git and enforce that rule in
  Git-backed projects before writing private output.
- Recheck original archive validation and file checksums, then run the current
  actual Markdown/media parsers in memory. Media files must preserve archived
  IDs, questions, paths and answer text, appending only valid image references
  and the expected source link. Validate repeated imports and selected updates
  without reading the owner's database.
- Update Skill instructions and its existing UI prompt to return the primary
  file link and full shallow local directory first. Temporary plans must not
  be described as completed import files. Keep Finder's Go To Folder guidance
  available when needed.
- Original archive/history validation remains unchanged. Delivery checks the
  already-validated batch rather than rescanning unrelated histories; it does
  not repair historical files or silently weaken their checksum gate.

## Validation

- Initial focused command:
  `RECALL_PROJECT=/Users/bytedance/Documents/CodexProject/Recall/Recall-next PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/lark-yellow-to-recall/scripts/tests -p test_delivery.py -v`.
  Nine tests ran: one failure and one error. The temporary fixture used a
  noncanonical macOS `/var` path, and omitted the app's `shared/` dependency.
- Recovery: resolve the fixture root and copy `shared/` alongside `src/`.
  Strengthen the changed-question test to require its specific semantic
  rejection, not merely any parser error. No product code was changed.
- Intermediate full command:
  `RECALL_PROJECT=/Users/bytedance/Documents/CodexProject/Recall/Recall-next PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/lark-yellow-to-recall/scripts/tests -v`.
  77 tests passed in 52.897 seconds with no skips. Final suite adds a mixed
  illustrated/text-only delivery case; its final result is recorded below.
- Structure command:
  `/private/tmp/recall-marked-20261105/validation-venv/bin/python /Users/bytedance/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/lark-yellow-to-recall`:
  passed using the already-created temporary PyYAML environment.
- Final full suite with the same command: 78 tests passed in 66.493 seconds,
  no skips. Log: `/private/tmp/recall-shallow-skill-20261105/tests-final.log`.
  Covers plain and mixed media delivery, timezone conversion, collision suffixes,
  split names, repeated delivery, unchanged archives, rejection of changed
  questions/checksums, symlink destinations and Git privacy gating.
- `node --check skills/lark-yellow-to-recall/scripts/verify_recall.mjs`, Python
  AST checks, installed `deliver.py --help`, and installed Skill structure check:
  passed. No browser process was launched.
- All 18 repository Skill source files match the installed package byte-for-byte.
  Seven Markdown files and 72 local links checked; `git diff --check` passed.
  Checks finished at `2026-11-05T17:32:22+08:00`.
- Windows vault and Graphify are unavailable on this Mac, as disclosed earlier
  in this chat. This task uses the scoped Skill source and release instructions;
  no product search or graph update is needed.
- App lint/unit/build/PWA, production checks and D1 mutation tests are not
  applicable to this Skill-only change. Physical iPhone import is not claimed.

## Publication And Recovery

- Source implementation SHA: `6a3c51770ec304289cdf9cc50440498fdda27504`, committed
  at `2026-11-05T17:34:41+08:00`. Normal `git push origin HEAD:main` succeeded
  (`4bd7fa07..6a3c5177`); `git ls-remote origin refs/heads/main` independently
  matched the full SHA. Publication observed by `2026-11-05T17:35:05+08:00`.
- Exactly 11 reviewed source/docs/privacy-rule files committed. Private batches
  and synthetic artifacts stayed excluded. The existing unrelated
  `prototypes/style-lab/` remains untouched and uncommitted.
- Initial staging returned the local ignored-directory warning and exit code 1
  after staging nine tracked/source-record files. Read-only inspection confirmed
  `.git/info/exclude` hides the Skill directory. Recovery forced only the two
  explicitly reviewed new source/test files, then verified the complete staged
  allowlist, private-source identifier absence and cached whitespace check.
- This publication-outcome update is a documentation-only follow-up; its final
  SHA and push result are reported in chat, without another app deployment.
- Installed target: `/Users/bytedance/.codex/skills/lark-yellow-to-recall`.
  Tool-authorized synchronization succeeded: six affected files backed up and
  updated, two new files installed. Backup:
  `/private/tmp/recall-shallow-skill-20261105/installed-before`.
  Baseline checks confirmed no installed user edits before replacement.
- App deployment: not applicable; unchanged app bundle is not redeployed.
- Stable production origin remains `https://recall-memory.pages.dev/`.
  Last deployment recorded by the preceding app release is
  `9c7d0136-1042-40da-843f-2e6ac9497896`, source
  `8150e1e52cd35e0235b125c6be7f27dfb06c73e5`, version `1.0-20261105-0142`.
  This historical identity is not independently revalidated by this task.
- Recovery: make a scoped source fix/revert commit after checking later changes,
  and separately restore affected installed files from the local backup if
  necessary. Never delete delivered private files, rewrite Git history, reset
  a database or roll back production assets to undo this Skill-only update.
