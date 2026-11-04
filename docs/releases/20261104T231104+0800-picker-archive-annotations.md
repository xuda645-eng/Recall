# Review picker and archive annotation refinements

## Identity And Scope

- Record created: 2026-11-04 23:11:04 +08:00.
- Status: all local validation passed; source publication and production deployment pending.
- Repository: `xuda645-eng/Recall`, branch `main`, starting HEAD
  `06fd71a654682d0d805272c2115a35bc4edb8f80`.
- Production origin remains `https://recall-memory.pages.dev/`.
- Previous production: `42cff2af-bd29-4900-b851-51361b20f742`, source
  `9d6c0bd6`, deployment URL `https://42cff2af.recall-memory.pages.dev/`.
- Final bundle version: `1.0-20261104-2318`.
- Source SHA, push outcome, deployment ID and completion time will be appended
  after the actual publication. No unpublished result is claimed as deployed.

## Changes By Browser Comment

- Comments 1 and 2: remove the repeated selected-folder, old/new batch and
  duration summary. Keep only the centered confirmation button and append the
  actual selected round count, such as `确认开始复习（10）`. New-only learning
  also shows its count. Ungraded browsing stays explicitly ungraded.
- Comments 3 and 4: remove the extra child-folder hint, put metric values and
  labels on the same line, and reduce row padding and gaps. Normal parent and
  child rows have equal compact heights. Long names truncate visually but
  keep the complete accessible name; narrow and enlarged text may wrap metrics
  rather than overflow. Hierarchy expansion and selection remain separate.
- Comments 5 and 9: the shared sheet close control uses an 18px thin icon,
  muted color and a transparent circular surface. Retain a 44px touch target,
  visible keyboard focus, all dismissal paths and focus restoration.
- Comment 6: remove the repeated archived-folder name from its path subtitle.
  Show the ancestor path only when the archived folder has a parent.
- Comments 7 and 8: both archived folders and individual archived cards use a
  three-dot action menu with `移出归档（恢复）` and `彻底删除`. Folder restoration
  still confirms the subtree scope. Empty inherited archived folders have a
  menu, disabled restoration and an explicit deletion option.
- Permanent deletion requires typing `删除` and freezes the confirmed scope
  when opening the form. State or membership changes disable deletion until
  the user cancels and confirms again. Card deletion rechecks its archive
  timestamp and removes that card's review logs. Folder deletion rechecks that
  the entire subtree is archived and that the confirmed folder/card membership
  is unchanged; delete the subtree, affected cards/logs and folder-specific
  study sessions only. Other cards, settings and unrelated history remain.
- Use the existing serialized snapshot writer and cloud journal. Unit checks
  verify that confirmed deletions produce revision-checked cloud tombstones.
  No API, database schema, D1 migration, credentials, hosting binding, paid
  resource or origin changes.
- Existing backups and attachment storage are not erased. This is removal from
  the active library, not secure erasure of all historical copies. Test deletion
  operates only on isolated synthetic fixtures, never the owner's library.

## Validation And Recovery

- Bootstrap: the specified Windows Obsidian vault and `graphify` are unavailable
  on this Mac. Used `SESSION_HANDOFF.md` and the architecture table for targeted
  routing. No graph update or vault mirror synchronization was possible.
- Focused unit command: `node node_modules/vitest/vitest.mjs run
  src/lib/memory-archive.test.ts
  src/components/__tests__/memory-review-deck-picker.test.tsx`, 25/25 passed.
- Full app unit command: `node node_modules/vitest/vitest.mjs run`, 96 files,
  1592 tests passed. Full lint: `node node_modules/eslint/bin/eslint.js .`,
  zero errors and 132 existing warnings. Focused lint and diff checks passed.
- Types: `node node_modules/typescript/bin/tsc -b --noEmit` and
  `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json` passed.
- Cloud command: `node node_modules/vitest/vitest.mjs run --config
  cloud-tests/vitest.config.ts`, five files, 382 tests passed on synthetic
  SQLite-backed fixtures. No remote D1 mutation or schema deployment.
- Initial build: `RECALL_BUILD_VERSION=1.0-20261104-2301 node
  node_modules/vite/bin/vite.js build --mode production --outDir
  /private/tmp/recall-annotation-ui-20261104/dist`, passed, 163 precache entries.
  The existing large-chunk warning remains. Did not rebuild any served `dist/`.
- After the final scope-freezing refinement, reran full lint/types and all 1592
  app tests successfully. A rebuild into the existing external output left old
  hashed assets and produced 187 precache entries. Detected this before any
  publication and rebuilt into a fresh output directory instead, without
  removing or modifying a served bundle.
- Final clean build: `RECALL_BUILD_VERSION=1.0-20261104-2318 node
  node_modules/vite/bin/vite.js build --mode production --outDir
  /private/tmp/recall-annotation-ui-20261104/dist-final`, passed with 163 precache
  entries. This frozen bundle is the only publication candidate.
- Browser command uses `node scripts/run-playwright.mjs --config
  /private/tmp/recall-annotation-ui-20261104/playwright.config.ts`, the same
  frozen external bundle, `RECALL_E2E_BUILD_DIR` pointing to it, local port
  4213, Chromium 1223, WebKit 2272, and two workers. Logs and synthetic
  screenshots remain local under `/private/tmp/recall-annotation-ui-20261104/`.
- The sandbox attempt returned `RECALL_BROWSER_SANDBOX` before browser launch.
  Reran through approved unsandboxed execution. The stock global setup then
  failed with `verifyBrowserRuntime` missing from Playwright's imported module.
  Recovered through a temporary native Node preflight child using the same
  existing verifier, one startup check per engine and the unchanged guard.
  No OS security or repository test launcher changes.
- First focused browser run: 10 passed, six failed. Two old summary assertions
  referenced the intentionally removed footer; four new assertions expected
  byte-identical settings despite the existing first-write default shortcut
  normalization. Updated the assertions to the counted button and preservation
  of every pre-existing preference. No application behavior was weakened.
- Final focused browser run: 16/16 passed in 35 seconds, including compact
  equal-height rows, inline metrics, centered count, close touch target,
  hierarchy/focus, safe areas, new-only and ungraded modes, restore scope,
  deletion cancellation, confirmation and persistence. Visually inspected
  synthetic WebKit picker and archive menu screenshots.
- Initial full mobile run: 112/112 passed in 3.6 minutes. After the additional
  scope-freezing safety change, `--grep '批注修订'` against the final clean bundle
  passed 8/8 in 20.1 seconds, including an injected synthetic cache update
  between confirmation and commit; no newly added content was removed.
- Documentation check: 67 local Markdown links resolved with no missing files.
  `git diff --check` passed. Remote main matched the starting HEAD before
  publication; no divergence or unrelated changes were incorporated.
- Final full mobile run against `dist-final`, without grep or automatic retries:
  114/114 passed in 3.5 minutes. Covers homepage, hierarchy, import/update,
  long reading, rating/undo, statistics, editing, archive/deletion, drawer,
  focus, safe areas, narrow widths/breakpoints, landscape/desktop, Service
  Worker activation/update and local offline persistence. WebKit local offline
  fallback is not proof of public-origin offline behavior.
- Public validation outcomes are pending below. Browser simulation is not
  physical iPhone acceptance. This release needs a phone
  refresh and user review of the nine refinements before claiming that result.
- Read-only hosting checks verified the existing account and `recall-memory`
  project. An npm cache EPERM on a later deployment-list read was recovered
  through approved unsandboxed execution; no cache purge or permission changes.

## Rollback And Data Safety

- If this bundle regresses, recheck current production ownership, then use the
  existing Pages project's compatible prior deployment `42cff2af-bd29-4900-b851-51361b20f742`.
  Verify the stable origin and update behavior; do not force-push or reset D1.
- The prior bundle lacks these UI refinements but uses the same snapshot/schema
  and remains compatible. Asset rollback does not resurrect confirmed deleted
  cards, logs or folders, erase tombstones or restore backups automatically.
- Keep local/cloud libraries, backups, attachments and device credentials intact.
  Data restoration or destructive database operations are outside this release.
