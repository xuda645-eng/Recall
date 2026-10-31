# Idle Topbar And WeRead Workers Compatibility

## Identity And Times

- Release ID: `20261031T232024+0800-topbar-weread-runtime`.
- Scope: mobile shell CSS, shared upstream transport, regression tests and docs.
- Status: local validation passed; commit, push and production deployment pending.
- User target: iPhone 15 home-screen PWA, portrait; user reports iOS 27.
- First regression run: `2026-10-31T23:14:22+08:00`.
- Local validation completed and record created: `2026-10-31T23:20:24+08:00`.
- Commit/push, deployment, public verification and completion times: pending.

## Changes And Diagnosis

The previous opaque fixed header did not remove its shell's idle
`translate3d(0,0,0)`. The mobile shell now has `transform: none` while closed;
the existing open-drawer transform and transition remain. The foreground page
and Logo still move together. Regression checks require every idle header
ancestor to be transform-free across routes and both themes. This removes a
potential iOS compositing trigger, not a physically verified explanation of
the user's screenshot. No viewport, safe-area, control size or storage changes.

The shared server transport used `redirect: 'error'`. Actual local workerd
rejected that option with a `TypeError` before sending the gateway request;
the server/client collapsed it into the apparent timeout. A staged probe
isolated the failure to fetch construction, not JSON parsing or credentials.
Cloudflare documents the unsupported mode in its
[Request API](https://developers.cloudflare.com/workers/runtime-apis/request/).
Node/Vitest mocks had not exercised that runtime restriction.

The transport now uses `manual`. Existing non-OK rejection also rejects every
redirect, cancels its body and never follows `Location`; keys are not forwarded
to redirect destinations. This shared correction also applies to Ark calls,
but no live paid model call was performed. Added tests cover 301/302/303/307/308,
one fixed gateway request, body cancellation and secret-safe errors.

Affected files: `src/components/memory-appearance.css`,
`shared/server-weread.ts`, `cloud-tests/weread.test.ts`,
`e2e/memory-workspace.spec.ts`, `docs/PWA.md`, `docs/WEREAD_IMPORT.md`.
No D1 migration, API shape, authorization, rate limit, credential, library data
or import-confirmation changes. Private probes and credentials stay outside Git.

## Validation Evidence

Environment: macOS, Node `22.22.0`, installed dependencies, Wrangler `4.156.0`.
Browser baseline: `393 x 852` CSS pixels, DPR 3, Chromium and cached WebKit.
WebKit here is not a simulation of the user's exact iOS 27 build.

- Before the fix: `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts cloud-tests/weread.test.ts`
  failed the two redirect-mode assertions (7 passed, 2 failed).
- Before the CSS fix: mobile `--grep '不透明固定'` failed the new transform-free
  ancestor assertion in both browsers. Original opacity assertions were retained.
- Actual local workerd probe: `curl --fail --silent --show-error --max-time 55 http://127.0.0.1:8798/probe`.
  Before: 502 in 13ms, apparent timeout. After: 20 notebook rows, valid cursor,
  one selected book, 77 highlights, 680ms, zero production library writes,
  zero model calls. The worker imports the actual changed server module.
  It uses synthetic in-memory rate accounting and a private credential file.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts cloud-tests/weread.test.ts`:
  9 passed after the change.
- `node node_modules/eslint/bin/eslint.js .`: passed, 0 errors, 131 existing warnings.
- `node node_modules/typescript/bin/tsc -b` and
  `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json`: passed.
- `node node_modules/vitest/vitest.mjs run --coverage`: 1141 passed in 68 files;
  statement 41.43%, branch 38.37%, function 35.8%, line 44.46%; thresholds passed.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts`:
  67 passed. SQLite experimental warnings only.
- `node node_modules/vite/bin/vite.js build --mode production`: passed;
  153 precache entries, 3198.85KiB. Existing large-chunk warning remains.
- `node node_modules/@playwright/test/cli.js test --workers=2` with
  `RECALL_CHROMIUM` and `RECALL_WEBKIT` selecting installed binaries:
  44 passed. Includes drawer first frame, rapid closes, gesture, reduced motion,
  safe insets 0/59/80, dark/light routes, long reading, touch, keyboard/focus,
  breakpoints, import/progress retention and offline persistence.
- `node node_modules/@playwright/test/cli.js test --config e2e/weread-online.config.ts`
  with the same browser variables: 16 passed; synthetic books/model responses.
- Isolated D1 setup:
  `npx --yes wrangler@4.156.0 d1 migrations apply DB --local --persist-to /tmp/recall-ios27-d1-state`
  applied both existing migrations to local test DB only.
  `npx --yes wrangler@4.156.0 pages dev dist --port 8788 --ip 127.0.0.1 --local-protocol https --persist-to /tmp/recall-ios27-d1-state --binding RECALL_SPACE_ID=synthetic-local-test --binding RECALL_BOOTSTRAP_CODE=synthetic-local-only-recovery-not-a-production-secret --show-interactive-dev-session=false`.
  `node node_modules/@playwright/test/cli.js test --config e2e/cloud.config.ts`:
  2 passed, covering authorization, shared devices, offline journal, conflicts
  and revocation in synthetic local data. Production D1 was not touched.
- `git diff --check`: passed. 16 relative documentation links resolved;
  reviewed task diff contains no private content or credentials.
- Final mobile screenshot run using `--grep '状态栏安全区|不透明固定'
  --workers=2 --output=/tmp/recall-ios27-shots`: 4 passed. Visually inspected
  WebKit home and open drawer screenshots; Logo is sharp in this simulation,
  with the 48px shared controls and stationary drawer preserved.

## Failed Commands And Recovery

- Initial temporary `npx --yes wrangler@4.156.0 dev --local --ip 127.0.0.1 --port 8798 --show-interactive-dev-session=false`
  failed with sandbox npm cache `EPERM`. Retried with tool-enforced approval;
  local workerd started. Did not change cache ownership or deploy the probe.
- Initial mobile command `node node_modules/@playwright/test/cli.js test --grep '不透明固定' --workers=2`
  could not start the configured `pnpm exec` build/preview (exit 1). Recovered
  with direct installed Vite build/preview on port 4193, then reran unchanged
  assertions. The pre-fix assertion failures above were genuine, separate runs.
- Windows vault paths and Graphify are unavailable on this Mac; used the
  previously checked handoff/architecture map and targeted source inspection.

## Source, Production And Recovery

- Repository: `xuda645-eng/Recall`, branch `main`.
- Starting HEAD: `47cfcbd604f79d3f4dfe3669970e77b73586b7ad`.
- Implementation commit locator: the commit first adding this record together
  with the listed source/test changes; exact SHA to be appended after commit.
- Source push outcome: pending. Evidence follow-up: pending.
- Production origin: `https://recall-memory.pages.dev/` (unchanged).
- Cloudflare account: `751b9fca4f5173fd70e0dfb69cff81e2`; existing Pages project
  `recall-memory`, main production branch, verified by whoami/project/deployment
  read-only commands before release.
- Previous production: `0f97f0c9-a0f8-4271-b59f-417f1ff7303c`, source
  `8eb2c8b1885f58a58c9b23622f4be895192a439d`,
  `https://0f97f0c9.recall-memory.pages.dev/`.
  It is the available schema-compatible baseline, not a claim that its reported
  Logo/WeRead defects or physical-device behavior were verified good.
- New deployment ID/URL and deployed source SHA: pending.

If this release introduces a regression, first recheck production so a newer
session's release is not overwritten. In the existing Pages project, roll back
to deployment `0f97f0c9-a0f8-4271-b59f-417f1ff7303c`, then verify the stable
origin, manifest/assets, SW and mobile flow. There are no new schema/data changes;
rollback restores the previous transport/topbar behavior and its known defects.
Do not reset D1, clear phone data, force-push or rewrite Git history. SW/device
caches are separate from asset rollback. Record any rollback here with timestamp.

## Remaining Acceptance

Physical iPhone 15/iOS 27 blur, home-screen launch and update remain unverified.
The local real-gateway workerd pass does not establish Cloudflare production
egress or an authenticated WeRead connection on the user's installed PWA.
Public post-deployment checks and their limitations will be appended here.
