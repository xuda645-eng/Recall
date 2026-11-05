# Footer Prototype Typography Correction

Checkpoint: 2026-11-05T21:55:01+08:00 (Asia/Shanghai).
Status: corrected local prototype for review; no production deployment.

## Request And Changes

The user correctly noted the previous prototype still mixed footer font sizes.
It only matched cloud status and version at 13px, while settings was 14px/bold
and timestamp/feedback was 11px. That did not make the whole footer consistent.

All five footer text roles now inherit one font family, 13px size, regular
400 weight and 20px line height from `.drawer-footer`. A single CSS variable
controls size, including enlarged-text checks. Color and spacing alone provide
information hierarchy. The right-side 18px refresh glyph and 44px touch target
are unchanged. Prototype notes and README now describe the corrected scope.
Navigation and the rest of the app are not redesigned.

## Verification

- Syntax checks and scoped ESLint passed; diff whitespace passed.
- Guarded Chromium/WebKit suite: 6/6 passed in 14.6 seconds. The typography
  assertion now includes settings, status, time, version and feedback and checks
  font family, weight, size and line height, not only two text elements.
- 393 x 852 CSS pixels / DPR 3, 525 x 824 and 320px checks retain zero page
  overflow and a visible/hit-testable single refresh action. Enlarged text sets
  all five roles to 20px. Dark/pending/offline/conflict, 59/34px inset stress,
  reduced motion and synthetic action feedback passed.
- `http://127.0.0.1:4424/` returned 200. Its existing browser tab was refreshed
  and retained for comparison. Screenshots remain ignored in
  `quality/footer-prototype/uniform-typography/`.
- This is an isolated static prototype, not an app build or installed PWA.
  No owner storage, cloud credentials or production API was used. Full app
  tests/build and physical iPhone acceptance are not claimed for this task.
- The specified Windows vault and Graphify remain unavailable on this Mac;
  targeted reads used the known prototype paths instead.

Commands from the repository root:

```sh
node --check prototypes/drawer-footer/preview.js
node --check prototypes/drawer-footer/server.mjs
node node_modules/eslint/bin/eslint.js prototypes/drawer-footer
node scripts/run-playwright.mjs --config=prototypes/drawer-footer/playwright.config.ts --workers=2 --output=quality/footer-prototype/uniform-typography
git diff --check
```

Browser paths were supplied through `RECALL_CHROMIUM` and `RECALL_WEBKIT`;
the guarded launcher ran outside macOS Seatbelt with tool approval.

## Source And Production

Source base: `e4fc44e6a4ad91c655fd7723ed5aa817e40942b6` in the clean delivery
worktree. Only the prototype correction and its documentation are committed;
original trial changes and unrelated files are preserved. Actual source SHA
and push results are appended after source delivery.

Production remains deployment `8c11afc0-2e41-4515-8598-bc9210e031e4`, app source
`7e55bc939eaaf35f372dba26f339fd8d88a5211b`, build `V1.1-20261105-1919`, at
`https://recall-memory.pages.dev/`. No app deployment, origin or version change
occurs. The previous compatible production `aff714f3-478e-41de-8d21-1cc0c0d98ac8`
is unaffected. Local visual fallback is the previous prototype source or the
unchanged production view; no data clearing, database rollback or history
rewriting is needed. Formal app integration still waits for design review.

Related: [previous prototype](./20261105T203926+0800-drawer-footer-prototype.md),
[prototype instructions](../../prototypes/drawer-footer/README.md).

## Actual Source Outcome

At 2026-11-05T21:57:11+08:00, source
`b91c43187ca8037ab06dc5385f9ec537e7813016` was committed and pushed normally
to `xuda645-eng/Recall` main (`e4fc44e6..b91c4318`). The six reviewed files
contained only prototype code/tests and documentation. Ignored synthetic
screenshots and all private files were excluded. Documentation links/prose and
diff checks passed before commit. This outcome append is documentation-only;
there is no Cloudflare deployment or production UI change.
