# Installed PWA Status Edge Comparison

This is an isolated, synthetic device probe, not a production fix. The owner
reports the Logo row remains blurred on iPhone 15, iOS 27.0.1, after launching
the Safari-installed home-screen PWA at build `1.0-20261101-0230`. The previous
safe-area sampling attempt therefore failed physical acceptance.

## Phone Check

Use the HTTPS preview URL recorded in
[the task record](../../docs/releases/20261101T090121+0800-status-edge-device-probe.md).
Add this page separately to the home screen as **Recall 顶部对照**, identified by
an amber T icon. Do not delete, reinstall or clear data for the real Recall app.
Launch the test icon and confirm the page reports home-screen PWA mode.

Compare A, B and C. Each selection performs a full same-origin navigation.
Check the Logo/title/plus upper edges on initial display, while scrolling, and
after opening/closing the drawer. Report which variant is blurred; screenshots
of this synthetic page can help. If A does not reproduce, the simplified probe
has not isolated the production trigger and B/C cannot be called fixes.

- A: current fixed app/shell, internal content scroller, standalone WebKit
  nonpainting `safe-area + 11px` sampling element outside the foreground.
- B: same fixed layout, independent painted top surface ending exactly at the
  controls' top edge. It must not cover the Logo.
- C: document scroll with a sticky header, no sampling element.

All cases retain the existing colors, Logo paths, 48px controls, 8px gaps,
14px radii, soft shadows and `safe-area + 10px` control position. C changes the
scrolling architecture for diagnosis only, not the production implementation.
The diagnostic panel shows viewport/inset/mode values and UA locally. It never
uploads them. The UA alone is not treated as authoritative OS-version evidence.

## Isolation And Hosting

Only `site/` is published, from committed bytes, to a unique non-main preview
in the existing `recall-memory` project. Do not deploy the app's `dist/`, root
Functions, root Wrangler config or real data. `site/` has no API client,
credentials, cookies, LocalStorage, IndexedDB, remote scripts or analytics.
It uses a distinct manifest ID and preview-origin-scoped static Service Worker
cache. The worker caches the canonical directory document rather than the
host's redirected `index.html` response. The local server reproduces that
redirect for regression checks. The worker handles only an explicit static-asset allowlist and never
deletes other caches. A custom 404 avoids SPA fallback for `/api/*` paths.

Publish an exported `site/` outside the app tree to avoid Wrangler discovering
the production Functions/config. Use `--branch ios27-edge-20261101` and the
reviewed commit hash, never `main` or `--commit-dirty=true`. Keep the exact
immutable deployment URL in the task record. Preview publication does not
authorize production changes, infrastructure creation or paid resources.

## Verification

From the repository root, using existing dependencies:

```sh
node --check prototypes/status-edge/site/boot.js
node --check prototypes/status-edge/site/probe.js
node --check prototypes/status-edge/site/sw.js
node node_modules/eslint/bin/eslint.js prototypes/status-edge
RECALL_CHROMIUM='<cached Chromium executable>' RECALL_WEBKIT='<cached WebKit pw_run.sh>' node scripts/run-playwright.mjs --config prototypes/status-edge/playwright.config.ts --workers=2
```

Use the approved unsandboxed browser launcher on macOS. Set `STATUS_EDGE_URL`
to the isolated HTTPS deployment for public checks; the config rejects the
production origin. Tests cover both engines at 393 x 852 / DPR 3, 0/20/59/96px
top-inset stress, 34px bottom inset, scrolling, first animation frame, rapid
toggles, all closing paths, focus restoration, reduced motion and narrow/
landscape widths. Offline navigation is tested only in Chromium; macOS WebKit
offline emulation is explicitly skipped, not counted as passing. Physical
installation, native blur, offline cold launch and native inset behavior remain
unverified. Browser success does not establish an effective native workaround.

## Research Basis

[WebKit's current native implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm)
has a visible-content-inset condition that can retain the top scroll effect
despite a detected color extension. Its current source is not proven to be the
exact iOS 27.0.1 implementation; this only motivates the independent layout
comparison. [WebKit bug 317153](https://bugs.webkit.org/show_bug.cgi?id=317153)
documents other installed-app geometry issues and deprecated status-bar modes,
but its resolution does not establish that Recall's blur is fixed. No proposed
CSS technique here is an official API for disabling native effects.
