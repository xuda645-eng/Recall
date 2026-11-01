# WeRead Highlight Grouping

## Identity And Scope

- Record time: `2026-11-02T01:00:00+08:00`, Asia/Shanghai.
- Role: explicitly enabled parallel developer task. Pending integration,
  unpublished to main and production.
- Worktree: `/private/tmp/recall-weread-endpoint-20261102`.
- Branch: `codex/weread-endpoint-20261102`.
- Application baseline: `1c64e517c9ce4030895073ce6e2ec16958c95fda`.
- Prerequisite handoff: `de8525b022b85de6ffd93d0204024aea29f3f052`.
- Implementation and preview source SHA:
  `f91c013967398af14c74bb521f6fb11ad40a44e2`.
- Shared release index is reserved for the integration owner. Unrelated dirty
  changes in the original supplied worktree were preserved without modification.
- No production deployment, production secret change, D1 migration, owner
  library mutation, new resource, scheduled task or history rewrite.

## Changes

- Add optional smart grouping alongside the existing single-highlight path.
  Sort originals by reliable chapter sequence and numeric position, not API
  array order or annotation creation time. Missing/ambiguous positions block
  grouping rather than fabricating an order.
- Model receives short numbered originals and returns only contiguous ID groups
  with one question. Strict parsing rejects missing, duplicated, unknown or
  reordered IDs, unsafe questions and oversized groups before persistence.
- Same-book/same-chapter groups contain 1-4 selected highlights. Model batches
  contain at most 12 highlights and 6000 characters, with the last group held
  for overlapping context across a long chapter's batch boundary. Finished
  groups are retained and each original is committed once.
- Model prompt v3 prioritizes complete knowledge units without mandating a
  compression ratio. Original text is not generated or rewritten. Preserve
  whitespace, CRLF and each segment, with separate visual segment labels.
- Add protected `/api/weread/merge`, device/origin gates, shared 300/day and
  120/hour budgets, failure counting and seven-day space/EP/version/input cache.
  Model output is bounded at 4096 tokens; existing single questions remain 384.
- Preview grouping before writing. Edit questions, split a group or combine
  adjacent same-chapter groups without more model calls. Manual regrouping
  produces labeled generic recall tasks, not falsely attributed AI questions.
- Add seven-day local merge drafts, explicit resume after refresh, transactional
  persistence and revision/Web Lock conflict checks. No automatic retry or
  import of partial generation. Recheck sources before model calls and imports.
- Preserve existing cards, schedules, history and archive state. Never regroup
  old single cards; existing group sources do not reappear as duplicate singles.
  Group identity is compact SHA256 over book and ordered stable source IDs.
- Extend provenance and cloud validation for ordered original segments. Preserve
  answers on question editing and prevent Markdown replacing grouped originals.
  Cards from the same import use source-position ties rather than hash order.
- Add an explicitly synthetic, prewritten no-AI demo for isolated previews.
  Production EP activation remains the integration owner's work; the requested
  `ep-20261102000025-wt6tl` was used only for authorized direct local validation.

## Real Book Validation

- User explicitly requested `Token经济`. Read its notebook entry and its own
  highlights through the documented WeRead gateway. Found 122 highlights in 22
  chapters, all with positions; the response array was not in text order.
- Private inputs, source IDs, candidates and review files remain outside Git at
  `/private/tmp/recall-token-merge-private-20261102/`, restricted file permissions.
  No private excerpt or real-book screenshot is placed in the public preview.
- First pass: 25 requests, all 122 originals processed into 113 cards. Exact
  originals and order passed, but grouping was overly conservative.
- Second pass with a stronger knowledge-unit prompt: 9 successful requests
  processed 41 originals into 31 cards; request 10 failed partition validation.
  Failure stopped the run without library writes; do not count it as a pass.
- Final short-numbered prompt v3: 25 successful requests, 122 originals into 89
  candidates. Sizes: 59 singles, 27 pairs and 3 triples. No missing/duplicate
  originals, correct source order, byte-for-byte strings retained.
- Read all 30 multi-highlight groups. Flagged 4 groups for manual splitting:
  unrelated praise topics, three independent topics, an unsupported inferred
  relation, and two independent cost-framework questions. The private reviewed
  alternative contains 94 cards with exact originals/order. Generic tasks for
  manual splits still need specific user questions. Not every singleton question
  received a full semantic audit. Model grouping is not guaranteed correct.
- Final pass reported 23512 input tokens and 3871 output tokens. Across all three
  passes, 60 model attempts were made, including the rejected response. These
  direct user-authorized checks do not update the app's production D1 counters;
  no counter reset or bypass of app request handling was shipped. Monetary cost
  is unknown and no free-inference claim is made.
- All real-book work was candidate validation only: zero owner-library writes,
  no automatic APP import, production changes or account-wide whole-book sync.

## Validation

- Windows vault and Graphify are unavailable here. Used the provided owner map
  and targeted source routes; no Graphify update is claimed.
- Offline frozen install failed on missing cached package metadata after package
  materialization. Recovery `pnpm install --frozen-lockfile` passed; lockfile
  unchanged. No formatter or package upgrade was introduced.
- Final app tests: `pnpm test`, 85 files and 1519 tests passed.
- Final cloud tests: `pnpm test:cloud`, 4 files and 355 tests passed.
- `pnpm lint`: 0 errors and 132 existing warnings. `pnpm exec tsc -b` and
  `pnpm typecheck:cloud` passed.
- `RECALL_BUILD_VERSION=1.0-20261102-0100 pnpm build` passed, root path `/`,
  160 PWA precache entries. Existing large-chunk warnings remain, not errors.
- `node scripts/weread-merge-runtime-probe.mjs --runtime-modules /Users/bytedance/.npm/_npx/d77349f55c2be1c0/node_modules`:
  17 local workerd checks passed, runtime `1.20261023.1`. All 38 synthetic Ark
  responses intercepted; zero external calls and ephemeral D1 only. Auth,
  redirects, cache isolation, failed attempts, UTC budget and grouped sync were
  exercised without touching the real library.
- Existing PWA regression: 74 Chromium/WebKit checks passed at 393x852, DPR 3,
  including safe areas, navigation, Markdown, rating/undo, offline and update.
  This run preceded final grouped-answer editing guards and synthetic demo.
- Final regression rerun first returned 73/74: one archive test stopped before
  actions at `Readiness: sw-control`, with `sw.js` served as `text/html`.
  A production build was writing the same `dist/` concurrently with that test
  server, a likely test-artifact race rather than demonstrated app regression.
  Recovery ran `pnpm test:e2e --workers=2` serially, with both cached browser
  paths and no concurrent build. All 74/74 passed on the final product patch.
  Evidence: `/tmp/recall-merge-pwa-final-20261102.log` (failed attempt) and
  `/tmp/recall-merge-pwa-serial-20261102.log` (serial recovery). Do not run a
  build into a directory while a validation server is serving that directory.
- Initial smart-grouping E2E: 6/8 passed; two failures were a wrong list CSS
  selector. Corrected it and verified 8/8, then 10/10 with the synthetic preview.
  Final `pnpm test:e2e --config e2e/weread-merge.config.ts`: 10/10 passed,
  including grouped question editing, read-only answers, CRLF preservation,
  source-ordered reading, safe areas and the no-AI demo. The added edit test
  initially missed the menu's separate edit button; fixed that test step and
  reran all 10 successfully. All are browser simulations, not physical iPhone
  acceptance.
- Browser launcher first rejected Seatbelt safely. Approved unsandboxed retry
  found a test-server cwd error; fixed it. Two later approval requests timed
  out; no browser protection was bypassed. A subsequent approved guarded run
  succeeded. All failed/interrupted attempts remain distinguished from passes.
- No true installed-iPhone acceptance, production Worker egress, cross-device
  real-library mutation or private-book browser import is claimed.

## Preview And Integration

- Existing Cloudflare account/project confirmed read-only. Preview config has
  `RECALL_SPACE_ID=preview-disabled`, no D1 bindings and no preview secrets.
  Secret-name listing first hit sandbox npm-cache EPERM; escalated read-only
  recovery succeeded. No cache ownership/security setting was modified.
- Before preview publication at `2026-11-02T01:03:24+08:00`, production listing
  showed `dd286cc8-ab18-4ec5-92e5-e31dd9b3c92d`, source `59f70c5`, on `main`.
  This observation is not this task's production release or rollback target.
- Implementation committed at `2026-11-02T01:05:28+08:00`. Initial normal
  `git push origin codex/weread-endpoint-20261102` could not read HTTPS username
  under the sandbox. The exact escalated retry succeeded, moving the remote
  task branch from `de8525b` to `f91c013`; read-only `git ls-remote` confirmed
  the full source SHA. No force push, main push or unrelated files included.
- Rebuilt only after the serial PWA tests completed:
  `RECALL_BUILD_VERSION=1.0-20261102-0100 pnpm build`. All 202 output files
  were hashed, and deployment privacy scanning found no live endpoint,
  real-book ID, credentials or private card content. Working tree was clean.
- Preview deployed using Wrangler 4.156.0 and the verified existing account,
  `pages deploy dist --project-name recall-memory --branch codex-weread-merge-20261102 --commit-hash f91c013967398af14c74bb521f6fb11ad40a44e2`.
  No `--commit-dirty=true` or source-map upload. Wrangler's warning about the
  intentionally omitted preview D1 binding was retained; no binding was added.
- Preview deployment ID: `f0b1de97-3505-4967-857a-9bc80bed34fe`.
  Fixed URL: <https://f0b1de97.recall-memory.pages.dev>.
  Task alias: <https://codex-weread-merge-20261102.recall-memory.pages.dev>.
  Cloudflare listing confirmed `Preview`, unique non-main branch and source
  `f91c013`. Production listing still showed
  `dd286cc8-ab18-4ec5-92e5-e31dd9b3c92d` / `59f70c5` after this deployment.
- Preview cloud features stay unavailable. Read-only secret-list recheck first
  hit npm-cache EPERM, then succeeded via approved escalation with zero preview
  secrets. No cache ownership or account security changes were made. Post-deploy
  listing had the same sandbox failure and approved read-only recovery.
- Public core/grouping code, styles, manifest, all eight icons, version and
  Workbox assets returned 200 and matched committed hashes. The first Node
  request timed out, and the first curl script rejected the normal `index.html`
  308 canonical redirect; follow-redirect recovery passed those 16 assets.
  Fixed-domain `sw.js` TLS timed out on three attempts; the same preview's alias
  returned 200 and the exact `sw.js` hash with JavaScript MIME. Version is
  no-store. Alias anonymous auth/sync/books/merge returned 401 without production
  fallback. Logs and JSON: `/tmp/recall-merge-preview-assets-recovery-20261102.log`,
  `/tmp/recall-merge-preview-assets-20261102.json` and
  `/tmp/recall-merge-preview-assets-sw-api-20261102.json`.
- Public Chromium simulation at 393x852/DPR 3 passed synthetic review, question
  editing, split/combine, explicit local demo import, original/order checks,
  safe-area/narrow/breakpoint/landscape geometry, SW control and offline reload
  persistence, with zero model calls. WebKit completed the online actions but
  initially timed out waiting 60 seconds for SW control. A diagnostic 180-second
  recovery obtained control, then `context.setOffline(true)` reload returned
  `WebKit encountered an internal error`. A later fixed-domain online-only run
  completed the same actions but strict page-error checking found a background
  `/api/auth/session` access-control error. No app fix or browser safeguard
  weakening was made. These failed public attempts are not full passes; public
  WebKit offline reopening remains unverified despite local isolated-build PWA
  tests passing. No physical iPhone acceptance is claimed.
- Alias online-only WebKit recheck also completed all demo actions but recorded
  the same background page error. Detailed diagnostics showed cancelled module
  requests and CSS/SW import errors from the smoke script navigating again while
  the first document was still loading. Recovery initializes the synthetic
  snapshot before first navigation instead of immediately reloading. On this
  corrected script WebKit online review/edit/split/combine/import, exact original
  text/order, mobile geometry and zero model calls all passed with zero page
  errors. Evidence: `/tmp/recall-merge-preview-webkit-preload-20261102.log` and
  `/tmp/recall-merge-preview-webkit-browser-20261102.json`. This online pass does
  not erase the earlier failures or verify public WebKit offline reopening.
- Preview steps: open WeRead import, select the explicitly synthetic merge demo,
  inspect 4 originals into 2 groups, edit a question, split/recombine and confirm
  only if you want demo cards stored in that preview origin's local library.
- Preview is available over HTTPS without a login for the synthetic demo. No
  automatic expiry was configured; the fixed deployment remains subject to
  hosting retention, and the unique alias changes only if this task deploys
  again. Device-local demo cards are separate from the production origin.
- Shared interface overlap: `src/types.ts`, `shared/server-validation.ts`,
  `functions/api/[[path]].ts`, WeRead transport/import/job modules, workspace
  sorting/editing and Markdown guard. Integration must combine these additively
  with other tasks; no whole-file ours/theirs selection or old task reapplication.
- Integrator must activate the requested production EP under existing secret
  rules, validate the combined version and publish the exact approved bundle.
  No database migration is required by this task. Preserve production origin.
- Production deployment/previous production/rollback: not applicable to this
  unpublished developer task. Removing a preview does not roll back local cards.
  Future asset rollback does not undo grouped data; old validators lack grouped
  provenance support, so assess compatibility before any production rollback.
- Evidence finalized at `2026-11-02T01:17:43+08:00`; documentation-only follow-up
  is committed/pushed on the same task branch without another app deployment.
  Main and the production endpoint remain unchanged by this task. The app
  implementation and preview are fixed at `f91c013`; follow-up documentation is
  the final branch handoff. Public WebKit offline and physical iPhone acceptance
  remain integration/acceptance limits, not passing release evidence.
- See [import contract](../WEREAD_IMPORT.md), [PWA checks](../PWA.md),
  [hosting](../DEPLOYMENT.md) and [cloud safety](../CLOUD_SYNC.md).
