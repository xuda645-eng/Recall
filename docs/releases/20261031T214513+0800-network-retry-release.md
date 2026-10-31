# Retry Public Gate And Complete Pending Release

- Release ID: `20261031T214513+0800-network-retry-release`.
- Scope: user-requested normal-network retest and continuation of the previously
  authorized pending topbar/WeRead/AI production release, plus public records.
- Retest started: approximately 2026-10-31T21:42:45+08:00; record created at
  2026-10-31T21:45:13+08:00.
- Status: fresh local validation, source push, additive migration and production
  deployment succeeded. Public assets/auth checks passed; broad browser and final
  offline verification remain partially blocked by variable network timeouts.
- Source repository/branch: `xuda645-eng/Recall`, `main`.
- Retest baseline: `bebe81c`; runtime source unchanged since validated `2ae24ff`.
- Deployment/evidence commit SHA, push result and completion: appended below.
- Production origin stays <https://recall-memory.pages.dev/>.
- Previous production rechecked with Wrangler:
  `8adde351-c4c8-4c8d-aa5b-cdd100a3affe`, reported source `d76f615`,
  <https://8adde351.recall-memory.pages.dev/>. Its historical dirty asset build
  is not precisely identified by that reported source SHA.

## Normal-Network Retest

The user reported turning off global VPN and requested another attempt. Read-only
route inspection now shows the Wi-Fi interface instead of the prior tunnel.
The agent changed no VPN, DNS, proxy, route, credential or device-data setting.
Current checks used normal DNS with no pinned address, host-resolver override or
custom QUIC flags in the acceptance browser.

- The same public 174278-byte JS downloaded in 2.37 seconds, versus 27.55 seconds
  in the prior diagnostic. This supports the previous tunnel path contributing
  to the slowdown, not a claim that all public network variability is solved.
- One default-path SW GET and one Manifest GET still hit a 10-second TLS timeout.
  A normal-path SW retry returned 200/full 9595 bytes in 8.02 seconds; the IPv6
  Manifest GET returned 200/full 621 bytes in 2.94 seconds. IPv6 is a diagnostic
  comparison only, not a system DNS or acceptance-browser override.
- Critical acceptance command:
  `RECALL_URL=https://recall-memory.pages.dev/ RECALL_CHROMIUM=...
  RECALL_WEBKIT=... node node_modules/@playwright/test/cli.js test
  --project=iphone15-chromium --grep 'PWA部署路径' --workers=1
  --output=/tmp/recall-vpn-off-preflight`: 1 passed in 1.9 minutes. This used the
  real public origin and fresh isolated browser, with unchanged assertions for
  root Manifest/icons, SW activation/control, offline reload and review persistence.
  No real production library mutation or logged-in owner session was used.

The public blocker is recovered for this observed run, with little margin below
the existing 120-second test limit. The eager home dependency chain and 145-entry
serial cache remain unchanged and are still performance follow-up candidates.
This is not continuous uptime, an ISP-wide claim or physical iPhone acceptance.

## Source And Safety

The release includes the already reviewed topbar/header-scroll fix and protected
online WeRead/explicit AI questions. It retains the exact highlight answer,
explicit changed-card selection, review/history/archive identity, server-only
secrets and local-first data flow. The canceled smoke schedule remains canceled;
no live model call is needed for this release retest.

`git fetch origin` and divergence check returned `0 0`; the worktree was clean.
`git diff 2ae24ff..HEAD -- src shared functions migrations vite.config.ts
package.json pnpm-lock.yaml` was empty. Prior reviewed runtime source and test
results therefore refer to the same runtime; the bundle is freshly rebuilt.

Read-only `wrangler@4.156.0 whoami`, deployment list, production secret-name list
and production migration list confirmed the existing account/project, encrypted
secrets and only `20261031_weread_ai.sql` pending. No secret value was printed.
Use only account `751b9fca4f5173fd70e0dfb69cff81e2`, existing dedicated DB
`7e0289a3-30a4-479a-a60a-58eabea71507` / `recall-memory-data`, and `personal` space.
Create no paid resource, new project, origin, DNS or billing-plan change.

The additive migration creates import-limit/cache tables without changing card,
sync or device rows. A private ignored D1 backup precedes migration; its content
must not be displayed, committed or deployed. Authenticated mutation tests use
local synthetic D1 only. Private batches/handoffs/credentials and parent workspace
files remain local. Publish only the clean committed root-path production bundle.

## Revalidation

Pending outcomes are appended below; do not infer a pass from command submission.

- `node node_modules/typescript/bin/tsc -b --noEmit`.
- `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json --noEmit`.
- `node node_modules/vite/bin/vite.js build --mode production`.
- `node node_modules/vitest/vitest.mjs run --coverage`.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts`.
- `node node_modules/eslint/bin/eslint.js .`.
- Local 393 x 852 / DPR 3 Chromium/WebKit production mobile acceptance rerun.
- The unchanged protected-import source has already passed 16 synthetic UI tests,
  66 cloud tests and 2 local D1 integration suites in the combined validation;
  no production mutation tests are permitted.
- Markdown links, `git diff --check`, staged source/privacy checks and remote SHA
  equality before deployment.

Fresh validation results before publication:

- Both TypeScript commands passed; production build passed, 145 precache entries
  / 3608.57KiB, existing chunk-size warning. Log `/tmp/recall-vpn-off-build.log`.
- Coverage suite: 68 files / 1139 tests passed; cloud suite: 2 files / 66 tests
  passed. Logs `/tmp/recall-vpn-off-unit.log` and `/tmp/recall-vpn-off-cloud-unit.log`.
- Full lint: 0 errors / 131 existing warnings, `/tmp/recall-vpn-off-lint.log`.
- `RECALL_URL=http://127.0.0.1:4193/ RECALL_CHROMIUM=... RECALL_WEBKIT=...
  node node_modules/@playwright/test/cli.js test --workers=2
  --output=/tmp/recall-vpn-off-mobile`: 42 passed in 1.2 minutes, exact fresh bundle.
- `RECALL_CHROMIUM=... RECALL_WEBKIT=... node node_modules/@playwright/test/cli.js
  test --config e2e/weread-online.config.ts`: 16 synthetic tests passed in 52.8s.
- `RECALL_CHROMIUM=... RECALL_WEBKIT=... node node_modules/@playwright/test/cli.js
  test --config e2e/cloud.config.ts --output=/tmp/recall-vpn-off-cloud`: both local
  synthetic D1 suites passed in 28.2s; Pages dev used only the synthetic local space.
- Private D1 export completed before migration. The SQL file is nonempty,
  owner-readable only (0600) and confirmed ignored by Git; no backup content or
  temporary export access URL is included in this public record or release assets.

## Recovery

Recheck canonical production immediately before deployment/rollback. For an
introduced regression, use the existing Pages project's deployment rollback to
the recorded compatible prior `8adde351` deployment, not a Workers rollback or
history reset. That prior deployment now passed simulated public offline checks,
but is not physically verified to solve the topbar blur. Retain the additive
import tables unused by the prior code; do not restore/drop/reset D1, delete device
storage, rotate credentials, force-push or rewrite shared history. Asset rollback
does not undo SW caches or model costs. Verify same-origin assets/manifest/SW/auth
rejection and applicable mobile flows and record any rollback incident.

## Publication Evidence

Pending implementation/record commit and normal push, private backup, additive
migration result, production deployment ID/URL/source SHA, non-destructive public
verification, any recovery incident and completion. Append actual outcomes in a
documentation-only follow-up without redeploying unchanged app code.

## Acceptance Budget Follow-Up

During continuation the user asked whether the timeout was self-imposed and
could be relaxed. The Playwright per-test external budget is increased to five
minutes in [a separate configuration record](./20261031T214845+0800-public-test-budget.md),
with local/UI budgets, zero retries and all SW/offline/data assertions unchanged.
The earlier 1.9-minute preflight passed before this change; no failed check is
retroactively labeled passed. The final public probe uses the new bounded budget.

## Deployment Outcomes

- Initial record commit `0cdf42c2dfa00ee9da9c76c02c77d46284279501` at
  2026-10-31T21:48:20+08:00 was normally pushed; remote/local equality and clean
  worktree verified. The acceptance-budget follow-up was committed/pushed as
  `552f483398075c0720ed25b6d1c4099ede4df8d8` at 2026-10-31T21:50:09+08:00.
- Immediately before publication, production still pointed at the recorded
  previous deployment. The only pending additive D1 migration
  `20261031_weread_ai.sql` was applied successfully, 3 commands in 1.13ms;
  `d1 migrations list DB --env production --remote` then returned no migrations
  to apply. No original card/sync/device rows were changed or seeded.
- Deployment command:
  `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes
  wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main
  --commit-hash 552f483398075c0720ed25b6d1c4099ede4df8d8
  --commit-message 'release: validated opaque topbar and protected WeRead AI import'`.
  Pre-command checks required a clean worktree and equal local/remote SHA.
- Upload/deployment succeeded: 17 new / 147 already uploaded static files,
  production Functions bundle and API-only routes. Deployment completed at
  approximately 2026-10-31T21:51:30+08:00.
- Production deployment ID: `d606405a-f52d-42de-90bc-6ca5b961cfcf`;
  deployment URL: <https://d606405a.recall-memory.pages.dev/>;
  stable production URL: <https://recall-memory.pages.dev/>.
- At 2026-10-31T21:52:06+08:00, read-only inventory confirmed Production/main
  source `552f483`, with the old `8adde351` version retained. Migration inventory
  remained empty. No billing upgrade, project/origin change or real-card mutation.

## Public Verification In Progress

- Standard-browser true public Chromium run selects 8 tests: empty/new-user
  state, homepage/drawer, top safe-area spacing, opaque separated scrolling,
  long-card reading, rating/undo, Markdown and SW/offline persistence. It uses
  `RECALL_URL=https://recall-memory.pages.dev/` with 300-second per-test budget,
  no pinned IP/proxy/QUIC flags, no retries and isolated unsigned-in contexts.
  Log `/tmp/recall-released-public-chromium.log`.
- Standard-browser true public WebKit run selects homepage/drawer and opaque
  header/reading checks, not the isolated-local WebKit offline workaround. Log
  `/tmp/recall-released-public-webkit.log`. First homepage test passed in 1.7
  minutes; Chromium new-user test passed in 1.4 minutes. Remaining results are
  recorded on completion, not inferred from these initial passes.
- `node node_modules/vitest/vitest.mjs run
  src/components/__tests__/pwa-update-prompt.test.tsx`: 14 passed, including
  prompt/update lock, errors and snapshot preservation. Actual physical-device
  update/cold reopening and real-book AI quality are still unverified.
- Initial default curl asset audit hit two TLS timeouts; an IPv6-only diagnostic
  retry hit two 45-second no-data timeouts. These are network-check failures,
  not passes. A bounded HTTP/1.1 normal-DNS retry then returned production HTML
  in 4.91 seconds, and its SHA-256 matched the published local index exactly.
  This protocol choice applies only to the separate read-only asset audit;
  browser acceptance is not weakened. Final asset/API audit results follow.

## Final Verification And Limitations

- Read-only production asset audit eventually passed using HTTP/1.1 and normal
  DNS IPv6, without a pinned address or certificate bypass. Five public assets
  (index, SW, Workbox runtime, workspace CSS/JS) returned 200 and matched the
  committed build exactly. Root manifest start/scope/display matched and all
  three icons returned 200. Receipt `/tmp/recall-release-public-assets.json`.
- Anonymous GET session/sync and same-origin POST `{}` to all three WeRead
  endpoints returned expected 401 `Unauthorized`. Authentication rejection occurs
  before model/gateway calls or import-cache writes. This verifies the deployed
  protection boundary, not authenticated real-book generation quality. No real
  highlight, model call, device authorization or card mutation was performed.
- Final asset audit recovery was necessary: HTTP/1.1 default-address checks had
  a TLS timeout and then partial Workbox transfer timeout (6063/15112 bytes).
  The IPv6/HTTP1.1 audit also observed one TLS and one partial icon timeout before
  its single bounded curl retry completed. Failures are retained as network
  evidence; checksum assertions were never removed.
- Broad standard-browser Chromium public run: 1 passed (new-user state, including
  SW control), 1 failed after 300 seconds at initial `page.goto(..., waitUntil:
  'load')`, 1 interrupted and 5 not run. It was stopped rather than repeatedly
  waiting through more cold starts. WebKit public run: homepage/drawer passed;
  opaque-topbar test failed after 300 seconds waiting for SW control. These suites
  are not reported as passed. Logs and contexts are in the paths above.
- One final focused standard Chromium PWA recovery run after stopping broad
  checks failed at navigation in 30.7 seconds with browser `net::ERR_TIMED_OUT`,
  before test-budget expiry. Log `/tmp/recall-released-public-recovery.log`.
  This is a transport/browser failure, distinct from our 300-second budget.
  New-deployment offline rating/persistence was not reached in this final probe.
- Earlier normal-network pre-deployment full public offline gate passed, and
  both new-deployment new-user/homepage probes reached SW control. Together with
  byte-identical assets and full local checks, there is no established code
  regression; current observations still show a variable public path. Do not
  infer continuous/public offline or physical-device acceptance from partial
  passes. No rollback was performed: restoring the prior assets cannot be assumed
  to fix TLS/transfer failures already reproduced before this release. A confirmed
  introduced compatible regression still requires the recorded rollback workflow.
- Implementation deployment remains
  `d606405a-f52d-42de-90bc-6ca5b961cfcf`, source
  `552f483398075c0720ed25b6d1c4099ede4df8d8`. Existing D1 data, production secrets,
  origin and devices remain intact; only reviewed additive import tables were added.
- Remaining scope: repeat full new-deployment public SW/offline/header verification
  on a stable path; physically check iPhone 15 update, installed blur/safe areas,
  keyboard and cold reopening. Large first-load dependencies and serial precache
  remain future performance work, not hidden changes in this release.
- Evidence recorded at approximately 2026-10-31T22:01:00+08:00. The documentation-
  only follow-up containing final results and task-index updates is normally
  committed/pushed and does not redeploy the unchanged application. Its exact
  SHA is available via `git log --` on this record and in the final chat report.

At 2026-10-31T22:02:10+08:00, final evidence `git diff --check` and 20 relative
record/index links passed, with no missing targets or secret/export-URL patterns
in the public diff. The two local QA services were stopped. Evidence publishing
is limited to seven public Markdown records/index files; private backup and test
receipts remain ignored/local. No further application deployment is triggered.
