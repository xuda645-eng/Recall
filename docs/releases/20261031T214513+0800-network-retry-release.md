# Retry Public Gate And Complete Pending Release

- Release ID: `20261031T214513+0800-network-retry-release`.
- Scope: user-requested normal-network retest and continuation of the previously
  authorized pending topbar/WeRead/AI production release, plus public records.
- Retest started: approximately 2026-10-31T21:42:45+08:00; record created at
  2026-10-31T21:45:13+08:00.
- Status: current production public PWA gate passed; committed pending source
  revalidation/publication under way. Migration/deployment are not yet outcomes.
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
