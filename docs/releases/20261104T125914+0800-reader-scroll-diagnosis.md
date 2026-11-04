# Answer Reader Scroll Reset Diagnosis

## Identity And Scope

- Task ID: `20261104T125914+0800-reader-scroll-diagnosis`.
- Scope: user-requested investigation of answers jumping to the top while reading. Diagnosis and documentation only; no application fix or deployment in this task.
- Status: two independently reproducible defects confirmed. Diagnostic assertions deliberately verify the current defective behavior; their passing results are not functional acceptance or evidence of a fix.
- First captured investigation timestamp: 2026-11-04 12:56:04 +08:00. Final evidence collection: 2026-11-04 12:59:14 +08:00. Publication outcomes are appended after the documentation push.
- Inspected source: `372732521ff10f83e0fc1d3382290540ab6edea4`, `main`, `xuda645-eng/Recall`. Remote main matched this SHA at discovery and before publication.
- Windows Obsidian Home/Project Map and Graphify were unavailable on this Mac. Used `SESSION_HANDOFF.md`, the provided architecture table, targeted owning-source reads and Git blame. No nested source/test/docs agent instructions were found.

## Findings

### Data refresh restores a stale position without user input

- `src/components/memory-reader.tsx:23` derives a new `ids` array whenever the cards array reference changes, even when card IDs and contents are identical.
- The layout effect at `src/components/memory-reader.tsx:56` depends on this array. Its line 70 unconditionally assigns every mounted panel's `scrollTop` from `views.current`, even when the active card and queue are unchanged.
- Ordinary reading scroll events do not update `views.current`. Positions are saved only by selected actions such as switching cards, opening options, revealing, rating or archiving. The last saved answer offset can therefore remain zero while the reader has scrolled hundreds of pixels.
- `src/services/cloud-sync.ts:145` reloads the local cache through `commitMemory` when a cloud journal exists, before any remote changes are needed. `src/services/memory-actions.ts:33` loads persisted data and publishes the snapshot back to the Zustand store, changing the cards array identity.
- `src/services/cloud-sync.ts:174` routes visible-page resume and online/storage events to synchronization; line 181 polls every 60 seconds. Where synchronization is active and not unauthorized, these are credible triggers for a seemingly automatic jump during reading. This does not mean every user or every minute necessarily triggers a jump.
- Confirmed in both engines by cloning identical card objects, and separately by calling the actual `synchronizeCloud()` against an isolated synthetic cache/journal with no session and no remote changes. In both cases, the same revealed card moved from 500px to 0px; its answer and review logs were unchanged.

### A light touch repeats reveal and clears an already displayed answer

- `src/components/memory-reader.tsx:104` treats a stationary short touch as a reveal action: movement under 8px, duration under 450ms, unchanged scroll position and no text selection.
- `reveal()` at line 88 does not reject an already revealed answer or an excerpt. It sets the saved offset to zero and increments `revision`, triggering the layout effect's scroll assignment.
- This means a light touch during reading can look like an unsolicited jump even though the answer was already visible. Excerpts are affected too.
- Tested vertical reading stayed below the top before the separate light touch. The subsequent browser-native touchscreen tap reset the answer to 0px without changing the card or adding a rating.
- The report alone does not establish which trigger occurred on the user's phone. Both defects are real, and the input-free refresh path is especially relevant to an automatic reset.

## Validation And Recovery

All browser contexts were new, synthetic and credential-free. Every `/api/**` request was intercepted with a synthetic HTTP 401, so no owner-library reads, writes or model requests were sent. Service Workers were blocked for this narrowly scoped diagnosis to isolate reader behavior; offline, installed-PWA and update acceptance are not claimed.

Temporary harness and outputs remain outside the repository at `/private/tmp/recall-reader-diagnosis/`. The custom configuration imports the repository launch guard and uses its existing global browser preflight. iPhone 15 simulation: 393 x 852 CSS pixels, DPR 3, touch/mobile enabled. Chromium vertical scrolling used CDP touch events; WebKit vertical scrolling used synthetic pointer events plus a panel scroll assignment. Both engines used browser-native touchscreen taps. Neither is physical iPhone evidence.

Browser environment used for the successful commands:

```bash
PWTEST_CACHE_DIR=/private/tmp/recall-reader-diagnosis/esm-transform-cache
RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'
```

- Initial command: `pnpm test:e2e --config /private/tmp/recall-reader-diagnosis/playwright.config.ts --workers=2 --output=/private/tmp/recall-reader-diagnosis/local-results`, with the browser overrides above. Failed before testing with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` from pnpm's automatic dependency check. Recovery used `node scripts/run-playwright.mjs` directly, retaining the shipped launch guard and avoiding dependency purge/install.
- The guarded direct command inside Seatbelt failed with `RECALL_BROWSER_SANDBOX` before any browser launch. Subsequent runs used approved `require_escalated` execution, not disabled sandbox markers or security changes.
- First unsandboxed temporary harness failed before tests with `SyntaxError: The requested module './browser-runtime.mjs' does not provide an export named 'verifyBrowserRuntime'`. A fresh transform cache alone reproduced that failure. Inspection confirmed the export exists and that the temporary configuration's CommonJS transform was incompatible with the ESM global setup. Added a private `type: module` package descriptor only in the temporary directory and used a separate ESM transform cache. No repository runtime changes were needed.
- Initial successful local command: `node scripts/run-playwright.mjs --config /private/tmp/recall-reader-diagnosis/playwright.config.ts --workers=2 --output=/private/tmp/recall-reader-diagnosis/local-results`, with the environment above. Six diagnostic assertions passed in 18.7s, zero skips/retries. Both engines confirmed answer tap, excerpt tap and identical-array-refresh resets.
- Public command: `RECALL_URL=https://recall-memory.pages.dev/ node scripts/run-playwright.mjs --config /private/tmp/recall-reader-diagnosis/playwright.config.ts --grep 'native light tap|excerpt body' --workers=2 --output=/private/tmp/recall-reader-diagnosis/public-results`, with the same environment. Four diagnostic assertions passed in 21.8s, zero skips/retries. Public answer positions after vertical reading: Chromium 767px, WebKit 700px; both reset to 0px after the tap. Public excerpts reset from 500px to 0px in both engines. No ratings were created.
- Final local command: `node scripts/run-playwright.mjs --config /private/tmp/recall-reader-diagnosis/playwright.config.ts --workers=2 --output=/private/tmp/recall-reader-diagnosis/local-final-results`, with the same environment. Eight diagnostic assertions passed in 14.5s, zero skips/retries, including the real sync function's local cache reload. Final vertical-reading offsets were Chromium 791px and WebKit 700px; both remained scrolled before the separate tap.
- The existing long-reading tests cover vertical scrolling and rating/card-switch safety, but not an already revealed answer's repeated touch or a background snapshot refresh. Their prior acceptance does not cover these defects.
- Application lint, unit, type and production-build gates are not applicable because no application or repository test implementation changed. Documentation links and whitespace are checked before publication. Physical iPhone, real authenticated background-sync timing and inertia-stop touches remain unverified.

## Production And Recovery

- Public read-only version check: `curl -L --fail --connect-timeout 10 --max-time 30 -sS https://recall-memory.pages.dev/version.json`, HTTP success, version `1.0-20261104-1057`, builtAt `2026-11-04T02:57:00.000Z`.
- Previously recorded/current-version deployment: `40a39dae-4e2c-4d8d-8646-702ea2f4363e`, source `e65081541b4dc297418b0b93453eb9df831d1a19`, URL `https://40a39dae.recall-memory.pages.dev`, from the deck-picker release record. Hosting deployment metadata was not independently fetched in this diagnosis; the public version matches that record.
- `git diff e65081541b4dc297418b0b93453eb9df831d1a19 HEAD -- src/components/memory-reader.tsx src/services/memory-actions.ts src/services/cloud-sync.ts` was empty. The inspected owning paths match that recorded deployment's source.
- No new deployment, origin change, D1/schema/API change, private-data publication or app rollback. The existing deployment contains the diagnosed defects and is not described as known-good for this behavior. Do not clear website data, restore databases or roll back unrelated release improvements to address these reader defects.
- A subsequent requested fix should make reveal idempotent for displayed answers/excerpts, maintain live reading offsets, and restrict scroll restoration to deliberate panel/card restoration. Add preservation regressions for taps, unchanged snapshots, sync reloads, switching/undo, options/font changes and ongoing vertical gestures before publishing a corrected app.
- Documentation recovery, if needed, is a new scoped revert commit; no force push or history rewrite. Application/data rollback is not applicable to this documentation-only task.

## Documentation Publication

- 2026-11-04 13:00:21 +08:00: `git diff --check` passed. A Node filesystem check of Markdown links in this record and `docs/RELEASES.md` passed; the new record contains no forbidden Unicode dash characters. Only the two intended documentation files are modified/untracked.
- Documentation source SHA, push outcome and completion timestamp: pending publication, appended in a documentation-only follow-up. No app deployment is triggered by either documentation commit.
