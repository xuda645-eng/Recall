# Combined Learning Sources Skill

## Identity And Scope

- ID: `20261103T103935+0800-combined-learning-skill`.
- Timezone: Asia/Shanghai. First captured task clock:
  `2026-11-03T10:39:35+08:00`; the exact initial request time was not captured.
- Request: integrate same-training highlighted cloud documents and red-frame
  screenshot learning notes into one learning-oriented QA set, with illustrated
  and text-only cards in a single import file.
- Status: implemented privately, validated and installed. Sanitized record
  published; no application deployment is part of this task.
- Installed at `2026-11-03T10:50:30+08:00`.
- No product UI, database, cloud resource, credential, real card or remote
  learning document was modified. The user confirmed that concurrent WeRead
  work belongs to another chat and must be left untouched.

## Changes

- Keep the user's chosen route: export Minutes into a cloud document and mark
  the selected text yellow. Do not restore the canceled raw-Minutes mode.
- Read each supplied document through its original yellow or screenshot
  contract. Confirm the same-topic relationship and final import hierarchy.
  Unmarked text and material outside red frames remain context, not answers.
- Build a unified learning path before writing cards: background/problem,
  concepts and relations, mechanism and supported reasons, dependencies,
  differences and boundaries. Merge duplicate facts and complementary evidence
  under a coherent learning goal instead of concatenating independent batches.
- The dedicated combined mode permits synthesized answers grounded in selected
  evidence. Append each source's original highlighted text or visually reviewed
  screenshot transcription, URL and revision. Do not invent causal explanations,
  silently resolve source conflicts or substitute unchecked OCR for visual review.
- Namespace refs by real document ID, selection mode and block ID. Source aliases
  or ordering do not determine identity. Content versions bind the full source
  set, image decisions and reviewed transcription.
- Stable topic/unit keys preserve card IDs across reordered or supplementary
  sources. Explicitly confirmed IDs can reuse cards from the supplied documents'
  local historical batches; unknown APP IDs are not guessed.
- Package illustrated and text-only cards together. Attach only images bound to
  a card's screenshot evidence; unrelated images are omitted. Match every image
  by document ID, image block ID and reviewed hash, then deduplicate by bytes.
- Preserve the single-source workflow. Add per-package illustrated/text-only
  counts and enforce final card/Markdown limits, including citation/image text.
  Final media-package parser verification remains mandatory before delivery.

## Private Artifacts And Installation

- Local mirror: `skills/lark-yellow-to-recall/`.
- Installed package: `/Users/bytedance/.codex/skills/lark-yellow-to-recall`.
- Original complete installed package preserved at
  `/private/tmp/recall-combined-skill-20261103/installed-before`.
- Nine intended files differ: `SKILL.md`, `agents/openai.yaml`,
  `references/combined-sources.md`, `references/media-package.md`,
  `references/recall-format.md`, `scripts/combined_batch.py`,
  `scripts/media_package.py`, `scripts/recall_batch.py`, and
  `scripts/tests/test_combined_sources.py`.
- Package SHA256 over the sorted file/hash mapping:
  `68033b4a506dddd32082bc14a7cb25906effaa0fbc993f004ab9b89f6a987947`.
- Before installation, the live package matched the backup. After installation,
  `diff -qr` confirmed the installed package equals the updated local mirror.
- The existing `.git/info/exclude` excludes new private Skill resources. Do not
  force-add them or publish a partial tracked Skill without its dependencies.
  Keep this complete Skill update private-local, including six tracked mirror
  modifications; publish only this sanitized record and release-index entry.
  No private learning links, images, source responses or card files are published.

## Validation

- Windows Obsidian Home/Project Map and `graphify` were unavailable on this Mac,
  disclosed earlier in this chat. Used the session handoff and directed Skill,
  parser and media-package inspection. No Graphify update could run.
- Initial combined tests exposed a test-output parsing problem:
  `JSONDecodeError: Extra data`, because Vite emitted diagnostic stdout around
  the single JSON media-validator report. Selecting the last line also failed
  when diagnostics followed the report. Recovery selects exactly one report
  with the validator's known status and still requires exit code zero.
- Recovery focused suite: 16 passed, no skips. Exact command:

  ```bash
  PYTHONDONTWRITEBYTECODE=1 RECALL_PROJECT=/Users/bytedance/Documents/CodexProject/Recall/Recall-next python3 -m unittest discover -s skills/lark-yellow-to-recall/scripts/tests -p test_combined_sources.py -v
  ```

- Installed full suite: 68 passed, no skips, including all 52 original checks.
  Exact command:

  ```bash
  PYTHONDONTWRITEBYTECODE=1 RECALL_PROJECT=/Users/bytedance/Documents/CodexProject/Recall/Recall-next python3 -m unittest discover -s /Users/bytedance/.codex/skills/lark-yellow-to-recall/scripts/tests -v
  ```

- Synthetic end-to-end checks run the actual combined archive CLI, actual
  Markdown parser, `parseMediaPackage`, first/repeated import and explicit-update
  progress safeguards, without accessing a real database. A two-card package
  contains one illustrated and one text-only card. Cross-document image-key
  collisions, byte deduplication, source/ref/version/hash failures, irrelevant
  images, source conflicts, immutable archives and package/card limits are covered.
- Installed Skill structure passed:

  ```bash
  UV_CACHE_DIR=/private/tmp/recall-combined-skill-20261103/uv-cache PYTHONDONTWRITEBYTECODE=1 uv run --no-project --with PyYAML python /Users/bytedance/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/bytedance/.codex/skills/lark-yellow-to-recall
  ```

- Package preservation, exactly nine changed artifacts, seven local Skill links
  and prose punctuation passed:

  ```bash
  PYTHONDONTWRITEBYTECODE=1 python3 /private/tmp/recall-combined-skill-20261103/verify_skill.py /Users/bytedance/.codex/skills/lark-yellow-to-recall
  ```

- `git diff --check` passed. Sanitized record/index link and staged diff checks
  are repeated before publication.
- No real training batch was generated. Semantic learning quality on actual
  material, browser image decoding and physical iPhone import remain unverified.
  Synthetic structure/progress checks are not semantic or phone acceptance.
- App lint/full app tests/build/mobile release acceptance and cloud D1 checks
  are not applicable: no app code or deployment is included in this task.

## Publication And Recovery

- Subsequent authorization: on `2026-11-04` the user requested committing all
  outstanding source changes after identifying the six tracked Skill edits as
  formal source, not scratch artifacts. The complete nine-file source upgrade
  is now covered by the [Skill source commit](./20261104T005129+0800-skill-source-commit.md)
  record. This supersedes the private-local source publication restriction
  above, but not the exclusion of private learning material and generated cards.
- Publication checkout baseline:
  `9953836750e0ff856c02afc57c4470d395bca307`, `xuda645-eng/Recall`, `main`.
  This SHA is the inspected repository baseline, not the private Skill's source
  commit. The private implementation is identified by the artifact hash above.
- Documentation source: `6d0ab0598de14ced381942cf404f66e9830f17b8`.
  Normal `git push origin HEAD:main` succeeded (`89f2243..6d0ab05`), and
  independent `git ls-remote origin refs/heads/main` matched the full SHA at
  `2026-11-03T11:00:34+08:00`. Only this record and `docs/RELEASES.md` were
  committed from the isolated checkout; private Skill resources were not pushed.
- Initial sandboxed push failed with keychain status `-67674` and
  `could not read Username ... Device not configured`. The first escalated
  permission review timed out before execution; one permitted identical retry
  used existing system Git credentials and succeeded. No credential/auth changes.
- This outcome/index update is a documentation-only follow-up. Its final SHA
  and observed push result are reported in chat rather than recursively committed.
  Installed full-suite validation was 68 passed, no skips; the installed package
  still exactly matches the private local mirror at the publication check.
- Before publication the isolated checkout fast-forwarded to
  `89f2243eb6c8cb8db5d154d0ffadc09b1439bbd9`. Reapplying this task's saved
  index insertion conflicted with another chat's completed-release row;
  resolution preserves that newer row verbatim and adds only this task's row.
  The original working tree and its concurrent changes were not synchronized.
- Production remains `https://recall-memory.pages.dev/`. Deployment ID/URL and
  post-deployment verification: not applicable; no app bundle is replaced.
  Previous production identity was not queried or revalidated for this local
  Skill task, and must not be inferred from historical records.
- Recovery: after checking for newer Skill edits, restore only these nine
  affected paths from the private backup; remove the three newly added resources
  only if they still belong solely to this update. Correct public documentation
  with a scoped new commit, never history rewriting. No data or app rollback.
