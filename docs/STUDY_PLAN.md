# PWA Study Plan

## Scheduling And Selection Are Separate

The PWA uses FSRS smart scheduling by default. Smart rating buttons show recall
grades, not predicted intervals. Fixed mode still shows configured intervals.
Good (记住了) and Easy (很熟悉) schedule no earlier than exactly 24 hours after
the actual rating, including initial learning and relearning. Longer FSRS
intervals, including months, remain intact. Again and Hard retain FSRS behavior.
The minimum changes the due date and scheduled duration without resetting the
underlying learning steps, stability, difficulty, repetitions or lapse history.

Changing settings does not bulk reschedule existing cards or clear reviews.
Changing the selection preferences immediately recomputes recommendations and
the unfinished portion of an active review round, keeping the displayed card,
its revealed state and scroll position, and completed rating history. Existing
card due dates remain unchanged until a real rating is saved.

## Selection Preferences

Open Settings and Data > Review Plan in the PWA. Defaults are:

| Setting | Default | Valid Range |
|---|---|---|
| New-card target proportion | 30% | 0% to 100% |
| Cards per round | 10 | 1 to 100 |
| Session time goal | 30 minutes | 5 to 120 minutes |

The slider controls a target proportion by **card count**, not by elapsed time.
New quotas are rounded to whole cards; the UI shows actual counts. A 10-card
round at 30% targets seven old cards and three new cards. Tiny rounds may not
match the requested percentage exactly.

- A new card has never been rated: zero repetitions and no last review date.
- Old cards must actually be due now. Future-due old cards are not selected just
  to fill a quota. Archived cards are excluded from both pools.
- Old cards are ranked by FSRS-estimated retrievability, lowest first, with
  deterministic due-date and identity tie-breaks.
- Invalid legacy model parameters fall back to the default model for ranking
  only, so the home/settings UI stays usable. Stored model parameters and card
  scheduling data are not overwritten. Valid 17/19/21-weight formats remain
  supported.
- At 0%, old cards have absolute priority. At 100%, new cards have absolute
  priority. When one category is insufficient, the other can fill the shortage.
- Inside a selected batch, grades do not automatically reinsert a failed card.
  Users may voluntarily start another round or return later.
- Active replanning never reintroduces completed cards into the unfinished
  portion. Already completed cards and the displayed card can make that round's
  final mix differ from the newly selected target. Reducing a round below the
  completed count does not erase progress or remove the displayed card.
- Selection stays inside the library/search scope used to start the round.

Preferences persist in browser storage, SQLite settings rows, and backup
replacement. Merging a card backup retains local settings. Missing or malformed
preferences receive independently validated defaults.

## Workload And Completion

The home page separates total due old cards, never-rated new cards, and the
manageable recommended round. Completing a round is not a claim that the entire
backlog is clear. Users can stop or voluntarily continue; the time goal is not a
deadline, countdown, or guarantee that a fixed number of long cards fits it.

Missed days do not create copies of overdue tasks or fake failed reviews. Due
cards remain due until genuinely reviewed or deliberately archived. A high
new-card proportion can increase future workload; a warning does not block the
user's selection. A workload limit cannot guarantee recall retention when the
user repeatedly postpones reviews.

## Integration And Verification

This task is developed and committed only on its task branch. Production merge,
push and publication belong to the integration chat. Logo blur and WeRead fixes
are explicitly outside this task.

Focused unit checks:

```bash
pnpm exec vitest run src/services/__tests__/memory-review.test.ts \
  src/services/__tests__/memory-study.test.ts \
  src/services/__tests__/memory-study-persistence.test.ts \
  src/services/__tests__/memory-study-session.test.ts \
  src/components/__tests__/memory-review-plan-editor.test.tsx
```

The baseline currently discovers the independent WeRead Playwright prototype
when running Vitest. Without changing that unrelated configuration, the app
suite can be collected separately:

```bash
pnpm test --exclude 'prototypes/**'
pnpm lint
pnpm exec tsc -b --noEmit
pnpm build
```

Run mobile checks through the guarded launcher, outside a macOS Seatbelt shell.
Set `RECALL_CHROMIUM` and `RECALL_WEBKIT` to installed browser executables when
needed. Set `RECALL_STUDY_PORT` to an unused local port; the task config never
reuses another chat's server.

```bash
pnpm test:e2e --config e2e/memory-study.config.ts --workers=2
```

The mobile suite uses a 393 x 852 CSS-pixel iPhone 15 viewport at DPR 3 and local
synthetic data. It covers ratios, persistence, 24-hour rating/undo, active
replanning, long answers, completion, horizontal subfolders, navigation,
question/answer validation, focused controls above sticky save actions, corrupt
legacy ranking parameters, and excerpt preservation alongside baseline
safe-area, drawer, import, statistics and offline checks. Browser simulation is
not installed-PWA or physical iOS 27 verification.
