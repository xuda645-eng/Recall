# Compact Drawer Footer Prototype

Checkpoint: 2026-11-05T20:39:26+08:00 (Asia/Shanghai).
Final validation checkpoint: 2026-11-05T20:43:15+08:00.
Status: local design delivered for review; production unchanged.

## Request And Scope

After the unified-action release, the user requested matching cloud/version
font sizes and a smaller right-side refresh control, with a coordinated local
prototype. The later "continue" request continues that prototype, not a new
production rollout. The assistant explicitly kept production unchanged for
comparison. This record is separate from the already deployed single-action
revision.

One proposal is in `prototypes/drawer-footer/`: warm paper/olive palette,
matching 13px regular cloud status and version, aligned 11px timestamp, one
18px refresh glyph in a quiet 30px outline inside a 44px target. Settings stays
above, while status/version read as a shared lightweight cluster with the
action at its right. Existing 48px Logo and 82%/330px drawer cap provide visual
context, not a redesign of the rest of the product. The existing favicon SVG
paths are reused for the actual Recall logo, not a substitute lettermark.

The prototype offers pending/offline/conflict and dark-mode examples. Refresh
only simulates feedback and never reads storage or synchronizes data. The
loopback server has a three-file allowlist, rejects write methods and sets
`connect-src 'none'`. Only synthetic context is shown. No private source,
owner library, credentials, model or live API is accessed. It is not a shipped
or installable PWA and does not claim the real app's complete interaction logic.

## Validation And Delivery

- Initial Chromium/WebKit validation: 6/6 passed in 10.9 seconds.
- After restoring the exact existing logo and the prototype control's 44px
  touch area, final guarded validation passed 6/6 in 7.1 seconds.
- Checks cover 393 x 852 CSS pixels / DPR 3, 525 x 824 and 320px; same 13px
  typography, one action, 18px glyph/44px hit box/right alignment, zero page
  overflow, dark/offline/conflict examples, 59/34px safe-area stress, 20px text,
  reduced motion and no requests outside the local prototype origin.
- JavaScript/server syntax and targeted ESLint passed, diff whitespace passed.
  This changes independent static prototype assets, not production app code;
  no unnecessary app build/full-unit rerun or cloud/D1 mutation test was needed.
- Browser was opened visibly at `http://127.0.0.1:4424/` and retained as the
  user-facing deliverable. The user can open "局部原型" to compare other states.
  Generated screenshots remain ignored under `quality/footer-prototype/`.
- Physical iPhone Safari-installed behavior is outside this local static
  prototype's acceptance. The screenshot/browser dimensions are simulation.

Reproduction from the repository root, with installed browser paths supplied:

```sh
node prototypes/drawer-footer/server.mjs
node --check prototypes/drawer-footer/preview.js
node --check prototypes/drawer-footer/server.mjs
node node_modules/eslint/bin/eslint.js prototypes/drawer-footer
node scripts/run-playwright.mjs --config=prototypes/drawer-footer/playwright.config.ts --workers=2 --output=quality/footer-prototype/final
```

Browser commands ran outside macOS Seatbelt using the required launch guard
and global preflight; no sandbox marker or security setting was modified.
Logs: `/private/tmp/recall-footer-prototype-lint.log`,
`/private/tmp/recall-footer-prototype-browser.log`,
`/private/tmp/recall-footer-prototype-final-browser.log`.

## Source And Production

Source base: `23668eb2696ae1e4942fcad240025f601bcfde6a` in the clean publication
worktree. Requested prototype files and this record/index will be committed
and pushed normally; the actual source SHA/push outcome is appended afterward.
Original trial changes and unrelated style-lab files remain preserved.
The Windows vault/Graphify are still unavailable on this Mac; the previously
documented architecture fallback and targeted scoped reads remain in use.

No app deployment occurs. Current production remains
`8c11afc0-2e41-4515-8598-bc9210e031e4`, app source
`7e55bc939eaaf35f372dba26f339fd8d88a5211b`, `V1.1-20261105-1919`, at
`https://recall-memory.pages.dev/`. The previous compatible production is
`aff714f3-478e-41de-8d21-1cc0c0d98ac8`, unchanged by this design task.
No production rollback is needed. Local visual fallback is to reopen the
existing production design, not restore data, clear browser storage or reset
D1. Prototype integration waits for review rather than another immediate
publication.

Related: [prototype instructions](../../prototypes/drawer-footer/README.md),
[previous unified action](./20261105T191943+0800-drawer-unified-sync-update.md).

## Actual Source Outcome

At 2026-11-05T20:48:37+08:00, prototype source
`4e99d515de90c5f55129287eb764eac1afe048d8` was committed and pushed normally
to `xuda645-eng/Recall` main (`23668eb2..4e99d515`). Read-only remote verification
confirmed main equals that SHA. Only the seven prototype files and this
record/release index were included; screenshots and private data were excluded.
The final syntax, scoped lint, documentation links/prose and whitespace checks
passed again. The local server returned 200 and the visible prototype tab was
retained for review. This outcome append is documentation-only, with no app
deployment, production version change or owner-data mutation.
