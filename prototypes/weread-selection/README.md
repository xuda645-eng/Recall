# WeRead Selection Design Prototype

## Scope And Assumptions

This is the requested high-fidelity design study, not an implementation of the
production import workflow. The parallel timeout/runtime repair is out of scope.
The canonical Recall v5 reference is preserved. The new design retains Recall's
paper/graphite palette, olive reading accents, serif editorial headings, the
48px Logo/appbar contract, stationary drawer, and whole foreground movement.
The primary viewport is 393 x 852 CSS pixels, DPR 3.

Every book, author, cover, note count and sample question is original demo
material. There are no remote assets, API requests, keys, production writes,
Service Worker registration, AI calls, or infrastructure changes. The only
persistence is the isolated tab-session key
`recall.prototype.weread-selection.v1`. Refresh keeps simulated completed work;
closing the tab is not a durable job-storage guarantee.

The source lives here so it can be reviewed and published to the existing
GitHub repository without replacing the production app. The deliverable is
also archived independently at `../../../prototypes/weread-selection/` in
the parent workspace. It is not in Vite's public directory or app entry graph.

## Preview

From the application repository:

```bash
python3 -m http.server 4395 --bind 127.0.0.1 --directory prototypes/weread-selection
```

Open `http://127.0.0.1:4395/`. This is a local preview, not a public deployment.
The mobile viewport displays only the product; desktop adds design context
and shortcuts. The appbar ellipsis exposes simulation scenarios on mobile.
`?preview=connect`, `books`, `confirm`, `failure`, or `done` opens a specific
design state. These query parameters reset only this prototype's demo state.

## Information Hierarchy

- Connection entry: a short editorial heading, a book illustration, one primary
  connect button, and a low-emphasis alternative-import entry. Technical
  format limits and long source explanations are no longer first-screen copy.
- Selection: book/author search, reading-state filters, additional highlight
  and unimported filters, and recent-notes/highlight-count/progress sorting.
- One book per card: cover, title, author, marked reading status, numeric
  reading progress, highlight count, total notes, recent note date and an
  existing-import indication. Selection uses the entire card touch surface.
- Footer: selected-book count, highlight count and the next-step action. It is
  outside the reading scroller and cannot overlap the last card. Five books
  is the demo selection cap, consistent with the current online import cap.
- Unknown values remain unknown. A missing progress is not displayed as 0%;
  missing note components do not become a fabricated total. Zero highlights
  disables import selection even if personal thoughts/bookmarks are present.

Skill field meanings come from the locally installed weread-skills 1.0.5
`notes.md`, `book.md` and `shelf.md`. `noteCount` is highlights, not total notes;
total notes are `noteCount + reviewCount + bookmarkCount`. Marked finished
status is separate from reading progress. The precise notebook
`readingProgress` unit needs real-response/contract verification before a
production implementation; the standalone progress endpoint defines 0-100.
Recent note time is the notebook sort value; it is not recent reading time.
The actual current app forwards only book ID/title/author/highlight count.
This design therefore does not claim those additional fields are already
available in the deployed frontend.

## Confirmation And State Model

```text
connect -> connecting -> books -> confirmation
confirmation -> generating -> importing -> done
generating -> generation-failed -> retry -> generating
generating -> paused -> continue -> generating
importing -> import-failed -> retry -> importing
refresh during work -> paused, preserving completed demo progress
```

The confirmation sheet shows selected books, the number of new questions,
duplicate skips, and an explicit action labeled to generate and automatically
import. It discloses that selected original highlights would be sent to AI.
The prototype itself sends nothing. Confirmation is required before a task
starts. The entire chosen batch finishes generation before any import step.

Book cards become progress cards while working: queued, generating, generated,
or failed. The summary distinguishes question generation from card import.
Generation failure pauses the batch, keeps completed question counts, imports
nothing and offers retry. Retry advances from the saved count, not from zero.
Import failure keeps the completed questions and offers import-only retry.
The success view reports added/updated/skipped counts and resulting book groups.

Unchanged existing cards skip generation and import. Changed existing cards
default to preservation; an explicit checkbox is needed to update them.
That design retains the requirement to preserve review progress. The prototype
simulates identities and counts only, not actual card writes or review history.
No real import, recovery, rollback or idempotency guarantee follows from it.

## Production Handoff Boundaries

The user's requested automatic-import flow is modeled here, but has not been
connected to the production parser, job manager, repository or server. The
existing manual preview/import flow remains unchanged. A future implementation
must establish durable draft storage, stable source IDs, budget enforcement,
generation validation, exact-original answers, transactional or idempotent
import/retry, changed-card confirmation, device authentication, and data safety.

The existing service has 20 questions per UI generation action, a 100-model-
attempt UTC-day shared budget, a five-book/1000-highlight online limit and
other input/output/rate limits. The design's demonstration counts do not
authorize bypassing those limits, auto-resuming a real paid job, or background
whole-book sync. A production flow must display its actual eligible-card count
and budget before accepting one confirmation for an explicitly bounded job.
If it cannot complete that job under the budget, it should stop before sending
the originals and offer a smaller batch. AI semantic correctness still needs
review; schema-valid output is not proof of a faithful question.

Local file import, zero-book/connection-failure/device-auth states, full
1000-highlight selection, storage failures and physical PWA behavior are not
implemented here. The alternative-import button describes its planned entry;
it does not open or validate a real file. These belong to production handoff,
not the parallel service-timeout repair.

## Validation

Run the independent browser suite from the application repository:

```bash
RECALL_CHROMIUM='<cached Chromium executable>' \
RECALL_WEBKIT='<cached WebKit pw_run.sh>' \
pnpm test:e2e --config prototypes/weread-selection/playwright.config.ts --workers=1
node --check prototypes/weread-selection/prototype.js
```

If pnpm attempts a dependency reinstall in a non-TTY environment, keep the
installed dependencies and invoke the same guarded launcher directly:

```bash
node scripts/run-playwright.mjs --config prototypes/weread-selection/playwright.config.ts --workers=1
```

Set the cached engine path variables for either command as above.

The suite tests the connection, search/filter/sort, count meanings, missing
values, selection cap, explicit confirmation, automatic simulated import,
generation failure/retry, import-only retry, refresh preservation, changed
cards, duplicate imports, drawer behavior, safe-area stress, core 44px touch
targets, long-title scrolling, dialog focus, reduced motion, 320/360/760/761
breakpoints, landscape, desktop and enlarged text. Screenshots are written to
the private local `../../../exports/weread-design/` folder, not published.

The exact results and sandbox recovery are recorded in the corresponding
release record. Browser simulation is not physical iPhone validation. This
prototype is not an installable/offline PWA and has no production deployment.
The custom config uses the shared browser-launch guard and startup preflight.
On macOS, run browser checks outside the Codex Seatbelt sandbox through the
normal escalation mechanism; do not bypass the guard or relaunch crashing
browsers in a restricted shell.
