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
  checks passed. All three original-installed variants show blur in the
  owner's latest physical screenshots; none is an established fix.

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
clear. The physical result for these original-context variants is recorded
below and supersedes their previously pending acceptance status.

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

## Physical A/B/C Result

2026-11-01T14:03+08:00: the owner supplied three current screenshots, showing
the original-installed diagnostic page with A, B and C selected respectively.
Each visible mode label reports home-screen PWA and the selected variant.
All three show the same softened upper edge over the Logo and adjacent
controls. The screenshots do not show a clear winner. B's painted strip and
C's sticky/document-scroll structure therefore did not eliminate the visible
symptom in this original installation. Neither is approved as a real-app fix.

This is stronger evidence than the previous separate-installation previews,
where even A and original-style D looked clear. The difference remains
unexplained: it does not prove an installation defect, old app code, a card/
React cause, or a particular native WebKit condition. The expanded Dynamic
Island and low battery are common to these images but were not necessary
in earlier blurred screenshots; do not blame those states from correlation.

The images show the selected variants and top section, not the local display
report or before/after-scroll pairs. Computed safe-area values, visual viewport
offset/scale and actual sampler/header styles on this phone remain unverified.
Next retrieve the existing B/C **本机显示信息** reports, refreshed with the
page's plus button. Those contain display geometry only, not cards or auth.
Do not infer the native host's scroll-pocket insets directly from CSS values.

No new style patch, production release, additional install, storage clearing
or rollback follows this result. This is documentation-only evidence capture,
based on main `9b85a1831ce52c1823c1e029b4e3c3559f1e159f` in a new clean
worktree, preserving the parallel task's already merged changes. Validate
local links and diff, then commit/push without rebuilding/redeploying.
The three private screenshots remain attachments, not repository artifacts.

Documentation follow-up validation: 35 local Markdown links passed,
`git diff --check` passed, and the source/public/config diff is empty. App
tests and production deployment are not repeated for unchanged application
code. Normal main commit/push publishes this evidence only.

## Physical B Geometry Report And Native-Source Check

2026-11-01T14:08+08:00: the owner provided two screenshots covering the B
page's local report. The Logo upper edge is still visibly softened. The report
identifies `installed-context-20261101-r2` and variant B. Transcribed display
values only, not private images, card content or credentials:

| Field | Observed value |
| --- | --- |
| `navigatorStandalone` / `displayModeStandalone` | `true` / `true` |
| Screen / DPR | 393 x 852 CSS pixels / 3 |
| Inner viewport | 393 x 793 CSS pixels |
| Visual viewport | 393 x 793, offsetTop 0, scale 1 |
| Safe-area top / right / bottom / left | 59 / 0 / 34 / 0px |
| Logo top / height | 69 / 48px |
| Header / scroll owner | fixed / content |
| Captured `scrollTop` | 0 |
| Sampler display / height | block / 69px |
| Sampler background clip / pointer events | border-box / none |

The B CSS variant is active: its strip reaches safe-top + 10px, matching
the Logo top, and uses the actual-paint clipping mode instead of A's text
clipping. The problem is not simply that B failed to load or the tested
59px safe-area value differs from this phone. This does not prove WebKit
recognized the element as a native fixed-color extension or that the original
top effect must disappear. Width/opacity/native-layer state are not in this
report. The captured scrollTop can predate scrolling to the report, since
the previous instructions requested plus/refresh before scrolling; do not
use it as evidence that the scroller is broken.

852 - 793 = 59px, exactly the reported top safe area. This is a concrete
screen/viewport mismatch worth comparing with the known-clear installation,
not proof of double top padding or the blur's root cause. The native host
geometry is not exposed by DOM viewport values. In particular, no CSS
screen-height forcing, negative top offset or safe-area removal follows from
this observation. The prior 393 x 852 browser tests did not simulate this
native screen-to-viewport relationship.

### Primary-Source Research

Checked on 2026-11-01. The public WebKit main commit inspected was
`1c4737f59e9f4a1709fa1962a3439b9ea861f325` (commit time
2026-11-01T05:43:17Z); this is not established as iOS 27.0.1's shipped source.

- [Pinned WebKit native scroll-pocket code](https://github.com/WebKit/WebKit/blob/1c4737f59e9f4a1709fa1962a3439b9ea861f325/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm):
  `_updateNeedsTopScrollPocketDueToVisibleContentInset` compares native
  adjusted/obscured insets, native content offset, beyond-top state and edge
  style. `_shouldHideTopScrollPocket` preserves the effect when that native
  visible-inset flag is set, rather than always hiding it for a color extension.
  Inference: active CSS paint geometry alone does not establish the native
  visibility decision. The B report cannot evaluate these private inputs.
- [WebKit report 313800](https://bugs.webkit.org/show_bug.cgi?id=313800):
  still NEW at lookup, reports a viewport shorter than the screen by a status
  area while CSS still reports a top safe inset, including iOS 27 beta comments.
  This resembles the geometry, but concerns another app/device/status-bar
  recipe and does not establish Recall's blur cause or an applicable fix.
- [WebKit report 317153](https://bugs.webkit.org/show_bug.cgi?id=317153):
  install-time geometry differences were reported in early beta comments,
  but a later comment says no longer reproducible in beta 4 and the report
  was closed FIXED in October. Do not cite only the older comments to claim
  an unresolved installation defect on this iOS 27.0.1 phone.

The preferred search script failed `invalid_api_key` and then its own
`NameError: AGENT_PLAN_URL` while displaying an error hint. Recovered with
built-in search and direct primary-source lookup; no key, account or security
configuration was changed and no credentials were requested from the owner.

### Next Paired Evidence

If the existing, previously clear **Recall 完整壳对照** home-screen icon is
still installed, open D from that icon and expand **诊断信息（仅本机）**.
Its already-shipped report includes screen/viewport, visual viewport offset,
Logo top and edge height. Compare those with this B report on the same phone
now, also checking whether D is still clear. Do not substitute a Safari tab
or add another installation. If the old icon is absent, request that fact
rather than telling the owner to reinstall it. C's native/scroll state remains
unmeasured. No new code patch or deployment is justified by B's report alone.

This follow-up is documentation only on main base `c0e61992dd29bcee6164d1e60abdfc3d38f31131`.
Preserves the other task's published changes. Validate Markdown links and
diff, then normal commit/push; no app tests/build or production replacement.
Completed: 35 local documentation links passed, diff whitespace passed and
the application/public/config diff remained empty. External primary links
were opened during research, not inferred from search snippets alone.
