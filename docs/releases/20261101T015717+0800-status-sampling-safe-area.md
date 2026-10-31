# 20261101T015717+0800 - Safe-Area Status Sampling

## Status And Scope

- Started and recorded: `2026-11-01T01:57:17+08:00` (Asia/Shanghai).
- Status: committed, normally pushed and deployed; publication checks in progress.
- Local validation and production build completed: `2026-11-01T02:03:49+08:00`.
- User confirmed that the installed iPhone still blurred the Logo's upper edge
  after applying the available update and reopening from the home screen.
  Do not classify this as a decorative shadow or assume a stale cache.
- Source: `xuda645-eng/Recall`, target `main`, starting SHA
  `a9ce6d8fe1dd6897692156b81cd8966ab43bee5b`.
- Work is isolated in `/tmp/recall-status-sampling-20261101`. Existing dirty
  `docs/README.md` and `skills/` in the chat worktree remain untouched.
- No card, storage, credential, API, D1, manifest, origin or paid-resource change.

## Diagnosis And Change

The earlier body-level, empty fixed sampling element had a constant 11px height.
It could cover only the very top of the layout viewport, not a sample position
below a nonzero top inset. The revised region extends through the real top safe
area plus 11px. Its position remains zero; only the invisible sampling geometry
changes. Logo position, 48px controls, 8px gaps, 14px radii, shadows, the opaque
header and drawer movement remain unchanged.

This is a coverage correction to an experimental compatibility workaround, not
a demonstrated explanation of the user's native rendering state. WebKit's
layout-viewport edge sampling and host obscured insets are distinct from CSS
box measurements. A macOS browser cannot reproduce or prove the installed
iPhone's native scroll-edge suppression.

Primary sources read on `2026-11-01`:

- [WebKit fixed-container sampling and layout viewport](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalFrameView.cpp).
- [WebKit sample margin](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/PageColorSampler.h).
- [WebKit native color extension and obscured insets](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/Cocoa/WKWebView.mm).
- [WebKit iOS scroll-pocket visibility conditions](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm).

Changed files:

- `src/components/memory-appearance.css`: replace constant sampling height with
  the safe-area-aware region; retain nonpainting text clipping and no hit testing.
- `e2e/memory-workspace.spec.ts`: test 0/20/59/96px insets, unchanged Logo position,
  sampling coverage, light/dark nonpainting pixel equality, and existing drawer,
  sheet, desktop and ordinary-browser boundaries.
- `docs/PWA.md` and this release index/record: document the candidate and limits.

## Validation And Recovery

Environment: Node `22.22.0`; existing app dependencies reused with an ignored
symlink, no install/purge/lockfile change. The Windows vault and Graphify are not
available on this Mac. Targeted inspection used the supplied map and release docs.

- Read-only `npx --yes wrangler@4.156.0 whoami` failed in the filesystem sandbox
  with npm-cache `EPERM`. Repeating it through approved escalation succeeded;
  `pages project list` and `pages deployment list --project-name recall-memory
  --json` confirmed the existing account/project and production below. No cache
  ownership or credential changes were made.
- The first local regression command was
  `RECALL_WEBKIT=<cached WebKit> node scripts/run-playwright.mjs --project
  iphone15-webkit --grep '顶部采样层' --workers=1 --output=/tmp/recall-edge-red`.
  The guard rejected Seatbelt before browser launch (`RECALL_BROWSER_SANDBOX`).
  Its escalated retry failed startup preflight because the config checks both
  engines and the default Chromium headless-shell binary was absent. Recovery
  adds the existing Chromium executable as well, without installing or bypassing
  the guard. No tests passed in either failed startup attempt.

Cached executable variables used for subsequent browser commands:

```sh
RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'
```

After correcting the executable paths, the pre-fix WebKit command failed at
the intended assertion: a 20px simulated inset still produced an 11px sampling
region instead of 31px. This is a red geometry regression, not a reproduced
native iPhone blur. After the CSS correction:

| Command | Result |
|---|---|
| `node node_modules/vitest/vitest.mjs run src/components/__tests__/memory-status-edge.test.tsx` | 4 passed. |
| `node node_modules/typescript/bin/tsc -b --noEmit` | Passed. |
| `node node_modules/eslint/bin/eslint.js .` | 0 errors, 132 existing warnings. |
| `node node_modules/vitest/vitest.mjs run --coverage` | 74 files / 1341 passed, 19.54s; coverage thresholds passed. |
| `node scripts/run-playwright.mjs --grep '顶部采样层\|状态栏\|不透明\|iPhone15首页' --workers=2 --output=/tmp/recall-edge-focused` | Both cached engines, 8 passed, 27.7s. |
| `node scripts/run-playwright.mjs --workers=2 --output=/tmp/recall-edge-full` | Both cached engines, 46 passed, 1.4m. |
| `node node_modules/typescript/bin/tsc -b` | Passed. |
| `node node_modules/vite/bin/vite.js build --mode production` | Passed; 154 precache entries / 3248.50 KiB; existing large-chunk advisory. |
| `git diff --check` and Node relative Markdown link check | Passed; 25 relative links resolved. |

Coverage: statements 40.94%, branches 38.73%, functions 35.68%, lines 44.53%.
Browser commands used both exported cached executable variables and approved
unsandboxed execution through the existing guarded launcher. Baseline remains
393 x 852 CSS pixels / DPR 3. The full suite includes long reading, import/update,
rating/undo, touch/focus, breakpoint/inset stress, caching, offline reopening and
refresh persistence. Synthetic WebKit screenshot inspected: Logo and controls
remain sharp and unobscured; no native iOS status bar exists in this screenshot.
Light/dark screenshots with the sampler shown/hidden were byte-identical.
The shipping iOS feature-query rules were activated for geometry testing in
macOS WebKit; this is explicitly annotated as simulation.

All browser mutation checks use isolated synthetic local data, never the
owner's authenticated production library. D1/cloud tests are not required for
this CSS-only app change; no server code or schema changed. Graphify was still
unavailable after editing, so no graph refresh is claimed. All validated dist
file hashes are retained locally to compare the committed rebuild before upload.

The remote main tip was read as the starting SHA. Existing documentation/skill
edits in the separate main worktree are also excluded from this clean release.
## Publication And Post-Deploy Checks

- Implementation commit: `3e6a08ed133169541ce3aa48f9f79f3533360091`.
  Normal push `git push origin HEAD:main` succeeded:
  `a9ce6d8..3e6a08e HEAD -> main`. The clean detached copy avoids publishing
  either chat-worktree or main-worktree dirty documentation/skill changes.
- Rebuilt the committed production bundle and checked all validated file hashes
  with `shasum -a 256 -c /tmp/recall-edge-validated.sha256`; all matched.
  `git status --porcelain` was empty before upload. No dirty override was used.
- Rechecked production immediately before upload: it still pointed at the
  recorded previous deployment. Used the verified account and command
  `npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory
  --branch main --commit-hash 3e6a08ed133169541ce3aa48f9f79f3533360091
  --commit-message 'fix: extend iOS status sampling through the safe area'`.
- Publication succeeded, uploading 26 new files / 167 existing, Functions and
  the existing route manifest. Deployment ID:
  `2d0c437c-ef6b-4f0a-98ae-3a3c0b8aa3b5`,
  `https://2d0c437c.recall-memory.pages.dev/`. Authenticated deployment listing
  verified production/main/source `3e6a08e` at `2026-11-01T02:08:17+08:00`.
- Root production HTML and manifest returned 200 and matched committed bytes.
  Initial sequential curl verification used `--connect-timeout 10 --max-time 30`
  and stopped on a TLS timeout fetching `sw.js`. One unsandboxed 20s/60s retry
  also timed out. An independent parallel Node fetch probe (60s signal budget)
  matched two icons and confirmed anonymous `/api/sync` returned 401, but other
  connections timed out. Its identical unsandboxed retry succeeded for `sw.js`,
  all three manifest icons and `assets/memory-workspace-JtOBCVMR.css`: every file
  returned 200 and matched the committed bytes; anonymous API remained 401.
  Original transport failures remain failures, not retrospectively passes.
- The existing in-app browser could be listed but tab binding failed with
  `browser.user is unavailable`. A fresh URL/ID lookup and the documented direct
  binding did not recover it. No real-data page reload/update was performed.
  Public acceptance uses separate anonymous browser contexts instead.
- Public command: exported `RECALL_URL=https://recall-memory.pages.dev/` and
  both cached executables, then
  `node scripts/run-playwright.mjs --grep '顶部采样层\|不透明固定' --workers=2
  --output=/tmp/recall-edge-public`. Both WebKit checks passed (42.8s and 1.1m),
  including actual new CSS, SW control/cache readiness, safe-area geometry,
  drawer, light/dark, sheets, route navigation and reading.
- Additional local update check:
  `node scripts/run-playwright.mjs --config /tmp/recall-edge-update.config.mts
  --workers=2 --output=/tmp/recall-edge-update`, with both cached executables.
  Two checks passed in 12.0s. The previous bundle's index matched pre-release
  production; a local server switched to the exact committed candidate bundle.
  Both engines displayed and clicked the actual update prompt, loaded a new
  CSS URL containing the safe-area rule, and retained synthetic cards, decks,
  review logs, sessions and an unrelated preference. No page errors. The guarded
  temporary config imports this checkout's preflight; no browser safety bypass.
  This proves a local update transition, not the user's physical update delivery.

No regression has been demonstrated and no rollback has been performed. Final
public Chromium outcome and verification completion will be appended below.

## Production And Recovery

- Production before this task: `0a8d051f-3349-4a20-afbf-c1d12deeaf9e`, source
  `b19818947471d0c078b7d72c9fd95e01e9839a13`,
  `https://0a8d051f.recall-memory.pages.dev/`.
- Stable origin: `https://recall-memory.pages.dev/`, project `recall-memory`.
- Previous local/public validation limits are recorded in
  [main integration](./20261101T010911+0800-main-integration.md). Its native blur
  is a known limitation, not a known-good visual result.
- If this candidate introduces a regression, first recheck current production
  to avoid overwriting a newer release. Restore the recorded previous Pages
  deployment using Pages deployment rollback, then verify the origin, assets,
  Service Worker and affected flows. No schema changes make this asset rollback
  compatible; it restores the prior native-blur limitation. It does not undo
  local data or Service Worker state. Never reset D1, clear device storage,
  reinstall the PWA, rewrite shared history or force-push as a recovery shortcut.
- Physical iPhone 15 standalone launch, native top-edge appearance, dynamic
  insets, keyboard, offline cold reopening and delivery of this specific update
  remain unverified. Browser passes must not be reported as physical acceptance.
