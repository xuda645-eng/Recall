# Paper Editorial Full Local Application Preview

Created: 2026-11-05T11:16:04+08:00 (Asia/Shanghai).

## Authorization And Status

- User chose style A / paper-editorial and requested complete development in
  this isolated worktree, real original input and sufficient validation.
- Explicit hold: wait for user confirmation before deciding on online publication.
- No merge, main push, Cloudflare deployment, database/schema change or production
  library mutation was performed. No parallel-delivery Skill was invoked.
- Worktree: `/Users/bytedance/.codex/worktrees/8fb1/Recall-next`, detached at
  `60e92c66b01d3ba88c71e58947d7dec4cea8d76d`. This is the base SHA, not a SHA
  representing the completed preview. Task changes are uncommitted.
- The worktree already contained pending import-completion, folder-selection,
  WeRead organization and cloud/statistics refinements at task start. These were
  preserved. Validation covers the combined local workspace, not an independently
  releaseable task-only commit. Do not stage all changes as this task.
- Baseline evidence is private at `/private/tmp/recall-paper-baseline/`, including
  `inherited.patch` and selected pre-edit originals. Private backups/screenshots
  and acceptance outputs are ignored under `quality/paper-preview/`.
- Windows Obsidian home/map/handoff and Graphify were unavailable on this Mac.
  The session used the instructed fallback map and targeted owning sources.

## Implementation

- Real-data paper home: current old/new counts exclude archives and future due
  cards using the existing study helpers; the same folder and reading actions
  are reused. Original SVG art varies by date.
- Warm paper/olive palette, serif headings/reader and book-spine folder rows.
  Import, statistics, drawer, settings and sheets share the same visual layer.
  Mobile directory search stays immediately below the shared topbar; the larger
  editorial directory heading is desktop-only.
- Persistent home study dock retains confirm-before-review deck selection and
  review-plan actions. A ResizeObserver reserves the actual dock height; the
  remembered-deck caption is limited to two lines, with the full name in the
  picker. End-of-page padding and foreground movement are verified.
- Existing PWA shell geometry, safe-area strategy, gesture/rating/undo logic and
  production data services remain intact. Theme metadata and existing Logo PNGs
  are olive; no new logo or third-party imagery is introduced.
- Loopback-only preview flag/server and local-only exact backup loader. It refuses
  nonempty destinations, preserves every identity/content/history record and
  validates all images. Device credentials and automation are disabled.
- Existing tests were routed to the current import-completion UI, local WeRead
  file entry and compact count-bearing picker buttons. Behavioral assertions
  remain; a new reader-round helper verifies actual old/new composition instead
  of obsolete picker summary copy. The helper waits for each completed transition.

## Real Data Evidence (Private, Not Bundled)

Production backup was obtained using the normal full-backup UI in the existing
authorized browser. No production cards were reviewed, edited or archived.

The first ordinary merge-restore attempt was not suitable for an exact acceptance
copy: merge deduplication and the inherited WeRead organization changed the
result, and a retry duplicated content under changed paths. That throwaway copy
on port 4408 was not used as the final preview. It was not cleared or published.

The final fresh origin on port 4410 used the explicit local-copy loader. The
copied library was exported again through the full-backup UI and compared locally
with `isDeepStrictEqual` for each content field:

| Field | Comparison |
|---|---|
| Decks/hierarchy | Identical |
| Cards/content/IDs/archive/schedule | Identical |
| Review logs | Identical |
| Study sessions | Identical |
| Images/content | Identical |
| Review plan and study preferences | Identical |

Owner-library counts are retained only in ignored private evidence. Device `syncCode` is null and
`syncEnabled` false. Private machine-readable evidence: `data-parity.json`.
The source and re-export backups remain ignored. No owner data is in the static
bundle or public release evidence. Refresh persistence was inspected in the
same local browser; subsequent synthetic tests use independent contexts.

## Validation

Commands use the installed dependencies directly because the local pnpm wrapper
version differs from the project's requested manager version.

- Dependency offline install initially failed with `ERR_PNPM_NO_OFFLINE_META`.
  Recovery: `pnpm --config.manage-package-manager-versions=false install --frozen-lockfile`;
  installation and supply-chain check completed.
- Unit tests: 103 files / 1651 tests passed. Commands:
  `node node_modules/vitest/vitest.mjs run`.
- Types: `node node_modules/typescript/bin/tsc -b --noEmit` passed.
- Lint: `node node_modules/eslint/bin/eslint.js .`, 0 errors / 132 existing warnings.
- Normal production build passed; isolated preview build passed, 165 precache
  entries. The existing >500kB rich-renderer chunk warning remains.
- Initial main mobile run: 101/114. Failures included old theme assertions, extra
  mobile directory heading, and obsolete inherited test entry/copy. These were
  corrected without relaxing the gesture, storage or progress assertions.
- Expanded product run: 140/160, exposing obsolete compact-picker/completion
  assertions. These were updated. The next run and final outcomes are appended
  after completion rather than presumed passing.
- Dedicated isolated paper/copy suite: 4/4 across Chromium/WebKit, including
  393x852/DPR3, 320px, 760/761px, landscape/desktop, safe insets 59/34, end-content
  clearance, stationary drawer, focus/reduced motion, duplicate/history parity,
  reload, blocked APIs and no external requests.
- Detailed logs are private under `/private/tmp/recall-paper-*.log`. No production
  D1 mutation checks were run because data services/schema did not change.

## Preview And Review

Final intended preview: `http://127.0.0.1:4410/iphone15.html` in the same authorized
local browser profile. This is the real application with a private copied library,
not the old comparison mockup on port 4397 and not the production application.

The preview is loopback-only and accessible on this Mac while the server runs.
It is not a public link or an installable phone release. Physical iPhone home-screen
launch, native Safari safe areas/keyboard, standalone offline reopen and update
acceptance remain unverified. No phone/PWA acceptance is claimed.

See [local preview instructions](../PAPER_PREVIEW.md).

## Source, Production And Rollback

Source task SHA/push result/deployment ID/previous active deployment: not
applicable to this held local preview. The base SHA is recorded above. Historical
release-index deployments were not reverified and are not claimed as current.

Production remains untouched by this task. There is no production rollback to
execute. Previous generated local builds are retained; an earlier build can be
served on the same local origin without changing the owner's production storage.
Do not clear browser data, restore a production database, discard inherited work
or publish private backups as a way to roll back the visual preview.

## Final Outcomes

Completed validation: 2026-11-05T11:35:20+08:00.

- Final normal production-style bundle: full product suite 160/160 passed across
  Chromium and WebKit, using `e2e/product-review.config.ts`. This includes
  imports/update/restore, hierarchy, cards/editors, long reader/gestures,
  scoring/undo, statistics, dark mode, safe areas, narrow/landscape/desktop,
  offline reopening and Service Worker refresh/update persistence.
- Final isolated bundle: paper suite 6/6 passed using `e2e/paper-editorial.config.ts`.
  Added 320px / 20px text stress with a very long remembered card-group name and
  high-contrast mode. The initial stress check failed in both engines because
  fixed padding did not cover the taller dock. The measured-height reservation
  and two-line auxiliary caption fixed it; the complete suite was rerun.
- An intermediate product run was 159/160 because the new round-composition
  helper sampled WebKit before transitions finished. It now waits for the actual
  progress position, and two subsequent complete product runs passed 160/160.
- Final units 1651/1651, type checking and lint passed (132 existing lint warnings,
  0 errors). Both final normal and isolated builds passed. No test was skipped to
  manufacture these totals.
- Final local browser build `1.0-20261105-1126` was applied through the ordinary
  update prompt. Private comparison confirmed the original active library and
  home counts were retained. The browser frame reports 393 x 852 CSS
  pixels; its dock is 124px and reserves 124px plus the content gap.
- The copied data/hierarchy/history/images were already checked field-for-field
  by full re-export. Actual home, import and statistics pages were visually
  inspected. Owner-copy refresh and local update were inspected without rating,
  editing or archiving the copy. Synthetic tests never used its browser profile.
- Icon generation is idempotent: before/after SHA-256 manifests match. Private
  backup, re-export, parity report and screenshot paths are confirmed ignored.
  Documentation links and `git diff --check` passed.
- Physical iPhone Safari-installed acceptance remains pending. Production/source
  publication remains explicitly held. There is no new source commit, main push
  or deployment ID to report.

Exact browser invocations (with the installed engines):

```bash
RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' node scripts/run-playwright.mjs --config=e2e/product-review.config.ts --workers=2
RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' node scripts/run-playwright.mjs --config=e2e/paper-editorial.config.ts --workers=2 --output=quality/paper-preview/acceptance-complete
```

Final logs: `/private/tmp/recall-paper-units-complete.log`,
`/private/tmp/recall-paper-lint-complete.log`,
`/private/tmp/recall-paper-product-e2e-complete.log`,
`/private/tmp/recall-paper-specific-e2e-complete.log`.
