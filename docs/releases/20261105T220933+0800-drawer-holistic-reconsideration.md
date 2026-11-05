# Drawer Prototype Holistic Reconsideration

Checkpoint: 2026-11-05T22:09:33+08:00 (Asia/Shanghai).
Status: new local proposal for review; no production deployment or acceptance claim.

## User Correction And Scope

The user was frustrated with repeated isolated adjustments, noted the refresh
button still did not align, and explicitly requested setting the current design
aside and reconsidering the whole drawer. The prior four loose rows/circular
button are rejected, not a baseline the user approved. The root issue was
grouping and alignment, not merely a font size or a different glyph.

This design re-establishes two roles: settings is a navigation entry; status,
time and version form a compact information group. Navigation/settings/info
share 14px type. Navigation and settings use the same semibold/icon treatment;
information uses regular weight, 22px line height and equal 8px row gaps.
The actual navigation text axis is shared by settings and all information text.
Settings/cloud icon columns use the same 30px leading slot and 14px gap.

The refresh arrow is paired with the version row, not centered on the entire
group. It has no isolated white circular backing. Its 18px glyph remains within
a transparent 44 x 44px target and stays vertically centered on the version
text block, including wrapping/enlargement. Removing the duplicate Recall
prefix leaves the full build identity `V1.1-20261105-1919` readable. The existing
48px Logo/appbar and stationary drawer/translated foreground remain visual
context. The prototype state switch moved inside the drawer brand region so
it no longer covers the foreground Logo at iPhone width.

This changes independent prototype assets, not the application or real sync
behavior. Only synthetic examples are used, with no storage or production API.

## Validation And Evidence

- Syntax and targeted ESLint passed; whitespace and documentation checks passed.
- Guarded Chromium/WebKit checks passed 6/6 in 8.2 seconds; after adding actual
  navigation-axis and enlarged version-center assertions, 6/6 in 6.6 seconds.
- Final delivery, including the prototype-control/Logo non-overlap check:
  6/6 passed in 6.5 seconds. Each run tested 393 x 852 CSS / DPR 3, 525 x 824
  and 320px, shared font size/family, actual left-axis equality, both 8px row
  gaps, version/action center equality, text/action separation, one refresh
  action, 44px target/18px icon, page overflow and local GET-only requests.
- Dark/pending/offline/conflict, 59/34px inset stress, all footer text enlarged
  to 20px, version/action center under enlargement, reduced motion and
  simulated feedback passed. Physical iPhone-installed PWA and real sync
  acceptance are not claimed. No unrelated full app build/tests were needed.
- The current local tab was reused and refreshed at `http://127.0.0.1:4424/`.
  Full 393px/525px context screenshots were visually inspected, not only a
  cropped footer. Synthetic screenshots remain ignored under
  `quality/footer-prototype/holistic-delivery/`.
- The specified Windows vault/Graphify remain unavailable on this Mac;
  targeted prototype reads were used as previously disclosed.

Reproduction from repository root, with installed `RECALL_CHROMIUM` and
`RECALL_WEBKIT` paths supplied and guarded browser execution outside Seatbelt:

```sh
node --check prototypes/drawer-footer/preview.js
node --check prototypes/drawer-footer/server.mjs
node node_modules/eslint/bin/eslint.js prototypes/drawer-footer
node scripts/run-playwright.mjs --config=prototypes/drawer-footer/playwright.config.ts --workers=2 --output=quality/footer-prototype/holistic-delivery
git diff --check
```

## Source And Production

Source base: `0bd41a3b2e33bb733ef8d680caad48fe1a525a9e` in the clean delivery
worktree. Actual source SHA/push outcomes are appended after delivery. Only
reviewed prototype assets/tests and task records/index are included. The
original dirty trial, style-lab, screenshots and all private files are excluded.

No application deployment occurs. Last recorded production remains deployment
`8c11afc0-2e41-4515-8598-bc9210e031e4`, app source
`7e55bc939eaaf35f372dba26f339fd8d88a5211b`, build `V1.1-20261105-1919`, at
`https://recall-memory.pages.dev/`. The previous compatible production
`aff714f3-478e-41de-8d21-1cc0c0d98ac8` is unaffected. No production rollback is
needed. Visual fallback uses the unchanged production UI; neither data rollback,
browser storage clearing nor history rewriting is needed or authorized.
The new design is a proposal, not user acceptance or permission to deploy it.

Related: [rejected prior attempt](./20261105T220235+0800-footer-refresh-spacing.md),
[prototype instructions](../../prototypes/drawer-footer/README.md).

## Actual Source Outcome

At 2026-11-05T22:13:50+08:00, source
`1705a59f41eaad42f119cf6f6297840dec9c0f5e` was committed and pushed normally
to `xuda645-eng/Recall` main (`0bd41a3b..1705a59f`). Only the seven reviewed
prototype/test/documentation files were included. Documentation checks, final
scoped lint and whitespace passed. Private files and generated screenshots
were excluded. This append is documentation-only. No application deployment
or user design acceptance is implied by source delivery.
