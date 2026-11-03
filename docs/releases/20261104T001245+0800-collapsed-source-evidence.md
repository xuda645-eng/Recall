# Collapsed Source Evidence With Visible Images

## Identity And Scope

- Release ID: `20261104T001245+0800-collapsed-source-evidence`.
- Status: published; public browser verification partial, with SW-control startup failures still unresolved.
- First recorded validation: `2026-11-04T00:06:15+08:00`.
- Build version: `1.0-20261104-0006`.
- Source SHA: `511a9f30f5f1830d13943ad288897191bf4a4976`; committed `2026-11-04T00:24:20+08:00` and normally pushed to `origin/main` by `2026-11-04T00:25:02+08:00`.
- Previous production deployment: `0325b1a9-edc0-42d2-a179-095dc38ec6b1`, source `9953836`, verified using Wrangler before this release.
- Existing account: `751b9fca4f5173fd70e0dfb69cff81e2`; existing Pages project `recall-memory`, production branch `main`, stable origin `https://recall-memory.pages.dev/`.

## Changes

- Reading order is answer, associated images, then a closed source-evidence disclosure. Text-only cards have no image placeholder.
- A read-only HAST transform recognizes top-level Markdown headings named `来源证据`, moves their images above the disclosure and retains source text, quotes, links and nested headings inside it. Subsequent same-level or higher-level sections remain visible.
- Folding is enabled only for reading answers. Question rendering, import preview, ordinary chapters, code blocks and WeRead grouped-highlight originals retain their existing behavior.
- Native summary controls support touch and keyboard. Reader keyboard shortcuts ignore focused summaries, so toggling sources does not rate or switch a card.
- Untrusted card HTML still cannot create details, summaries, buttons or unsafe links. Only the controlled transform creates the disclosure after sanitization.
- Existing card content, IDs, exports, import files, images and review progress are not rewritten. No schema, API, D1, credential or infrastructure change.
- E2E isolated servers can use `RECALL_E2E_BUILD_DIR` so offline acceptance runs against the selected task build, not a different served `dist/`.
- Known unrelated local Skill edits and all private card batches are excluded from this release.

## Validation

- `node node_modules/vitest/vitest.mjs run src/components/__tests__/source-evidence.test.tsx src/components/__tests__/media-renderer.test.tsx`: 9 passed. Initial run had six matcher errors because jest-dom was not globally configured; a local `@testing-library/jest-dom/vitest` import fixed the test setup, then the same cases passed.
- `node node_modules/vitest/vitest.mjs run`: 91 files, 1565 tests passed.
- `node node_modules/typescript/bin/tsc -b --noEmit`: passed.
- `node node_modules/eslint/bin/eslint.js .`: 0 errors, 132 existing warnings. Focused changed-file lint passed.
- `RECALL_BUILD_VERSION=1.0-20261104-0006 node node_modules/vite/bin/vite.js build --mode production --outDir /private/tmp/recall-source-evidence-20261104/build --emptyOutDir`: passed, 161 precache entries. Existing chunk-size warning retained.
- Local server: `node scripts/serve-task-preview.mjs /private/tmp/recall-source-evidence-20261104/build 4197`; no production API is served.
- Focused browser command used `RECALL_URL=http://127.0.0.1:4197/`, installed `RECALL_CHROMIUM` and `RECALL_WEBKIT` paths, and `node scripts/run-playwright.mjs --grep '来源证据' --timeout=30000 --workers=2 --output=/private/tmp/recall-source-evidence-20261104/e2e-focused`: all 4 cases passed at 393 x 852 CSS pixels, DPR 3, plus 320px/text-enlargement checks. Synthetic WebKit screenshot visually verified answer, image and closed evidence in that order.
- Initial full PWA run used `RECALL_URL` with a loopback URL: 74 passed, 10 local-only cases skipped and 2 SW-update failures. The test server served this task build but its synthetic replacement SW still came from old `dist/`, causing missing precache assets. A later local-only run had 84 passed and 2 first-frame/update failures because two remaining HTML/SW fixture reads also used old `dist/`. All fixture/server reads now share `buildDirectory`; no app SW behavior or assertion was weakened.
- Final full local PWA run: `RECALL_E2E_BUILD_DIR=/private/tmp/recall-source-evidence-20261104/build`, the installed browser paths and `node scripts/run-playwright.mjs --config /private/tmp/recall-source-evidence-20261104/local.config.ts --timeout=30000 --workers=2 --output=/private/tmp/recall-source-evidence-20261104/e2e-core-clean`: 86 passed, no skips, 2.1 minutes, completed by `2026-11-04T00:23:28+08:00`. The private temporary config inherits the shipped browser guard/preflight and sets loopback baseURL without enabling remote-mode skips. Initial temporary-config startup failed with an ESM export error; adding a local `type: module` package scope corrected module loading without changing project dependencies.
- `pnpm test:e2e` with the same focused arguments failed before browser launch with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` during pnpm's automatic dependency check. Recovery used the existing guarded `scripts/run-playwright.mjs` entry without reinstalling or purging shared dependencies. Browser commands run outside the macOS sandbox with tool approval and retain the launch guard and global startup preflight.
- `git diff HEAD --check` and task documentation-link checks: passed. Committed-build comparison subsequently passed for all 203 files, as recorded below.
- Remote main contained only two new documentation commits (`6d0ab05`, `3d1fe73`). The nine task-owned paths were temporarily stashed, main fast-forwarded to `3d1fe73`, and the stash applied. The sole release-index insertion conflict was resolved by retaining both records. Unrelated Skill/private files were never stashed; the task stash is retained as a safety copy.
- Windows vault and Graphify are unavailable on this Mac; bootstrap used the existing project handoff and targeted renderer routes. No graph update claimed.

## Publication And Acceptance

- A clean `git archive` of source `511a9f3` was built using the same version marker and existing dependencies. All 203 output files are byte-identical to the local mobile-validated build. Comparison evidence: `/private/tmp/recall-source-evidence-20261104/committed-build-comparison.json`.
- Production was rechecked immediately before deployment and still pointed to `0325b1a9`. Published the clean committed build from the clean source directory, without `--commit-dirty=true`: `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy /private/tmp/recall-source-evidence-20261104/committed-build --project-name recall-memory --branch main --commit-hash 511a9f30f5f1830d13943ad288897191bf4a4976 --commit-message 'fix: fold source evidence below visible reading images'`.
- Deployment completed and was verified by `2026-11-04T00:27:52+08:00`: ID `a660fb54-3448-4845-a8d5-d6e69c15c40a`, source `511a9f3`, URL `https://a660fb54.recall-memory.pages.dev`; stable origin unchanged.
- Public byte verification completed `2026-11-04T00:34:04+08:00`: 118 files matched the committed build, including every JS/CSS asset, entry HTML, version, manifest, all three icons, SW and Workbox runtime. Anonymous GETs for `/api/sync`, `/api/auth/devices` and a synthetic media ID each returned 401. Evidence: `/private/tmp/recall-source-evidence-20261104/public-assets.json`. Both Node-fetch and curl transport runs completed successfully; curl was used as an independent recovery while the initial sequential run was slow.
- Initial public browser run forced a 60-second test limit: 2 passed, 8 failed at SW-control readiness during cold precache, 5.1 minutes. No evidence-folding assertion failure was observed. A separate empty Chromium context showed precache growing from 8 to 157 entries, then active/controller state `activated`, without failed asset responses; the only 401 was expected anonymous device-session access.
- Public recovery used the same ten tests and unchanged assertions, with the documented 300-second public test budget: `RECALL_URL=https://recall-memory.pages.dev/`, the same browser/build paths and `node scripts/run-playwright.mjs --grep '来源证据|iPhone15首页|长正反面|安全区、窄屏、760' --timeout=300000 --workers=2 --output=/private/tmp/recall-source-evidence-20261104/e2e-public-recovered`: 7 passed, 3 failed, 12.6 minutes. Final outcome observed at `2026-11-04T00:50:41+08:00`; evidence: `/private/tmp/recall-source-evidence-20261104/e2e-public-recovered.log`.
- Both illustrated-evidence cases and the text-only WebKit case timed out at `Readiness: sw-control`, before their folding assertions. Homepage, long-reading and safe-area cases passed in both engines; text-only evidence passed in Chromium. These results do not prove the failed public flows work or establish a folding regression. Public cold-start acceptance remains unresolved; no assertion or startup gate was bypassed, and no further app deployment or rollback is performed by the subsequent source-commit task.
- All automated UI checks use synthetic data in isolated browser contexts, not the owner's authorized library. No real card import or production mutation is authorized by this release.
- Physical iPhone Safari home-screen acceptance remains unverified. Browser simulation is not physical-device proof.

## Compatible Rollback

- If this release regresses reading, verify no later production release has superseded it, then use the existing Pages deployment rollback to `0325b1a9-edc0-42d2-a179-095dc38ec6b1` and recheck the stable origin.
- The previous app will show evidence expanded again. Card/image bytes, IDs and review data are compatible because this release changes display only.
- Do not roll back D1 data, clear device storage, change credentials, rewrite Git history or remove image storage. Record any rollback outcome in this record.
