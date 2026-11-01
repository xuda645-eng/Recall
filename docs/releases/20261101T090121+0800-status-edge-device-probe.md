# iOS Installed PWA Status Edge Device Probe

- Record: `20261101T090121+0800-status-edge-device-probe`.
- Scope: isolated synthetic prototype, tests and evidence corrections only.
- Status: local validation passed; preview publication pending. No production
  fix or physical acceptance is claimed.
- Start: 2026-11-01T08:56:52+08:00; local validation completed approximately
  2026-11-01T09:02:00+08:00.
- Source base: `9a7608c625fb07772526e6c34accba0002e161f0`, user-owned
  `xuda645-eng/Recall`. Implementation commit: the commit adding this record;
  exact SHA and normal main push result to be appended after publication.
- Production remains `https://recall-memory.pages.dev/`, deployment
  `2ac571d2-1cc4-4999-93ce-0f3330ce10f2`, source
  `a319c3bed7150080fc322222f260aa719448ca3b`, as verified by Pages CLI.
- Previous state is not known-good for native blur. There is no proven
  blur-free production rollback target. No schema, API, data or auth changes.

## Physical Evidence And Changed Approach

The owner supplied iOS Settings showing iOS 27.0.1 and explicitly confirmed
Safari-installed home-screen PWA usage. Their latest app/drawer screenshots
show build `1.0-20261101-0230`, with the Logo upper edge still blurred. Earlier
updates/relaunches were already confirmed; do not repeat cache-clearing or
reinstall advice. The safe-area-expanded sampling layer shipped in `3e6a08e`
and retained by `a319c3b` did not resolve the reported physical symptom.

This is a failed physical result for the previous attempt, not a new regression
introduced here. Earlier automated passes remain valid only for their asserted
geometry/interaction/cache behavior. Private screenshots are not published.
Production patching is on hold pending a meaningful device comparison.

## Changes

`prototypes/status-edge/site/` contains three separately navigated cases with
the same Recall Logo/control geometry: existing fixed/internal-scroll baseline,
independent painted safe-area surface, and document-scroll/sticky-header.
See [probe instructions and research](../../prototypes/status-edge/README.md).
The page visibly distinguishes browser vs installed mode and reports local
viewport/inset information. An amber T icon, different manifest identity and
separate origin prevent confusion with the real app.

The preview has synthetic text only, no app persistence or cloud API client.
Only static `site/` files are eligible for deployment, exported from the exact
commit outside the app directory. No Functions, D1, secrets, private cards or
private screenshots are part of that artifact. Production sources/bundle are
unchanged. `docs/PWA.md` and the release index now acknowledge the failed native
result rather than implying the last sampling attempt merely awaits evidence.

## Validation

Commands ran with the existing dependency symlink, without package installation:

- `node --check prototypes/status-edge/site/boot.js`, `probe.js`, `sw.js`: pass.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 132 existing warnings.
- `node node_modules/typescript/bin/tsc -b --noEmit`: pass.
- `node node_modules/vitest/vitest.mjs run`: 1382 tests / 78 files passed.
- `node node_modules/vite/bin/vite.js build`: pass, 154 precache entries. This
  unchanged production app build is NOT the preview artifact and is not deployed.
- With `RECALL_CHROMIUM` pointing to cached chromium-1223 and `RECALL_WEBKIT`
  to cached webkit-2272: `node scripts/run-playwright.mjs --config
  prototypes/status-edge/playwright.config.ts --workers=2`: 15 passed,
  1 explicit macOS WebKit offline-emulation skip. The launcher ran through
  approved sandbox escalation. Geometry/insets, scroll architecture, touch
  controls, drawer first frame/toggles/closing/focus, mode diagnostics,
  narrow/landscape/reduced-motion, request isolation and Chromium offline
  A/B/C navigation checked. Synthetic mobile screenshot visually inspected.
- First browser attempt failed before browser startup: server path was resolved
  relative to config directory. Corrected to `../../scripts/serve-task-preview.mjs`
  and reran successfully; not counted as a passing attempt.
- First sandboxed Wrangler `whoami`, `pages project list` and `pages deployment
  list --project-name recall-memory --environment production` failed with npm
  cache `EPERM`. Same read-only commands succeeded after sandbox escalation;
  no cache ownership or OS security settings were changed.
- `wrangler@4.156.0 pages download config recall-memory --cwd <isolated tmp>`
  verified the existing project: no default/preview D1 or variables, with DB
  and personal space configured only under production. No configuration changed.
- Account and project verified through existing OAuth, not a new resource.

## Publication And Recovery

- Intended preview: unique `ios27-edge-20261101` non-main deployment in the
  existing `recall-memory` project. ID/URL and public checks pending.
- Commit/push timestamps and results pending.
- No production deployment, replacement or rollback is performed by this task.
- If the preview fails safety checks, do not share it as ready. Stop distributing
  its URL and correct it on the same isolated preview. No production rollback
  is needed because this artifact does not replace production.
- Native iOS 27.0.1 blur, actual home-screen installation, offline cold launch
  and iOS update lifecycle remain unverified. If baseline A does not reproduce,
  do not infer that B/C solve the production issue.
