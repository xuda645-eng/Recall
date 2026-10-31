# PWA Review Queue And Interface Task Branch

## Identity And Delivery Boundary

- Record ID: `20261101T002412+0800-review-study-task-branch`.
- Scope: PWA study selection, rating minimum, settings persistence, folder and
  navigation/form improvements, local tests and documentation.
- Start: `2026-11-01T00:24:12+08:00`.
- Worktree: `/private/tmp/recall-review-queue-pwa-20261101`.
- Task branch: `task/review-queue-pwa-20261101`.
- Baseline: `52aa8d0f92a38b0593b219f9782bf5233fa3ebe5` on the user-owned Recall repository.
- Implementation commit: pending local task-branch commit.
- Status: implementation and full local validation complete; task-branch commit pending.
- User instruction: develop, test and commit only in this separate worktree.
  Do not modify the primary working directory, push main, or publish production.
  Integration and publication are assigned to the integration chat.
- Logo blur and WeRead connection/import work are outside this task. Their
  concurrent changes were not copied into this worktree or modified.
- Windows vault and Graphify were unavailable on this Mac. The existing session
  handoff and targeted source map were used; no graph update could run.

## Changes And Rationale

1. Smart FSRS remains the default. Smart rating buttons no longer display
   predicted intervals, including accessible button names. Fixed mode retains
   visible configured intervals.
2. Good and Easy apply a full 24-hour minimum from the actual rating timestamp,
   including new/learning/relearning cards. Longer FSRS intervals remain intact;
   Again/Hard and underlying memory progress are preserved. Existing cards are
   not bulk rescheduled. Invalid fixed Good/Easy intervals below 24 hours are
   rejected and old invalid interval drafts receive safe defaults.
3. A pure study selector separates never-rated new cards from due old cards,
   excludes archives and future-due old cards, applies rounded new-card quotas,
   fills shortages from the other category, and supports absolute 0/1 priority.
   Old-card ordering uses the installed FSRS retrievability API, with stable
   tie-breaks and selected-batch context interleaving.
   Finite legacy 17/19/21-weight formats are supported. Invalid parameters use
   default ranking only, without rewriting stored model parameters or card data,
   so a malformed snapshot cannot crash the home/settings entry points.
4. PWA settings expose a new-card proportion slider (default 30%), cards per
   round (default 10), and session time goal (default 30 minutes). The ratio is
   by card count, not time. The time goal is not a mandatory countdown or daily
   target. High new-card ratios warn but do not prevent saving.
   Focused settings scroll above sticky save actions, preventing a covered
   input near the bottom of a short mobile sheet.
5. Preferences persist through browser snapshots, SQLite key/value settings and
   replacement backup import, with independent legacy/malformed-value defaults.
   No database schema migration or live database writes are required.
6. The home page distinguishes total due old cards, never-rated new cards and a
   manageable recommended round. Finishing a round does not claim the backlog
   is clear. Users can voluntarily continue; failed ratings do not automatically
   reinsert the same card into that round.
7. Saving selection preferences during review preserves the displayed card,
   revealed state, scroll and completed history, changing only unfinished
   selection within the original scope. Reducing a round never erases progress.
   Undo can safely interrupt a pending page transition.
8. Folder management is explicitly positioned at the upper right rather than
   relying on a last-child selector. Child folders use a contained horizontal
   strip with an affordance; grid children have a zero minimum width so the
   strip scrolls without expanding the entire page.
9. Navigation distinguishes the hierarchy-oriented Card Group Directory from
   All Cards. Root statistics/archive/import pages have no irrelevant header
   action, retaining the three-slot header with a noninteractive placeholder.
   Child folders return to their parent; study retains Exit. Logo markup and
   shell animation/safe-area CSS are unchanged.
10. Manual creation exposes question and answer only, with required validation.
    Existing excerpt editing remains supported without converting its kind or
    losing source metadata and review progress. Optional source fields are
    collapsed to keep the primary form compact.

Behavior and commands: [PWA study plan](../STUDY_PLAN.md).

## Validation Evidence

All tests below run in the task worktree with synthetic local data. Browser
executables are cached Chromium 1223 and WebKit 2272; mobile checks use 393 x 852
CSS pixels at DPR 3. No production cards, credentials or paid AI calls are used.

| Command / Check | Result |
|---|---|
| `pnpm exec vitest run src/services/__tests__/memory-review.test.ts src/services/__tests__/memory-study.test.ts src/services/__tests__/memory-study-persistence.test.ts src/services/__tests__/memory-study-session.test.ts src/components/__tests__/memory-review-plan-editor.test.tsx` | 192 tests passed at `2026-11-01T00:35:22+08:00`. |
| `pnpm test` | 1285 tests passed but overall command failed: Vitest also collected the unrelated `prototypes/weread-selection/flow.spec.ts` Playwright suite. No application assertion failed. |
| `pnpm test --exclude 'prototypes/**'` | Recovered app collection initially passed 1285 tests. Final source: 73 files / 1297 tests passed at `2026-11-01T00:57:18+08:00` in 21.95 seconds; no unrelated config edit. |
| `pnpm lint` | Passed with 0 errors and 131 existing warnings. |
| Task-scoped ESLint on changed UI/session helper/E2E files | Passed without errors or warnings. |
| `pnpm exec tsc -b --noEmit` | Passed. |
| `pnpm build` | Passed; PWA emitted 153 precache entries. Existing large-chunk warning remains. |
| Guarded mobile launcher, task config, 8 new cases on Chromium and WebKit | 16 passed in 32.8 seconds; includes active card/scroll/history preservation, exact minimum/undo, completion, horizontal strip, navigation and excerpt preservation. |
| Final focused Vitest rerun | 204 passed at `2026-11-01T00:56:05+08:00`, including legacy parameter fallback and focused-input scrolling. |
| `RECALL_CHROMIUM=<cached Chromium> RECALL_WEBKIT=<cached WebKit> RECALL_STUDY_PORT=<unused loopback port> pnpm test:e2e --config e2e/memory-study.config.ts --workers=2 --output=/tmp/recall-study-e2e-final-pass` | Final full regression: 62 checks passed in 2.0 minutes, verified at `2026-11-01T00:59:42+08:00`; covers baseline and all 9 new cases on both engines. |
| Same guarded launcher with `--grep '小轮次完成' --workers=2 --output=/tmp/recall-study-continuation` | Supplementary continuation/exit/undo checks: 2 passed in 13.1 seconds after strengthening actual next-round activation assertions. |
| `git diff --check` | Passed. |
| Synthetic screenshot inspection | WebKit folder strip and settings inspected: upper-right menu, readable counts, contained horizontal child-folder strip, and focused inputs above save actions. |

Final `pnpm build` after the supplementary browser run passed and emitted 153
precache entries / 3212.50 KiB. Source and generated dependencies stayed in the
task worktree; no build artifact was uploaded.

### Recovery And Initial Failures

- Dependency setup used an isolated copy. A source-test clone collision occurred
  while an agent was also preparing dependencies; version checks, app checks and
  builds subsequently passed. Generated dependencies remain ignored and local.
- Initial mobile invocation found port 4197 occupied. It did not reuse or kill
  that server. Further runs use `RECALL_STUDY_PORT` set to a freshly allocated
  unused loopback port, with `reuseExistingServer: false`.
- The task config initially inherited a server command relative to its `e2e/`
  folder, so Vite could not resolve `index.html`. The config now sets its server
  working directory explicitly to this worktree root.
- The first launched focused suite had eight failures: invalid synthetic new
  memory state, implicit-label selector matching on a populated textarea, and
  the horizontal strip's grid minimum-width constraint. Synthetic state and
  selectors were corrected, the real layout constraint was fixed, and all 16
  focused checks passed afterward. No failure assertion was removed or relaxed.
- Immediate undo during a page transition now cancels that transition before
  restoring rating state; the minimum/undo case passes on both engines.
- A read-only review reproduced a newly reachable homepage crash from malformed
  legacy FSRS weights, and invalid weights could also silently destroy ranking.
  Ranking-only numeric/format/retention validation and guarded score fallback
  were added, preserving actual user parameters. Eleven targeted regressions
  cover valid legacy formats and malformed weights/retention, plus two browser
  checks confirm the home/settings path stays accessible.
- After the initial 60-check regression pass, an expanded 62-check run passed 61
  but exposed a Chromium input overlapping sticky save actions. The editor now
  scrolls focused settings above those actions; the unchanged visibility rule
  waits for its animation frame. Both focused browser checks passed afterward
  (13.4 seconds), followed by the final full 62-check pass. A focused unit test
  also verifies the scroll offset without saving or modifying user data.

## Integration Notes

The integration chat must merge/cherry-pick reviewed task commits, reconcile
concurrent source changes, run combined acceptance, and own any main push and
production release. This worktree was based on the recorded baseline, not the
other chats' uncommitted working files.

Likely overlap points are `src/components/memory-workspace.tsx`,
`src/components/memory-reader.tsx`, `e2e/memory-workspace.spec.ts`, and release
index documentation. Preserve concurrent Logo/WeRead fixes; do not replace
entire integration files with this branch's versions. The new
`memory-study.css` is imported after the existing appearance stylesheet and
only overrides study/folder/form selectors, not Logo/topbar surfaces.

## Publication And Recovery

- Local commit time/SHA: pending.
- Remote push: not performed, per task boundary.
- Production deploy: not performed, per task boundary.
- Production origin: unchanged; no live hosting command was run.
- Production deployment ID/URL: not applicable to a task-branch delivery.
- Previous production deployment: not queried; this task makes no publication
  or rollback decision and must not supersede another chat's current release.
- Rollback: before integration, omit these task commits. After integration,
  the integration chat can prepare a history-preserving scoped revert and run
  combined tests. Any asset rollback must target its own recorded compatible
  deployment, without clearing device data, resetting D1 or rewriting history.
- Physical iPhone 15 home-screen PWA, iOS 27 behavior and production verification
  remain unverified. Local browser simulation is not a physical-device pass.
