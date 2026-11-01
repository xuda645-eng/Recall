# WeRead Selection Controls And Finished-Only Badge

- ID: `20261101T190331+0800-weread-selection-controls`.
- Scope: requested online WeRead UI refinements, navigation registration,
  regression tests and documentation.
- First recorded implementation timestamp: 2026-11-01T18:54:29+08:00.
- Record timestamp: 2026-11-01T19:03:31+08:00.
- Source base: `e197e45c82ba3ea8ab2cb9780f2bae470a641b3c`, latest main.
- Main advanced during validation to `aa3ac69cb4ed60e4154d2e6079aedca5299f3870`.
  Both new commits only change release documentation and are retained in the
  delivered history; validated application source and bundle are unaffected.
- Fixed build version: `1.0-20261101-1854` for all builds and browser checks.
- Status: local validation passed, source pushed and production deployed.
  Public resource/auth and PWA checks passed; complete synthetic live UI remains
  unverified after the documented startup timeouts. Physical UI unverified.
- Previous production: `b15d48db-31e7-453e-b9d7-82667eca7ff5`, source
  `b5e79fd804d6255d71a26911294b045e4cc0e62b`, version `1.0-20261101-1656`.
  Verified by read-only Wrangler account/project/production listing. This
  preserves the existing iPhone system-frame fix and WeRead daily budget 300.

## Changes

- Book cards show `已标记读完` only when `markedFinished === true`.
  False, null and missing values render no reading-status badge. Reading
  percentage and progress meter remain independent, even at 100 percent.
- Remove online-flow footer buttons `再选一选` and `返回导入`. The shared
  header back action delegates to the active import screen: confirmation
  returns to books with the existing selection, books/connect returns to
  import, and manual-file mode returns to online mode. Returning from a
  reconfirmed persisted job returns to that job, not an empty book list.
  Callback cleanup avoids stale handlers after route changes. Busy/initial
  operations cannot use the handler to discard an active task; paused/done
  jobs remain saved when leaving.
- The expanded highlight list has a native `全选 / 全不选` checkbox, a selected
  count, and a true indeterminate state for partial selection. It toggles all
  drafts, not only visible rows. Individual checkboxes and both counts remain
  synchronized; zero selections disable generation. Folding/reopening retains
  selection. No model call or card write occurs before explicit generation.
- Keep completion/retry/pause controls and the separate manual importer intact.
  No book API, AI budget, credentials, storage schema, cloud data, domain,
  infrastructure, application icon or safe-area policy change.

Work is isolated in `/private/tmp/recall-weread-finished-badge-20261101` from
verified remote main. Existing dirty source and other worktrees are preserved.
The optional parallel-delivery Skill was not activated and no branch created.
Windows vault and Graphify were unavailable; the session handoff/map routed
targeted reads of the owning component, navigation and tests. Graphify update
could not run because its executable is absent.

## Validation

Shared installed dependencies have an identical lockfile and were reused
without reinstalling or changing them. Browser checks use the guarded launcher
and existing Chromium/WebKit paths through approved unsandboxed execution.
Primary viewport: 393 x 852 CSS pixels, DPR 3. Badge checks additionally cover
320px, 760px and 852 x 393 landscape. Test content and API replies are synthetic.

```sh
node node_modules/vitest/vitest.mjs run src/services/weread-online.test.ts src/lib/memory-weread.test.ts
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/vitest/vitest.mjs run --coverage
RECALL_BUILD_VERSION=1.0-20261101-1854 RECALL_WEREAD_PORT=4297 node scripts/run-playwright.mjs --config e2e/weread-online.config.ts --grep '书卡仅明确已读完|正式连接入口'
RECALL_BUILD_VERSION=1.0-20261101-1854 RECALL_WEREAD_PORT=4297 node scripts/run-playwright.mjs --config e2e/weread-online.config.ts --grep '确认页仅顶栏|展开划线支持'
RECALL_BUILD_VERSION=1.0-20261101-1854 RECALL_WEREAD_PORT=4297 node scripts/run-playwright.mjs --config e2e/weread-online.config.ts
CI=1 RECALL_BUILD_VERSION=1.0-20261101-1854 node scripts/run-playwright.mjs --workers=2
git diff --check
```

All browser commands additionally set:

```sh
RECALL_CHROMIUM='/Users/bytedance/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
RECALL_WEBKIT='/Users/bytedance/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'
```

- Focused units: 182 passed / 2 files.
- Focused badge/entry mobile checks: 10 passed, both engines.
- Focused back/selection mobile checks: 4 passed, both engines. Native half-check
  visual inspection passed on synthetic WebKit screenshot; label target >=44px.
- Full lint and typecheck passed. Initial lint had one newly introduced effect
  dependency warning; destructuring the callback corrected it. Final full lint:
  0 errors / 132 pre-existing warnings. No browser-test failure in focused runs.
- Full coverage: 1423 tests / 82 files passed. Statements 41.67%, branches
  39.46%, functions 36.38%, lines 45.21%; configured thresholds passed.
- Full core mobile/PWA: 74 passed, both engines, including safe areas, drawer,
  reading, Markdown/WeRead import, persistence, offline reopening and SW update.
- Full online WeRead regression: 58 passed, both engines, including synthetic
  generation/import, manual import, quotas, failure recovery and long content.
- Final source recheck: callback dependency cleanup was followed by another full
  coverage run (lines 45.20%), typecheck/lint, 14 focused WeRead mobile checks and 12 core PWA
  checks. All passed. The final root production build and 202-file SHA256
  inventory passed, including manifest identity, version metadata, unchanged
  viewport boot precache and the compiled requested UI text/omissions.
- Changed-document relative links and diff whitespace passed. No cloud or D1
  code changed; cloud mutation suites and migrations are not applicable.

Logs and synthetic screenshots remain local under `/tmp/recall-weread-selection-*`
and `/tmp/recall-weread-finished-focused.log`. They are not uploaded. No real
production library mutation or real model request is part of validation.
Physical iPhone installed-PWA acceptance for this UI change is unverified;
browser simulation is not physical acceptance.

## Publication And Recovery

Local final validation completed at 2026-11-01T19:06:26+08:00.

- Implementation: `0105bfa910eefe3b4d710e717ed7fb52c086b6a4`.
- Source publication: 2026-11-01T19:11:48+08:00, normal
  `git push origin HEAD:main` succeeded, `aa3ac69..0105bfa`. Remote main matched.
- The original local commit was `e4e0cc3`, then rebased over two documentation
  commits from main. Only `docs/RELEASES.md` conflicted; both release rows were
  preserved. No source/test/config difference from the validated commit after
  rebase, and all 202 bundle hashes remained identical. No force push used.
- Production: 2026-11-01T19:13:26+08:00, deployment
  `363b9fd7-3075-4799-9219-386dffebc8ec`, confirmed Production/main/source
  `0105bfa` through Pages listing.
- Deployment URL: <https://363b9fd7.recall-memory.pages.dev/>.
- Stable origin: <https://recall-memory.pages.dev/>.

```sh
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main --commit-hash 0105bfa910eefe3b4d710e717ed7fb52c086b6a4
node /private/tmp/recall-weread-selection-artifacts.mjs --public
RECALL_VERIFY_DIST=/private/tmp/recall-weread-finished-badge-20261101/dist node scripts/run-playwright.mjs --config e2e/weread-public.config.ts
RECALL_URL=https://recall-memory.pages.dev/ node scripts/run-playwright.mjs --grep '系统安全框引导脚本公开可用' --project iphone15-webkit --workers=1 --output /tmp/recall-weread-selection-public-pwa
```

Public browser commands include the same executable overrides and approved
unsandboxed guarded launcher. New browser contexts are anonymous, not the
owner's browser or installed PWA.

- Public PWA check: 1 passed, verifies current app/boot script, SW activation,
  required shell precache, read-only diagnostics and return to app.
- Public artifact/auth browser case: 11 committed resource SHA256 digests and
  5 anonymous WeRead API gates passed; all gates returned 401/no-store, no
  cookies or real model input. Version equals `1.0-20261101-1854`/no-store.
- Independent public resource inventory: 17 live resources matched tested
  SHA256, including main/workspace/WeRead JS/CSS, root HTML, manifest, all
  install icons, viewport boot, SW and Workbox. Version no-store passed.
- The initial uncompressed curl inventory failed on stylesheet SSL timeout
  and a partial 1360/89759-byte transfer (exit 28). An approved unsandboxed
  rerun recovered the stylesheet but failed on incomplete index JS download
  (213754/240291 bytes after 60 seconds, exit 28). A bounded recovery used
  `curl -L --fail --compressed --connect-timeout 15 --max-time 120 -sS` with
  two attempts/resource. All 17 then passed; stylesheet and SW SSL timeouts
  required a second attempt. Partial responses were never accepted as matches.
- First live UI browser batch: 1 passed / 1 failed. The new synthetic UI
  fixture incorrectly passed shelf metadata into the strict import book
  response, rejected as `书籍含有不支持的字段`. It timed out waiting for the
  confirmation selector after 300 seconds. This was not an application
  regression: fix the test fixture to project only bookId/title/highlights,
  add an explicit confirmation-heading assertion and rerun only that case.
  App bundle remains unchanged; test-only correction lint/typecheck and
  all 202 inventory hashes passed. Corrected fixture rerun failed before any
  interactions: connection button was unavailable after the 120000ms startup
  wait. A final bounded rerun failed at `page.goto` waiting for domcontentloaded
  after 120000ms. No subsequent retry; full live synthetic UI is unverified,
  rather than attributing every timeout to a proven network-only root cause.
  Initial live run did verify four finished-badge states and progress before
  the malformed import fixture blocked confirmation. Equivalent local mobile
  confirmation/selection checks passed across both engines.

Documentation/test evidence is a follow-up commit without another app
deployment. Verification closed at 2026-11-01T19:27:05+08:00; follow-up push
outcome is reported separately. No rollback is warranted by a malformed test fixture
or by download timeouts with successful hash recovery.

If this release introduces a confirmed regression, restore the compatible
previous static deployment `b15d48db-31e7-453e-b9d7-82667eca7ff5` through the
existing Pages project's rollback action, recheck origin/version/assets and
the affected flow, and append the incident here. The base-to-main changes
after that deployment are documentation-only; this task introduces no API or
schema migration. Existing phone upper-edge appearance had owner acceptance,
but broader native/offline paths were not historically fully accepted.
Do not reset D1, change secrets/origin, clear device data or rewrite Git history.
Asset rollback cannot undo cards imported by the user or immediately replace
all installed-device Service Worker caches. No rollback has been performed.
