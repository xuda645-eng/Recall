# Full Production Shell Device Comparison

The owner physically tested the preceding simplified A/B/C PWA on iPhone 15,
iOS 27.0.1, and reported all three were clear. The supplied screenshot shows
A in detected standalone mode with a sharp Logo. A therefore failed to
reproduce the production issue; neither B nor C is an established fix.

This probe builds the actual unchanged application entrypoint, React startup,
stylesheets, MemoryWorkspace, drawer, status-edge portal and Workbox setup.
It adds a local diagnostic panel, separately named installation manifest,
network fence and generated synthetic snapshot. Unlike A/B/C, it does not
reimplement the shell with approximate CSS. The safe-area/control geometry and
system status-bar meta remain unchanged.

- D: actual production shell and root background, including the existing
  body's `overscroll-behavior-y: none` and async startup.
- E: identical to D, except `html,body,#root` receive the paper background
  before app startup. No extra top padding, shadow removal or filter override.

The full app can render test interactions, but pairing/cloud/online import are
deliberately disabled. Do not enter credentials or import private cards. The
12 cards in two groups are generated examples, not the owner's data. Local
changes are confined to this preview origin; initialization never overwrites
an existing snapshot. Production-origin execution is rejected by a guard.

## Interpretation And Phone Handoff

The current HTTPS URL is in the [task record](../../docs/releases/20261101T104013+0800-full-shell-device-probe.md).
Install separately as **Recall 完整壳对照**, without removing or reinstalling
Recall. First check D, then E only if D is blurred. Verify the mode label says
home-screen PWA. Check initial appearance, scroll and drawer open/close.

- D blurred, E clear: root surface/startup color is a candidate for further
  confirmation, not yet permission to declare the production fix accepted.
- Both blurred: root color alone is insufficient; investigate full startup
  and scroll ancestry next.
- Both clear: the full source also does not reproduce in a new isolated
  installation. Original installation state, device-local state, startup
  timing and context remain candidates. Do not assert that reinstalling the
  real app is safe, necessary or proven to solve it.

The diagnostic information remains local. The preview does not have the same
installation identity, data, server or exact timing as production; those are
deliberate safety differences and limit causal conclusions.

## Build And Checks

```sh
RECALL_BUILD_VERSION=1.0-20261101-1040 node node_modules/vite/bin/vite.js build --config prototypes/status-shell/vite.config.ts
node --test prototypes/status-shell/boot.test.mjs
node --check prototypes/status-shell/site/probe-boot.js
node --check prototypes/status-shell/site/probe-controls.js
node node_modules/eslint/bin/eslint.js prototypes/status-shell
RECALL_CHROMIUM='<cached Chromium>' RECALL_WEBKIT='<cached WebKit>' node scripts/run-playwright.mjs --config prototypes/status-shell/playwright.config.ts --workers=2
```

Only `dist/status-shell/` is publishable. Copy that reviewed build outside the
app tree before deploying to unique non-main preview `ios27-shell-20261101`
in the existing `recall-memory` project, with the exact source commit hash.
Do not deploy Functions, Wrangler config, secrets, source maps or private data.
The outer `dist/` is not this preview. Keep the `1040` build version constant
through validation and publication. The page also identifies itself as
`shell-20261101-r1` rather than pretending to be the production release.

For public browser checks, set `STATUS_SHELL_URL` to the isolated deployment.
The config rejects the production origin. Tests verify same-origin resources,
client-side interception without API transmission, source shell geometry,
mode reporting, drawer operation, one manifest, D/E switching and Chromium
offline reopening. macOS WebKit offline emulation is explicitly skipped;
neither engine simulates the native iOS overlay.

## Evidence Limits

Current and historical repository `index.html` both use status-bar `default`,
not `black-translucent`. Therefore the old-installation explanation is not
established merely from the simplified probe being clear.
[WebKit bug 317153](https://bugs.webkit.org/show_bug.cgi?id=317153) reports
installation-dependent geometry in beta versions, subsequently resolved;
it is a research lead, not proof for this phone running 27.0.1. Do not recommend
deleting installed app data or claim an OS-wide unavoidable defect.
