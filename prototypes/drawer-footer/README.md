# Drawer Footer Local Prototype

One focused proposal for the user's compact-footer feedback. It is not a new
application build and does not replace the production UI.

- Settings, cloud status, timestamp, build identity and feedback all inherit
  one 13px font size, regular weight, font family and 20px line height.
- Secondary information uses muted color and spacing, not a smaller font.
  The timestamp remains aligned with the status text.
- All four persistent rows use 44px minimum height, 20px text line height and
  12px vertical padding, with no extra inter-row margins. Long text extends the
  row naturally; settings retains a 44px touch target. Text starts on one axis.
- A single 18px open circular arrow sits to the right of the information rows.
  A quiet 32px paper-colored circular surface replaces the squared outline
  inside the 44px target. It is not a full-row primary action. Existing
  paper/olive styling and the actual Recall logo are retained.
- At 393 x 852 and 525 x 824, the drawer uses the existing 82%/330px cap. The
  foreground is separate from the drawer. Synthetic import content provides
  context; this is not an interactive reconstruction of the whole app.
- "局部原型" opens controls for pending/offline/conflict and dark-mode examples.
  Clicking refresh only simulates feedback. No storage, credentials, images or
  real synchronization are involved. The server's CSP blocks network connections.

Run from the repository root:

```sh
node prototypes/drawer-footer/server.mjs
```

Preview: `http://127.0.0.1:4424/`. The server binds only to loopback, serves an
allowlist of three static files and rejects write methods. Keep it independent
of production cookies/card data. It is a design preview, not an installed PWA.

Validation uses the guarded launcher outside the macOS Seatbelt sandbox with
installed `RECALL_CHROMIUM` / `RECALL_WEBKIT` paths:

```sh
node --check prototypes/drawer-footer/preview.js
node --check prototypes/drawer-footer/server.mjs
node node_modules/eslint/bin/eslint.js prototypes/drawer-footer
node scripts/run-playwright.mjs --config=prototypes/drawer-footer/playwright.config.ts --workers=2 --output=quality/footer-prototype
```

Checks cover identical font size, one right-side refresh action, 44px hit area,
18px icon, narrow/no-overflow behavior, dark/offline/conflict examples, 59/34px
safe-area stress, larger text, no external requests and reduced motion. The
tests use 393 x 852 CSS pixels / DPR 3 plus 525 and 320px widths. These are
browser simulations only. Production integration is a later task after review.
