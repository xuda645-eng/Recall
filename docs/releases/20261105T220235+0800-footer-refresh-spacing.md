# Footer Prototype Refresh And Spacing

Checkpoint: 2026-11-05T22:02:35+08:00 (Asia/Shanghai).
Status: local design revision delivered for review; no app deployment.

## Request And Design

The user requested a better-looking refresh control and equal line spacing.
The prototype replaces the two-arrow glyph and squared outline with a single
open circular arrow, rounded 1.6px strokes and a quiet 32px paper-colored
circular surface with a subtle shadow. The glyph remains 18px and the button
retains a 44 x 44px touch target at the right of the information cluster.

Settings now shares the status/time/version text axis and grid. All four
persistent rows use the same 20px line height, 12px vertical padding and 44px
minimum row height. Extra version/settings margins and inter-row gaps were
removed, including the short-height margin override. This gives a 44px line
pitch for single-line content and equal 24px separation between text blocks
when content wraps. Long text expands rows rather than being clipped.
Feedback uses the same vertical padding and occupies no space while empty.
All footer text remains 13px, regular weight and the same font family.

Only independent prototype HTML/CSS, tests and documentation changed. No
production app interaction, data schema, sync ordering or navigation changed.

## Validation

- JavaScript/server syntax, targeted ESLint and diff whitespace passed.
- Guarded Chromium/WebKit suite: 6/6 passed in 8.8 seconds. Assertions cover
  shared typography, aligned row positions, equal vertical padding, zero extra
  margins/gaps, circular surface, one refresh action, 18px icon and 44px target.
- 393 x 852 CSS pixels / DPR 3, 525 x 824 and 320px: no page overflow; settings
  and refresh visible. Dark/pending/offline/conflict, 59/34px inset stress,
  20px text, reduced motion and simulated feedback passed.
- Local server returned 200 at `http://127.0.0.1:4424/`. Refreshing the old
  browser handle was unavailable; a new visible local tab was opened, visually
  inspected and retained for comparison. Owner production tabs/data were not
  operated on. Screenshots remain ignored in `quality/footer-prototype/equal-rows/`.
- This static local prototype uses synthetic context and no storage, sync
  credentials or live API. App build/full units, authenticated sync and physical
  iPhone-installed PWA acceptance are not claimed for this design-only revision.
- The Windows vault/Graphify remain unavailable on this Mac; known prototype
  paths and targeted reads were used, as previously disclosed.

Reproduction from the repository root:

```sh
node --check prototypes/drawer-footer/preview.js
node --check prototypes/drawer-footer/server.mjs
node node_modules/eslint/bin/eslint.js prototypes/drawer-footer
node scripts/run-playwright.mjs --config=prototypes/drawer-footer/playwright.config.ts --workers=2 --output=quality/footer-prototype/equal-rows
git diff --check
```

Installed browser paths were supplied through `RECALL_CHROMIUM` /
`RECALL_WEBKIT`; guarded browser execution was outside macOS Seatbelt with
tool approval. No browser security setting was altered.

## Delivery And Production

Source base: `d29bcb58a4ff651f7ff5a38a8c6a78a45733ea13` in the clean delivery
worktree. Only reviewed prototype changes and this record/index are delivered.
Actual source commit and normal main push outcomes are appended afterward.
The original trial worktree, unrelated style-lab and all private files remain
preserved and excluded.

No app deployment occurs. Last recorded production remains deployment
`8c11afc0-2e41-4515-8598-bc9210e031e4`, app source
`7e55bc939eaaf35f372dba26f339fd8d88a5211b`, build `V1.1-20261105-1919`, at
`https://recall-memory.pages.dev/`. Previous compatible deployment
`aff714f3-478e-41de-8d21-1cc0c0d98ac8` is unaffected. No production rollback
is needed. Local visual fallback is the previous prototype or unchanged
production UI, without storage clearing, data rollback or history rewriting.
Formal application integration still waits for prototype review.

Related: [previous typography correction](./20261105T215501+0800-footer-uniform-typography.md),
[prototype instructions](../../prototypes/drawer-footer/README.md).

## Source Outcome And Rejected Review

At 2026-11-05T22:04:52+08:00, prototype source
`0bd41a3b2e33bb733ef8d680caad48fe1a525a9e` was committed and pushed normally
to main (`d29bcb58..0bd41a3b`). No app deployment occurred. During delivery,
the user rejected the piecemeal layout and explicitly identified the refresh
button's misalignment, then requested reconsidering the whole design rather
than patching this version. The 6/6 checks were not design acceptance and did
not cover the missing version-row pairing. This attempt is preserved as
rejected, not accepted, and superseded by the
[holistic revision](./20261105T220933+0800-drawer-holistic-reconsideration.md).
