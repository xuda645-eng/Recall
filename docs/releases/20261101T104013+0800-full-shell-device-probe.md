# Full Shell Comparison After Clear A/B/C Result

- ID: `20261101T104013+0800-full-shell-device-probe`.
- Start: 2026-11-01T10:40:13+08:00.
- Scope: isolated prototype build, tests, evidence; production unchanged.
- Status: isolated full-shell preview published and browser checks passed;
  native D/E comparison pending. Production unchanged.
- Source base: `4ca87a39f9b7721f84de70ab750ffa1418843142`,
  `xuda645-eng/Recall` main. Work performed in clean existing isolated
  worktree; unrelated CWD/primary-worktree changes preserved.
- Production before task: `2ac571d2-1cc4-4999-93ce-0f3330ce10f2`, source
  `a319c3bed7150080fc322222f260aa719448ca3b`, version `1.0-20261101-0230`.
  Verified existing OAuth account/project/deployment with Wrangler.
- No production release, database/API/schema change, credential operation or
  real-card access. Current production is not known-good for native blur.

## Physical Result

At 2026-11-01T10:40+08:00, the owner reported A, B and C all clear in the
previous test PWA. The attached private screenshot shows A and the page's
home-screen PWA label with a sharp Logo. This is physical evidence of a clear
simplified probe, not acceptance of any production fix. It disproves the
probe's assumed reproduction baseline. Screenshots remain private.

Do not ship B/C based on this result, blame stale production code, or tell the
owner to delete/reinstall the actual app. The original app's failed physical
result remains unresolved.

## Investigation And Change

Targeted inspection found both page documents use status-bar `default`. Git
history also has `default`; no evidence establishes that this installation
used `black-translucent`. The actual app includes global root/background
styles, `overscroll-behavior-y: none`, async initialization, lazy workspace,
React portal and nested production CSS not all present in simplified A.

The new [full-shell probe](../../prototypes/status-shell/README.md) reuses the
production Vite configuration and unchanged app source. D keeps the real root
surface and E only sets the root/body/app-root paper background before
initialization. The probe injects a visible diagnosis panel, separately named
manifest/icon, synthetic-only first-run data and a client-side network fence.
It does not claim exact reproduction of native installation identity, real
data, host/permission state or startup timing.

The fence rejects production-origin execution and resolves `/api/*` or
external fetch requests locally without network transmission. Preview CSP
also restricts connections to the preview origin; the static artifact contains
no Functions or D1 bindings. No production control-plane changes are needed.

Obsidian Windows paths, root handoff and Graphify were unavailable on this Mac.
Bootstrap used the supplied map and targeted code/history inspection; no graph
or vault content changed. This was already disclosed in the preceding work.

## Validation

- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 132 existing warnings.
- `node node_modules/typescript/bin/tsc -b --noEmit`: pass.
- `node node_modules/vitest/vitest.mjs run`: 1382 tests, 78 files passed.
- `RECALL_BUILD_VERSION=1.0-20261101-1040 node node_modules/vite/bin/vite.js
  build --config prototypes/status-shell/vite.config.ts`: production-mode
  isolated build passed. This is not a production deployment.
- `node --test prototypes/status-shell/boot.test.mjs`: four guard/network-fence
  tests passed, including refusing the real production origin.
- Syntax checks for both probe scripts and generated synthetic data passed.
- Focused prototype lint and `git diff --check`: passed.
- Initial empty-state browser suite: five passed, one explicit WebKit offline
  skip. Build inspection found a duplicate manifest injected by plugin order;
  post ordering was corrected and a single-manifest assertion added before
  publication. The final suite uses the generated synthetic snapshot.
- Four emitted app CSS files are byte-identical to the unchanged production-
  mode build. `git diff a319c3b -- src index.html vite.config.ts package.json
  pnpm-lock.yaml` is empty. The preview's additional CSS lives only in its
  injected panel and E's explicit three-element background rule.
- Final `node scripts/run-playwright.mjs --config
  prototypes/status-shell/playwright.config.ts --workers=2` with cached engine
  path variables: five passed, one explicit WebKit offline skip (8.5s).
  A prior run with the synthetic snapshot failed four checks due to the same
  group label appearing in both a card and a folder. The test was narrowed to
  the folder's exact button name; no application behavior/assertion was removed.
- Artifact inspection: one manifest link, no worker/Functions, no source maps
  or credential files. Synthetic mobile screenshot visually inspected.
- Browser launcher uses the approved unsandboxed entrypoint and cached
  Chromium-1223/WebKit-2272 at 393 x 852 CSS pixels, DPR 3.
- Native iPhone blur, installed identity/insets and physical offline launch
  remain unverified for D/E. No passing browser check establishes the fix.

## Publication And Recovery

- Commit/push SHA and timestamp: pending.
- Unique preview `ios27-shell-20261101`, deployment ID/URL: pending.
- Build source and all public verification outcomes will be appended after
  publication in a docs-only follow-up, without redeploying production.
- Recovery: stop distributing this isolated preview if unsafe or broken;
  correct only its own preview. No production rollback is required because
  the production deployment is untouched. No proven blur-free production
  target exists, so do not roll back unrelated features speculatively.

## Published Outcome

- Approximately 2026-11-01T10:49+08:00: implementation
  `cb055bf6977587ef91eee9e8403f5342bb7003e9` committed and pushed normally to
  `xuda645-eng/Recall` main using existing authenticated HTTPS, with no force
  push or dirty deployment. Task worktree clean after implementation commit.
- Exact validated `dist/status-shell` copied to an isolated static directory.
  A local SHA-256 inventory covers all 203 build files; no Functions/config,
  credentials or private data included. Wrangler treated 201 as static uploads
  plus `_headers` and routing metadata.
- Command: `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2
  npx --yes wrangler@4.156.0 pages deploy . --project-name recall-memory
  --branch ios27-shell-20261101 --commit-hash
  cb055bf6977587ef91eee9e8403f5342bb7003e9` from the isolated directory.
- Deployment: `898bd7f7-a0cf-467c-9dbb-8955ef505d02` (Preview only).
  URL: `https://898bd7f7.recall-memory.pages.dev/`.
  Alias: `https://ios27-shell-20261101.recall-memory.pages.dev/`.
- 2026-11-01T10:51:00+08:00: production remains `2ac571d2`, source `a319c3b`.
  Preview index matched local bytes; `/api/auth/session` returned HTTP 404
  matching the static error page. No production source/hosting/data changed.
- Public command: with the same engine paths and
  `STATUS_SHELL_URL=https://898bd7f7.recall-memory.pages.dev/`, run
  `node scripts/run-playwright.mjs --config
  prototypes/status-shell/playwright.config.ts --workers=2`: five passed,
  one explicit macOS WebKit offline skip, in 1.7 minutes. Both engines passed
  D/E actual-shell layout and network-fence checks; Chromium passed full
  Service Worker-controlled offline D/E navigation with synthetic local data.
- In-app browser initially timed out navigating and then showed the loading
  screen. A later read of the same tab confirmed the complete D/E panel,
  synthetic cards, disabled cloud message and `1040` version. The tab was
  retained for the user. No phone acceptance is inferred from it.
- Direct public resource checks matched probe controls/data, manifest, both
  icons, Service Worker, version file and three shell CSS files. Boot script
  and reader CSS initially timed out in curl despite bounded retry; final
  single-resource recovery is recorded below. Browser network-fence behavior
  passed independently. No certificate checks were disabled.
- This final record/README/index follow-up is documentation-only and does not
  trigger another preview or production deployment. Physical result for D/E
  remains outstanding; the production blur is not declared fixed.
- Final single-resource curl recovery succeeded: both the network-fence boot
  script and reader CSS matched local bytes. All 12 selected public resources
  plus the HTML document are byte-verified. Full 203-file public hashing was
  not performed; Workbox-controlled offline shell checks passed separately.
