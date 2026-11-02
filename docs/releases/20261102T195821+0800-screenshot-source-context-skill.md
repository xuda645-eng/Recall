# Screenshot Skill Source Context Reading

## Identity And Scope

- ID: `20261102T195821+0800-screenshot-source-context-skill`.
- Timezone: Asia/Shanghai; first captured task clock
  `2026-11-02T19:58:21+08:00`. Exact initial start time was not captured.
- Request: improve screenshot-to-Recall comprehension by reading the original
  document identified in the learning note's source field.
- Scope: three private-local Skill instruction/template files, installation,
  validation, and this sanitized record/index. Status: validated and installed;
  documentation publication pending.
- No product code, database, real cards, credentials, cloud resources, existing
  Lark document or production deployment is changed by this task.

## Changes

- Default to reading the explicitly designated original document, not only the
  learning note and screenshot image. Inspect structure, matching sections and
  necessary surrounding context; reuse already-read sections within the batch.
- Use official read-only Lark tools and real link/reference metadata. Do not
  guess URLs, search for replacement sources or recursively follow other links.
- Context clarifies questions, terminology, scope, table relations and cross-image
  continuity. Answers still come exclusively from visually verified red-frame
  evidence refs. Do not silently fill unreadable screenshot text from the source.
- Preserve screenshot-era claims and report differences from the current source.
  Source revision is independent of the learning-note revision or screenshot date.
- Record actual source-read status, revision, timezone-qualified read time,
  sections, screenshot correspondence and limitations in existing `scope_notes`.
  The existing archive path retains these notes in manifests and review notes.
- Failed source access is disclosed. Self-contained readable selections can be
  processed with a limitation; ambiguous selections remain unresolved. Missing
  screenshot files continue to block archival. An explicit screenshot-only
  request overrides default context reading.
- Update the local blank template's source-field explanation. Do not modify
  previously created remote templates or retroactively rewrite card batches.

## Privacy And Installation

- The existing private Skill mirror remains ignored by Git. Do not force-add
  Skill files, source documents, screenshot evidence or private links. Only
  this sanitized record and `docs/RELEASES.md` are intended for publication.
- Installed package: `/Users/bytedance/.codex/skills/lark-yellow-to-recall`.
- Local mirror: `skills/lark-yellow-to-recall/`.
- A complete installed-package baseline is preserved privately under
  `/private/tmp/recall-skill-source-context-20261102/installed-before`.
- Change only `SKILL.md`, `references/screenshot-selections.md` and
  `assets/screenshot-template.xml`. Preserve the installed media-package additions
  that are not present in the older local mirror; do not replace the full package.
- Baseline main: `1c64e517c9ce4030895073ce6e2ec16958c95fda`.
  Six unrelated dirty app/test/documentation files were present at the initial
  check and are excluded from this task's edits and commits.
- Installed at `2026-11-02T20:02:05+08:00`. Before installation,
  `diff -qr` confirmed the live package still matched the preserved baseline;
  after installation it exactly matched the edited temporary package.
- Installed artifact SHA256:
  - `SKILL.md`: `a51af3ee8b5cafcd3baab13383d889d826178981ad92d2d4bd15318271d1e60b`.
  - `references/screenshot-selections.md`: `30c03c9564701360303c55d309c9eabbfedaa5d7cf68403bfd58aaeb44713425`.
  - `assets/screenshot-template.xml`: `62c00f3aca62889cfa5f6b2c668dbe1dcd8333420f89423e8c720f2aeb4cf3a4`.
- Remote main was `c267c5d0e7a8b55445e886f4c7b9ec1907a451e3` at the
  publication check, newer than the original dirty worktree. Clone main into
  the task's isolated temporary `publication` directory and publish only the
  sanitized record/index there. Do not rebase, merge or switch the original
  worktree, or overwrite the remote release index with its older local copy.

## Validation

- Windows Obsidian vault Home/Project Map and `graphify` are unavailable on this
  Mac. Disclosed once; used directed Skill/reference inspection. No product code
  edits or Graphify update are needed for this instruction-only change.
- System Python dependency probe `python3 -c "import yaml; import PIL"` failed
  on missing PyYAML. Recovery: isolated `uv run --no-project --with PyYAML
  --with Pillow`, with cache under the task's temporary directory; no system
  dependency installation.
- Temporary updated package tests: 52 passed, no skips. Installed package tests
  repeated after copying: 52 passed, no skips; installed validation completed
  by `2026-11-02T20:03:09+08:00`. Exact installed command:

  ```bash
  UV_CACHE_DIR=/private/tmp/recall-skill-source-context-20261102/uv-cache RECALL_PROJECT=/Users/bytedance/Documents/CodexProject/Recall/Recall-next PYTHONDONTWRITEBYTECODE=1 uv run --no-project --with PyYAML --with Pillow python -m unittest discover -s /Users/bytedance/.codex/skills/lark-yellow-to-recall/scripts/tests -v
  ```

- Skill structure passed for the mirror, temporary edited package and actual
  installed package. Exact installed command:

  ```bash
  UV_CACHE_DIR=/private/tmp/recall-skill-source-context-20261102/uv-cache PYTHONDONTWRITEBYTECODE=1 uv run --no-project --with PyYAML --with Pillow python /Users/bytedance/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/bytedance/.codex/skills/lark-yellow-to-recall
  ```

- Package preservation, all local Skill links, prose punctuation and both blank
  3x4 templates passed. Only the three intended files differ from the baseline.
  Synthetic screenshot archival through the actual parser confirms source-read
  notes persist in manifest/review notes without changing selected answers or
  importing context. Exact installed command:

  ```bash
  UV_CACHE_DIR=/private/tmp/recall-skill-source-context-20261102/uv-cache PYTHONDONTWRITEBYTECODE=1 uv run --no-project --with PyYAML --with Pillow python /private/tmp/recall-skill-source-context-20261102/verify_context_update.py /Users/bytedance/.codex/skills/lark-yellow-to-recall
  ```

- Release links/punctuation and `git diff --check` passed before publication;
  staged checks are repeated in the isolated publication checkout. Link command:
  `python3 /private/tmp/recall-skill-source-context-20261102/verify_release_docs.py <checkout>`.
- No real private document reading or real card regeneration is performed.
  Live end-to-end comprehension and physical iPhone import are unverified.
  Existing script/parser tests are not proof of semantic understanding.
- App lint, broad app tests, production build and browser acceptance are not
  applicable to this private-local instruction/documentation-only task.

## Publication And Recovery

- Documentation source SHA and normal push result: pending.
- Deployment ID/URL, public verification and physical acceptance: not applicable;
  keep `https://recall-memory.pages.dev/` and its existing bundle unchanged.
- Previous production deployment was not queried or revalidated because no app
  deployment is part of this task. Do not infer its current identity from older
  release records.
- Recovery: restore only the three affected installed Skill files from the local
  backup after checking for newer edits; restore the corresponding local mirror
  rules as needed. Correct published documentation through a scoped new commit,
  not history rewriting. No application, database or remote-document rollback.
