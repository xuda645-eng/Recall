# Paper Preview Browser Comments

Checkpoint: 2026-11-05T17:32:13+08:00 (Asia/Shanghai).
Status: local worktree development and validation; production publication held.

## Nine Requested Corrections

1. Subfolder chips use transparent backgrounds, 14px outlined corners and a
   restrained shadow in light/dark mode instead of olive fill.
2. Removed the merged-highlight count/order sentence from reading. Original
   highlight segments and their order are unchanged.
3. WeRead's bottom source label displays only the chapter, without provider or
   book title. Other card sources and stored provenance are unchanged.
4. Removed the image preview caption. The image remains a directly clickable
   button with an accessible enlargement label; the zoom/drag viewer is retained.
5. The loopback build now opens the manual WeRead file flow rather than attempting
   online connection or loading online jobs. Network/AI controls are omitted in
   this mode, and the request service rejects local-preview calls before fetch.
   Normal-build network failures have readable recovery text; cancellation stays
   cancellation. This is not proof of authenticated online WeRead success.
6. Renamed the primary package choice to "带图卡片文件" without changing file
   format, extension, validation or full-backup separation.
7. Root remains the first directory item. Within each hierarchy, the current
   selected branch comes next, then recently imported/created siblings with
   deterministic ties. Sorting does not alter persisted folders. The existing
   one-time WeRead organization now runs in the local preview too, as explicitly
   requested: books become children of the "微信读书" root. It writes a
   credential-free pre-organization backup before persistence and marks success
   afterward. Already organized user-renamed/moved groups are not forcibly reset.
8. Markdown/media confirmation has a separate fixed foreground dock outside
   scrolling preview content. It sits above cards, below drawer dismissal/sheets
   and the appbar. ResizeObserver measures the dock to reserve enough content
   space, including safe areas and enlarged text. Other import footers are not
   unintentionally converted by the new styling.
9. Removed the numbered-Markdown download from the completion page and its
   unused receipt text. View-folder and continue actions remain; importer IDs,
   updates and backup/export capabilities are not removed.

## Scope And Private Data

Detached base: `60e92c66b01d3ba88c71e58947d7dec4cea8d76d`. This is not a
source SHA identifying the new uncommitted preview. Existing inherited dirty
changes are retained. Before-edit copies are ignored under
`quality/paper-comments/before/`.

The owner preview stays on `http://127.0.0.1:4410/`. Owner content, folder names
and counts are retained only in ignored private evidence. The user has imported
content since the original exact-copy check; that earlier parity report is
historical, not a current count. Do not replace this newer
copy with the earlier backup. Automated mutation checks use synthetic contexts.
Directory organization is explicitly requested; no rating/edit/import is
performed by the agent against the owner copy for testing.

The old server was no longer listening: HTTP 000 on the existing origin while
the cached app still rendered. Online API access would also be unavailable even
with this static server running. Restart the same origin with the new frozen
build, not a production API proxy, and apply the ordinary update prompt. Do not
clear browser data. Build directory: `quality/paper-comments/build`.

At this checkpoint, main push/merge and production deployment remained held.
The user later explicitly approved V1.1 publication after completion; see the
consolidated release record. No production mutation, credential copy or
private-data publication is authorized by that approval. All
quality images/backups remain ignored and local. Windows vault/handoff and
Graphify were unavailable; the instructed architecture-table fallback was used.

## Validation

- Initial focused type check passed; 6 files / 128 existing affected tests passed.
- New focused checks initially had 115 passes / 1 failure: the new footer test
  lacked the jest-dom matcher import. Added the same test setup used by nearby
  component tests; no behavior assertion or timeout was relaxed.
- Full units, lint, types, isolated/normal production builds and browser
  regressions are required. Final results are appended after execution.
- New browser checks cover fixed footer hit-testing and final-card clearance at
  393/320/760/761px, landscape/desktop, 34px bottom inset, larger text, source
  simplification, transparent chips, pre-group backup/history preservation and
  real manual file import with zero API requests in synthetic local contexts.
- Physical iPhone Safari-installed PWA acceptance and authenticated online
  import are not claimed by local simulation.

Completed local validation before the V1.1 phase: 104 files / 1657 units passed;
lint recovered to 0 errors / 132 existing warnings after preserving the caught
network error as `cause`; types and isolated build passed. Browser results were
10 passed / 4 test-preparation failures, then 12 passed / 2 desktop-scroll setup
failures, then a clean 14/14 pass. Recovery used actual drawer navigation,
accounted for exported null root parents and scrolled the desktop document;
hit-testing/clearance assertions were not relaxed. The full product run had
159 passes / 1 Chromium deadline at a drawer-position poll after first-frame
assertions. Its failure remains in `/private/tmp/recall-paper-comments-product.log`;
final integrated checks are recorded separately, not called a clean old pass.

## Publication And Rollback

Commit/push/deployment ID and previous active production deployment: not
applicable to this held local preview. Earlier frozen builds remain available
for visual rollback on the same origin. A visual rollback does not undo the
requested directory organization; do not restore old snapshots over newer
owner cards, clear storage or discard unrelated source changes.

Related: [private preview guide](../PAPER_PREVIEW.md),
[card-shape correction](./20261105T154950+0800-paper-card-shape.md),
[approved V1.1 release](./20261105T180104+0800-v1-1-paper-editorial.md).
