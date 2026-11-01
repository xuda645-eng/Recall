# Variant Comparison Inside The Original Installed PWA

- ID: `20261101T133526+0800-installed-context-variants`.
- Start: 2026-11-01T13:35:26+08:00.
- Source base: `6a77341e95c2727c6265255903cbb38905581077`, verified main.
- Previous production: `e31a1318-3c49-48ed-a341-ef310dda5103`, source
  `08c6e46c2f452733e74fe27dc074ccbbdde8cca9`, version `1.0-20261101-1114`.
- Fixed build version: `1.0-20261101-1335`.
- Scope: static read-only diagnostic page, its precache query matching, tests
  and physical-result documentation. Real app header/styles/data unchanged.
- Status: committed, pushed and deployed; public resource and live browser
  checks passed. Native variant results remain pending.

## Evidence And Purpose

The owner's 13:34 screenshot shows the original-installed static diagnostic
page still blurred at the Logo/controls' upper edges. It visibly reports
home-screen PWA mode. Unlike the separately installed A/B/C and D/E previews,
this reproduces the reported symptom without loading cards, React or cloud
scripts. It does not prove installation metadata is the cause. An expanded
Dynamic Island is visible here but was absent in earlier blurred images;
its necessity or contribution is not established. Screenshots stay private.

Compare the same three mechanisms within this reproduced context. Do not
ship one as a real-app fix merely because the earlier separate preview was
clear. Native results for these new original-context variants remain pending.

## Changes And Safety

- A preserves the current fixed shell, internal scroller and nonpainting
  safe-area sampler. Its geometry/styles are the prior diagnostic baseline.
- B retains that layout but paints an independent paper strip through the
  safe area, ending exactly at the Logo's top. It does not cover the Logo,
  change its padding/shadow, or intercept touches.
- C removes the sampler and fixed shell, uses document scrolling and a
  sticky header, preserving 48px controls, 8px gaps, 14px radii, all safe-area
  values and the safe-top + 10px Logo position.
- A small blocking same-origin boot script selects an allowlisted variant
  before the stylesheet loads. Same-origin links cause full navigations;
  selection is not persisted. The report identifies variant, scroll owner,
  header position and sampler paint geometry. No storage, cards, credentials
  or API reads/writes. Existing CSP still uses `connect-src 'none'`.
- Workbox additionally ignores only `status-case` when matching precached
  assets, retaining default tracking-key rules and the diagnostic navigation
  denylist. This lets all variants reuse the static precached document offline
  rather than returning the React fallback. No new manifest, SW scope,
  installation identity, origin, service or D1/secret/binding changes.
- Obsidian Windows paths and Graphify remain unavailable; used the supplied
  architecture map and targeted owning files. Unrelated worktrees preserved.

## Validation

- `node --check public/status-diagnostics/boot.js` and the same syntax check
  for `diagnostics.js`: passed.
- `node node_modules/vitest/vitest.mjs run src/lib/status-diagnostics.test.ts
  src/components/__tests__/memory-display-diagnostics.test.tsx`: 11 passed.
  New boot checks cover the three allowlisted variants, unsupported inputs,
  script-before-CSS ordering, original metadata and CSP.
- `node node_modules/typescript/bin/tsc -b --noEmit`: passed.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 132 existing warnings.
- `node node_modules/vitest/vitest.mjs run --coverage`: 1393 tests across 80
  files passed; coverage thresholds passed (41.71% statements, 39.43%
  branches, 36.41% functions, 45.23% lines).
- With fixed `RECALL_BUILD_VERSION=1.0-20261101-1335`, cached Chromium-1223
  and WebKit-2272 paths and approved unsandboxed guarded launcher:
  `node scripts/run-playwright.mjs --grep '原安装' --workers=2`: eight passed.
  Both engines exercise offline A/B/C full-page switching, original-origin
  return, 0/20/59/96px top and 34px bottom insets, 48px controls, 8px gaps,
  14px radii, 320/393/760/761/852px widths and document/internal scrolling.
- New local browser guards throw on static-document storage reads/writes or
  fetch. All variants and report refresh pass those guards; returning to
  Recall preserves the same synthetic card snapshot. Another check verifies
  no app chunks/API are loaded by the static page. Production mutation checks
  are explicitly skipped when `RECALL_URL` is set.
- Full `node scripts/run-playwright.mjs --workers=2` with the same version
  and browser variables: **68 passed, no skips**, in 1.7 minutes. Includes
  existing app drawer, review/undo, archive, import, keyboard/focus, responsive
  layouts, SW old-to-new activation and offline reopening. The launcher
  rebuilt the root-path production bundle before this suite.
- Synthetic WebKit B/C screenshots inspected. All 200 build files have a
  local SHA-256 inventory. The manifest, four main PWA icons and all existing
  app CSS files match the prior validated release bytes. No app-header source,
  root HTML, auth, Functions, database config, maps or private artifacts changed.
- 34 local Markdown links and `git diff --check` passed. Existing account/
  project and previous production `e31a1318` verified read-only with Wrangler.
- Browser simulations do not reproduce the native overlay and cannot prove
  any variant clear on the original iPhone. No blur fix or physical offline/
  update acceptance claimed. Evidence logs remain local under
  `/tmp/recall-installed-variants-*`.

## Publication And Recovery

- Source SHA: `51421fc7676e66af04d4aff01c8ebe7c306eaab2`. Normal
  `git push origin HEAD:main` advanced `6a77341` to `51421fc`;
  `git ls-remote origin refs/heads/main` confirmed the full SHA.
- At 2026-11-01T13:43:24+08:00, deployed the unchanged 200-file tested bundle
  from the clean task worktree using:

  ```sh
  CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main --commit-hash 51421fc7676e66af04d4aff01c8ebe7c306eaab2 --commit-message 'feat: compare header variants inside original installed PWA'
  ```

- Production deployment: `1279e5dc-511b-4b94-a57e-30ad662bcbfa`.
  Stable origin: <https://recall-memory.pages.dev/>. Immutable deployment:
  <https://1279e5dc.recall-memory.pages.dev/>. Production list verified source
  `51421fc`, this ID and prior `e31a1318` at 2026-11-01T13:44:41+08:00.
- Wrangler uploaded 30 changed assets, reused 168 and uploaded unchanged
  Functions plus routing/headers. No dirty-source flag, force push, new
  project, migration, binding, secret or authenticated production test.
- At 2026-11-01T13:44:39+08:00, a single reusable serial HTTP/1.1 curl process
  with 10-second connect and 30-second per-transfer limits checked **28 public
  resources** against the local SHA-256 inventory. App HTML/entry chunks,
  workspace JS/CSS, manifest/four icons, SW/Workbox, version and all four
  diagnostic files matched. Anonymous `GET /api/session` returned 401.
  Version response completed with HTTP 200, `Cache-Control: no-store` and
  `1.0-20261101-1335`. No failed asset transfer or retry in this release.
- Live Chromium/WebKit read-only check uses the guarded launcher, cached
  paths, `RECALL_URL=https://recall-memory.pages.dev/` and
  `node scripts/run-playwright.mjs --grep '原安装显示诊断公开只读入口'
  --workers=1 --output=/tmp/recall-installed-variants-live-results`.
  **Two passed**, no skips/retries, in 2.9 minutes (Chromium 1.7 minutes,
  WebKit 1.1 minutes). Both establish SW control/cache readiness, report
  display, online full-document A/B/C navigation and original-origin return.
  Do not count native installed-iPhone acceptance or live offline/update
  acceptance from these checks or local tests. No regression detected in
  completed checks; no rollback performed.

Compatible rollback target for a regression is the previous `e31a1318`
deployment, after rechecking active production to avoid overwriting another
release. It has the same data/schema/auth contracts, not a blur-free header.
Use existing Pages rollback only; never reset D1 or device storage.

## Device Handoff

Update the original Recall normally to `1.0-20261101-1335`, then use the same
**Logo menu > 设置与数据 > 顶部显示诊断 > 打开原安装内对照页** entry.
A retains the reproduced baseline. Compare B and C on first open and after
scrolling, and report which is clear with a screenshot showing the selected
variant. No separate installation, authorization, real-card import or data
clear is needed. Returning via **返回 Recall** preserves the original app.

Publication evidence is committed/pushed separately as documentation only;
it does not rebuild or redeploy the unchanged validated app bundle.
