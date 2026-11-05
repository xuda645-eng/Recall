# Drawer Footer Local Prototype

One focused proposal for the user's compact-footer feedback. It is not a new
application build and does not replace the production UI.

- After the user rejected the piecemeal footer, the whole drawer was reconsidered.
  Navigation, settings, status, timestamp and version now share a 14px font size.
  Settings follows the navigation's icon/semibold treatment; information stays
  regular weight with muted secondary text, not tiny mixed-font captions.
- Settings is an entry above a compact three-row information group. Status,
  time and version share the navigation text axis and equal 8px row gaps with
  22px line height. Long text wraps naturally. The redundant Recall prefix is
  removed from the version because the drawer already identifies the app.
- The 18px open circular arrow is paired with the version row and vertically
  centered on that row, including when text wraps. It no longer floats between
  rows or has an isolated circular backing. The transparent 44px touch target
  and existing paper/olive styling and actual Recall logo remain.
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
