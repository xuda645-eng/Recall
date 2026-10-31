# WeRead Selection And Automatic Import Design

- Release ID: `20261031T234739+0800-weread-selection-design`.
- Scope: user-requested independent high-fidelity prototype, design handoff,
  synthetic browser tests and local screenshots. Not a production app change.
- Started approximately 2026-10-31T23:27:00+08:00; record created at
  2026-10-31T23:47:39+08:00.
- Status before source publication: design complete; final guarded suite
  32 passed, static checks passed; commit/push pending. No app release.
- Repository/branch: `xuda645-eng/Recall`, `main`.
- Observed baseline: `dfed39774da0e7bc0ed5c98fb4ed83c6ca4ca51d`.
- Implementation source locator: commit containing this record and
  `prototypes/weread-selection/`. Actual SHA and push outcomes appended below.
- Production origin remains <https://recall-memory.pages.dev/>.
- App deployment: not applicable. No Vite app/public files, API, D1, keys,
  production assets or real cards were changed by this task.
- Previous production: not queried by this design-only task. The parallel
  runtime repair owns its deployment and its record. No previous deployment
  is asserted to be current or fully validated here.

## Design And Behavior

The connection entry removes the lengthy technical paragraphs and file-picker
panel, retaining a single connection CTA, short reading-focused copy and a
secondary alternative-import entry. The selection step displays one card per
book, title/author/cover, marked reading status, percentage progress, highlight
count, total notes, recent-note date and existing-import indication.

Search, status filters, optional importability/existing-import filters and
recent-notes/highlights/progress sorting are interactive. The bottom action
shows selected books and highlights, outside the reading scroller. Unknown
fields remain unknown; total notes never substitute for highlight count.
Zero-highlight books cannot be selected. The batch cap remains five books.

An explicit confirmation says selected originals would be sent to AI and
completed questions would automatically import. The demo performs neither
real action. All books complete generation before the simulated batch import.
Progress cards distinguish queued/generating/generated/failed. Generation
failure pauses all work, imports nothing, preserves completed counts and
offers continuation from that count. Import failure keeps generated questions
and offers import-only retry. Refresh retains simulated progress but pauses;
it never silently resumes generation or import.

Unchanged existing cards skip; changed cards require an explicit update
checkbox. Completion reports additions, updates and skips. The original
question preview is labeled non-AI. The design handoff describes real limits,
durable drafts, semantic validation, source IDs and idempotent/transactional
import as future production requirements, not established guarantees.

## Files And Isolation

- `prototypes/weread-selection/index.html`, `styles.css`, `prototype.js`:
  standalone responsive product design with original book-cover graphics.
- `prototypes/weread-selection/flow.spec.ts`, `playwright.config.ts`:
  independent 393 x 852 / DPR 3 Chromium and WebKit acceptance suite.
- `prototypes/weread-selection/README.md`: field provenance, design rationale,
  state model, preview instructions, actual-vs-proposed behavior and limits.
- Parent `../prototypes/weread-selection/`: independent local runtime archive;
  canonical `../prototypes/recall-v5/` remains untouched.
- Private `../exports/weread-design/`: simulated screenshots and overview.
  Screenshots and private exports are not staged for publication.

Only tab-session storage key `recall.prototype.weread-selection.v1` is written.
No `fetch`, XHR, sockets, production/local card data, external assets, Service
Worker, secrets, real book text, AI inference or paid resource is used.
No automation, app route, security or device-data change occurred.

The user explicitly separated this work from the other chat's timeout repair.
Observed concurrent app/tooling/release edits were left untouched. The shared
browser guard is a test dependency only. Its owning commit must be present
before publishing the prototype config; no unrelated files will be staged.

## Validation And Recovery

Environment: macOS arm64, Node 22.22.0, existing installed dependencies,
cached Chromium 1223 and WebKit 2272. Windows Obsidian vault and Graphify are
unavailable; existing architecture/handoff and canonical reference fallback
used. The Skill's capability files were checked read-only; no real gateway
request was performed to verify notebook percentage units.

Commands from Recall-next, unless specified otherwise:

1. `node --check prototypes/weread-selection/prototype.js`: passed.
2. `node node_modules/eslint/bin/eslint.js prototypes/weread-selection/flow.spec.ts prototypes/weread-selection/playwright.config.ts`:
   passed, no warnings/errors.
3. Node ESLint API with browser globals and the installed recommended JS rules,
   linting `prototypes/weread-selection/prototype.js`: passed, no warnings/errors.
4. `node node_modules/typescript/bin/tsc --noEmit --module nodenext --target es2022 --lib es2022,dom --types node --skipLibCheck prototypes/weread-selection/flow.spec.ts prototypes/weread-selection/playwright.config.ts`:
   failed with TypeScript 6 `TS5112`, because explicit files require
   `--ignoreConfig`. Same command with `--ignoreConfig`: passed.
5. Initial raw Playwright command with the cached engine paths in the restricted
   shell: 30 launch failures, browser assertions not reached. Both engines
   aborted on macOS GUI registration. Recovered by normal sandbox escalation,
   not by unsetting sandbox markers or weakening security. The subsequently
   updated project instructions forbid this raw restricted launch; this config
   now imports the shared launch guard and startup preflight.
6. Escalated raw suite, two workers: 26 passed / 4 failed. Real defects were
   an overlay intercepting the Logo close control, WebKit's select geometry,
   and WebKit dialog focus restoration. One connection assertion failed once
   under parallel load; assertions/timeouts were not relaxed. Corrected stacking,
   explicit select geometry and focus restoration; serialized final verification.
   Focused retest: 9 passed / 1 focus failure; explicit trigger-ID restoration
   corrected the remaining WebKit behavior.
7. Final escalated raw suite before guard integration:
   `RECALL_CHROMIUM='<Chromium 1223 path>' RECALL_WEBKIT='<WebKit 2272 path>' node node_modules/@playwright/test/cli.js test --config prototypes/weread-selection/playwright.config.ts --workers=1`:
   32 passed in approximately 2.3 minutes. Full log is private under
   `/tmp/recall-weread-design-final.log`.
8. Guarded preferred command:
   `RECALL_CHROMIUM='<Chromium 1223 path>' RECALL_WEBKIT='<WebKit 2272 path>' pnpm test:e2e --config prototypes/weread-selection/playwright.config.ts --workers=1`:
   pnpm attempted an automatic dependency install and stopped with
   `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Did not approve deletion,
   set CI to force it, or replace the shared dependency directory. Recovered
   using the same project's launcher with already installed dependencies:
   `RECALL_CHROMIUM='<Chromium 1223 path>' RECALL_WEBKIT='<WebKit 2272 path>' node scripts/run-playwright.mjs --config prototypes/weread-selection/playwright.config.ts --workers=1`.
   Final guarded outcome appended below.

The cached engine paths are:

```text
/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh
```

Checks cover connection, search/filter/sort, missing values and 1% interpretation,
note-vs-highlight count, batch cap, consent, completion, failure continuation,
refresh pause, import-only retry, changed-card opt-in, duplicate skipping,
Logo/drawer movement and rapid toggles/close paths, 44px controls, safe-area
stress, no horizontal overflow, long titles, dialog focus, reduced motion,
320/360/760/761 widths, landscape, desktop, enlarged text and screenshots.
An isolated browser test verified no remote requests and no production storage
keys were written. Browser UI was also inspected visually in the in-app browser.

Not applicable: production application unit/build/cloud/migration/offline gates,
because production code is unchanged. Physical iPhone Safari keyboard, installed
PWA launch/safe areas/offline/update, real AI quality, real auth/gateway egress,
durable job recovery and actual import are unverified. The prototype is not a PWA.

## Publication And Recovery

The requested change publishes only independent prototype source and documentation
to GitHub; no Cloudflare Pages production replacement is needed or performed.
The preview at <http://127.0.0.1:4395/> is local, not a public URL. The production
origin continues serving the application managed by the other repair task.

Recovery: close the local preview/server to stop the demo; use its reset control
only to reset the isolated synthetic tab-session state. A source rollback is a
scoped history-preserving revert of this prototype commit, without touching app
files, production deployments, private cards or another task's source history.
No production asset/data rollback target is applicable to this design-only task.

## Final Validation

- Final guarded command in item 8: passed, 32 tests, approximately 2.2 minutes,
  Chromium and WebKit. Completed before 2026-10-31T23:49:10+08:00. The two
  engine startup preflights completed before workers; no retries enabled.
- Shared launcher/guard dependency committed by its owning task as
  `b3a5338` before this task's publication. Its files are not part of this
  prototype commit. Existing unrelated release edits remain unstaged.
- JavaScript syntax, explicit browser-globals ESLint, TypeScript config/spec
  lint, standalone typecheck, file/link checks and staged whitespace checks
  passed before committing. Parent runtime archive matches the reviewed files.

## Publication Outcome

- Design implementation commit: `063d5168d455445b5ab073edee8c55f00f4dd42f`,
  `design: prototype WeRead book selection and automatic import`.
- Commit and push completed before 2026-10-31T23:52:15+08:00. Only eight
  reviewed prototype/documentation files were committed with path-scoped
  `git commit --only`; the other task's staged record remained staged.
- Initial `git push origin main` in the restricted shell failed with
  `could not read Username for https://github.com: Device not configured`.
  Same command through normal sandbox escalation succeeded using the existing
  credential helper: remote `main` advanced `b3a5338..063d516`.
- GitHub source: `xuda645-eng/Recall`, `main`. No force-push, branch creation,
  tag, infrastructure, migration, real data, AI or production asset change.
- Cloudflare deployment, deployed source SHA, deployment ID/URL and production
  rollback: not applicable to this independent design-only publication.
- Local preview verified visually and retained as a browser deliverable at
  `http://127.0.0.1:4395/`. It depends on the local preview server remaining
  running and is not an iPhone-accessible public production URL.
- Evidence follow-up: documentation-only commit containing this section and
  the completed index row; its push outcome is reported in the final response.
