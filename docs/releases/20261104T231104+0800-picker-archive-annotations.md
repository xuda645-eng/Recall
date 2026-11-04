# Review picker and archive annotation refinements

## Identity And Scope

- Record created: 2026-11-04 23:11:04 +08:00.
- Status: source pushed and production deployed; public assets verified,
  browser validation partially recovered with transport/readiness failures.
- Repository: `xuda645-eng/Recall`, branch `main`, starting HEAD
  `06fd71a654682d0d805272c2115a35bc4edb8f80`.
- Production origin remains `https://recall-memory.pages.dev/`.
- Previous production: `42cff2af-bd29-4900-b851-51361b20f742`, source
  `9d6c0bd6`, deployment URL `https://42cff2af.recall-memory.pages.dev/`.
- Final bundle version: `1.0-20261104-2318`.
- Published source and actual deployment outcomes are recorded below.

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

## Publication Outcomes

- Source commit: `888360c9d5279cfbff1c93c99d8313e6d386a499`, created at
  2026-11-04 23:27:24 +08:00. Normal `git push origin main` succeeded:
  `06fd71a6..888360c9`. No force-push, unrelated work or private-card files.
- The first Git staging command was blocked by sandbox `.git/index.lock`
  permissions. Reran the identical scoped commit/push with approved escalation.
- Deployment command: `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2
  npx --yes wrangler@4.156.0 pages deploy
  /private/tmp/recall-annotation-ui-20261104/dist-final --project-name
  recall-memory --branch main --commit-hash
  888360c9d5279cfbff1c93c99d8313e6d386a499 --commit-dirty=false
  --commit-message 'feat: refine review picker and archived item actions'`.
- Deployment completed at 2026-11-04 23:29:40 +08:00. Full deployment ID:
  `a5dc808c-7b1c-4777-8474-3154484d21f9`; deployment URL:
  `https://a5dc808c.recall-memory.pages.dev/`. Wrangler confirms production
  branch `main` and source `888360c`. Stable origin is unchanged.
- The frozen clean bundle uploaded 28 changed files and reused 175 existing
  files. The unchanged Functions source compiled and existing production
  bindings were reused; no migration or library mutation was performed.
- Public static verification: `node
  /private/tmp/recall-annotation-ui-20261104/verify-public.mjs` matched all
  203 publicly served files byte-for-byte using SHA-256, including HTML,
  manifest/icons, CSS/JavaScript and Service Worker. Nine bounded fetch retries
  were needed; no final mismatch or missing file. Public version is
  `1.0-20261104-2318`; anonymous `/api/auth/me` remains HTTP 401.
- Public browser command uses the same guarded temporary config, final clean
  bundle and browser executables with `RECALL_URL=https://recall-memory.pages.dev/`,
  `--grep '批注修订|PWA部署路径'` and two workers. Every mutation uses an isolated
  synthetic local snapshot without owner credentials. WebKit's PWA offline
  case uses the stopped-local-server fallback, not the public origin.
- First public browser run: 5/10 passed in 16.3 minutes. Both picker cases,
  WebKit concurrent-scope rejection, Chromium public-origin offline reopening
  and WebKit local offline fallback passed. Three cases failed before archive
  operations at Service Worker control readiness; both single-card cases
  failed before application visibility. These are failed checks, not passes.
- First recovery: the identical folder/single-card cases with `--workers=1
  --trace=on` finished 2/4 passed in 10.4 minutes. Both folder cases passed all
  assertions, including deletion cancellation, confirmation and persistence.
  Chromium single-card readiness timed out before the app was visible;
  WebKit single-card navigation timed out before `domcontentloaded`.
- Chromium's retained recovery trace shows HTTP 200 static asset requests
  taking 54-79 seconds, exceeding the existing 30-second visible-app readiness
  window. No source or assertion changes were made for that run. Anonymous
  session requests return the expected HTTP 401. Public connectivity and cold
  cache readiness remain under investigation; do not infer a clean aggregate
  pass from successful individual recoveries.
- Anonymous comparison probe: `RECALL_CHROMIUM=<installed Chromium>
  node /private/tmp/recall-annotation-ui-20261104/public-sw-probe.mjs
  https://42cff2af.recall-memory.pages.dev/ https://recall-memory.pages.dev/`.
  The prior deployment reached active Service Worker control at 23:54:10
  +08:00, about 86 seconds after navigation started. The stable origin's next
  navigation returned `net::ERR_TIMED_OUT` with zero HTTP responses before
  application execution. This establishes transport/readiness failures in
  the probe, not a JavaScript archive-action failure. It does not establish
  reliable public cold-start performance or physical phone acceptance.
- Final bounded recovery uses the same tests and bundle through
  `playwright-public-slow.config.ts`, `--grep '批注修订：单张归档卡片|批注修订：确认后缓存'
  --workers=1 --trace=on`. Only time limits differ: 180-second expectation
  waits and 600-second test limit, with zero automatic retries. No assertions,
  application source, security guards or cache contents were bypassed.
- The longer-wait recovery made no progress beyond its first case for 6.5
  minutes. At 2026-11-05 00:02 +08:00, interrupted only its identified
  Playwright CLI process with SIGINT, preserving diagnostics. Exit 130;
  one case interrupted and three not run. This is not a passing check.
- A final diagnostic run targets the exact current production deployment URL
  `https://a5dc808c.recall-memory.pages.dev/`, with the original time limits,
  same four single-card/concurrent-scope cases, one worker and retained trace.
  This is an alternate verification host for the same published source, not a
  production-origin switch. The first Chromium single-card case failed after
  five minutes at `sw-control`, before seeded archive operations. Retained
  diagnostics show the app visible, Service Worker still installing, 83 cache
  entries and 19 missing required shell entries. Interrupted only this run's
  identified CLI with `kill -INT 29569`; final outcome: one failed, one
  interrupted and two not run, exit 130. No pass is claimed for this attempt.
- Public browser coverage across all attempts: six distinct direct-public
  cases passed (both pickers, both folder-menu cases, WebKit concurrent-scope
  protection and Chromium public offline reopening). WebKit offline reopening
  passed only on the isolated local fallback. Three direct-public cases remain
  unverified: both single-card flows and Chromium concurrent-scope protection.
  All corresponding final-bundle local cases passed, but that does not replace
  public acceptance. There was no clean all-public aggregate pass.
- Stable-origin version recheck at 2026-11-05 00:06:54 +08:00:
  `curl -L --fail --connect-timeout 10 --max-time 20 -sS
  https://recall-memory.pages.dev/version.json`, HTTP 200 in 2.659 seconds,
  version `1.0-20261104-2318`. Static identity, successful public folder/offline
  checks and local regressions do not prove reliable cold-start connectivity.
- No archive-action or asset-integrity regression was observed. The retained
  failures occur at transport/application readiness or incomplete Service
  Worker installation, before the new single-card operations. This does not
  prove the absence of every production regression. No automatic asset or data
  rollback was performed; compatible rollback instructions remain above.
- Delivery state as of 2026-11-05 00:10:45 +08:00: requested source/UI changes
  are published; complete public browser and physical iPhone acceptance remain
  open. Owner data was never used for mutation tests. Documentation-only
  evidence follow-up is ready for validation and normal push, without another
  app deployment.
- Final read-only hosting check: `CLOUDFLARE_ACCOUNT_ID=<verified account>
  npx --yes wrangler@4.156.0 pages deployment list --project-name recall-memory`
  still lists `a5dc808c-7b1c-4777-8474-3154484d21f9` as production `main`, source
  `888360c`. Remote main still matches the full source SHA. The follow-up changes
  only this release record and its index; 67 Markdown local links resolved and
  `git diff --check` passed. Its commit/push outcome is reported in the chat;
  documentation publication does not replace the deployed application bundle.
