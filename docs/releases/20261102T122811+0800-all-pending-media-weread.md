# All Pending Integration - Screenshots And WeRead Grouping

## Identity And Scope

- Inventory started `2026-11-02T12:28:11+08:00`, Asia/Shanghai.
- Explicit `recall-parallel-delivery` integration role; user requested all pending Recall work.
- Worktree `/private/tmp/recall-integration-all-pending-20261102`, branch `codex/integration-all-pending-20261102`.
- Starting remote main `ce276d0e9ead2d438136bd8744311d07d8e61b69`.
- Fixed build marker `1.0-20261102-1240`. Desktop/package version unchanged; no tag or new infrastructure.
- Current status: delivered to main and production, verified `2026-11-02T13:01:05+08:00`. Actual source/migration/configuration/deployment results are recorded below.

## Inventory And History Preservation

| Task | Fixed implementation / evidence | Integration |
| --- | --- | --- |
| Screenshot packages, independent image storage/sync and task Skill | `de9b3e8` / `9f2fe70` | Included via `6abc234bc82bd283e0ab7769352f7443d3826c96` |
| Three primary import choices; secondary methods folded | `5d47553` / `6abc234` | Same image branch, including final preview evidence |
| Requested Ark endpoint compatibility check | `a3a4ac2` / `de8525b` | Included via `375dd6f5aac8bde196b9a95828278f1b228dc169` |
| Ordered adjacent grouping, preview/edit/split/combine and recovery | `f91c013` / `375dd6f` | Same WeRead branch, including prior real-book candidate and preview evidence |

Both task worktrees were clean and owning chats idle. History-preserving merges
produced `36d5466` and `22727b6`. Git conflicts only affected
`memory-workspace.tsx`: keep current archive memoization, remove obsolete import
icon, retain archive-time sorting and add source-position ties. Reviewed API
auto-merge retains authenticated media and grouping routes. Current four-request
generation, 300/day budget, archive catalog and installed-context viewport remain.

Shared main and the two old Codex worktrees remain at `1c64e51` with six identical
archive draft paths. Binary diff SHA-256:
`d5222a2ab92f151c177b61ca95a380b62f794735096642663257846b808cb346`.
These are older drafts of shipped `59f70c5`, which additionally includes empty
descendants, retained-state filters and nested restore. Do not reapply or clear
the originals. Other clean tasks are reachable from main. The `fd5b45d` status
record and dirty status-sampling record match main. The installed-context draft
omits later physical evidence. Snapshots `512e9e7` / `379bb3e` and preservation
stash are superseded, not new releases. Private batches remain untouched.
No coordination messages or new user-owned chats were sent.

Windows vault and Graphify were unavailable, disclosed once. Used existing
handoff/architecture routes and targeted reads. Dependencies were copied into
the integration worktree; no shared source link or lockfile change. Tests use
isolated data, ports and grouping outputs.

## Integration Corrections

- Safety review reproduced false upload receipts when a download helper returned a concurrent local save. Always verify authenticated server presence before marking an image uploaded for a space. Failure keeps it pending; race/failure regressions added.
- Complete backups silently omitted legacy desktop filename and image-occlusion files. Export/restore now reject unsupported legacy attachments explicitly before presenting an incomplete backup as complete. Original desktop images/text exports untouched.
- Grouped originals stay byte-exact/read-only. Hide screenshot editor rather than offer attachments the original guard would discard. Added browser regression assertion.
- Grouping tests support isolated outputs and public URL; screenshots use test-specific paths instead of overwriting old task evidence.
- Assembled cloud state now rejects overlapping ownership involving grouped sources, independent of mutation order. Archived cards retain ownership; tombstones permit transfer. Legacy single-single duplicates remain accepted for existing-snapshot compatibility. Added 22 synthetic atomicity/ownership cases.
- Cancelling an expired/invalid draft compares the exact observed record inside the delete transaction. A blocked old tab cannot delete a replacement draft. Normal cancellation checks generation/revision. Four Chromium/WebKit cases use real two-page IndexedDB, not an in-memory simulation.
- Markdown compares grouped answers using the parser's newline/boundary normalization but retains the original stored bytes and provenance when changing a question. Actual text replacement remains blocked. Added question-only roundtrip/repeat/tamper regression.

## Validation

- Final `node node_modules/vitest/vitest.mjs run --coverage`: 90 files / 1558 tests passed; `/tmp/recall-integration-units-release-20261102.log`.
- Final `node node_modules/eslint/bin/eslint.js .`: zero errors / 132 existing warnings; `/tmp/recall-integration-lint-release-20261102.log`.
- App `node node_modules/typescript/bin/tsc -b --noEmit` and cloud `node node_modules/typescript/bin/tsc -p tsconfig.cloud.json` passed.
- `node node_modules/vitest/vitest.mjs run --config cloud-tests/vitest.config.ts`: five files / 382 synthetic SQLite tests passed, including media quota/auth, grouped sync/cache, cross-card source ownership and shared budgets.
- `RECALL_PROJECT="$PWD" python3 -m unittest discover -s skills/lark-yellow-to-recall/scripts/tests`: 52 tests passed, no private input/model requests.
- `node scripts/weread-merge-runtime-probe.mjs --runtime-modules /Users/bytedance/.npm/_npx/d77349f55c2be1c0/node_modules`: 17 actual local workerd checks passed, 38 intercepted synthetic Ark responses, zero real external requests, ephemeral local D1 only.
- Final guarded `node scripts/run-playwright.mjs --workers=2 --output=/tmp/recall-integration-pwa-final-20261102`: 82 Chromium/WebKit checks passed after all product fixes; `/tmp/recall-integration-pwa-final-20261102.log`. Safe areas, narrow/breakpoint/landscape, archive, long reading, import, rating/undo, version/SW update and offline reopening covered.
- Guarded media / import-choices configs: 6 / 4 checks passed; `/tmp/recall-integration-{media,import}-e2e-20261102.log`. Final grouping config passed 14/14 after all UI/draft fixes; `/tmp/recall-integration-grouping-final-e2e-20261102.log`, `RECALL_MERGE_OUTPUT=/tmp/recall-integration-grouping-final-20261102`.
- Initial browser invocation safely failed with `RECALL_BROWSER_SANDBOX` before launch. Exact approved unsandboxed retry passed. No sandbox marker/guard/OS security bypass.
- Local HTTPS `e2e/cloud.config.ts`: 2/2 passed, actual isolated Pages/D1 two-device synchronization, offline archive, lost-response replay, conflicts and revocation; `/tmp/recall-integration-cloud-e2e-20261102.log`.
- Local HTTPS `e2e/media-cloud.config.ts`: 2/2 passed, actual isolated Pages/D1 upload/download, no repeated upload and revoked authorization; `/tmp/recall-integration-media-cloud-e2e-20261102.log`.
- First simultaneous local image server failed because the default inspector port was occupied by the other integration server. Read-only `lsof` confirmed main port 8798 free and inspector 9229 occupied. Wrangler help first hit sandbox npm-cache EPERM; approved same-command retry passed. Set only the image server's inspector to 9230; both HTTPS suites passed. No unrelated process stopped or cache ownership changed.
- Task Skill quick validation passed with existing temporary PyYAML dependency. Final Skill 52 tests passed against integrated parser; `/tmp/recall-integration-skill-release-20261102.log`.
- Documentation check: 70 local links passed across 85 reviewed files; actual credential value excluded. Synthetic screenshot fixture and WebKit import layout visually inspected. Diff and temporary public-probe syntax checks passed.
- Final production build passed. The first cross-directory hash comparison failed on `sw.js`: the reused external output directory retained 25 obsolete assets, giving 186 precache entries rather than the clean production 161. Both local servers were stopped before rebuilding with explicit `--emptyOutDir`. All 203 files then matched the clean production build, with no extra files. Manifest SHA-256 `2dbe74d0c690847c246cffd9f50ec6337b9c1ae7dc10b64660f6becffe0321b8`; `/tmp/recall-integration-bundle-sha256-20261102.txt`.
- The final 82-case PWA run used the normal emptied `dist/` directory, not the stale external SW. Local D1 suites blocked SW and loaded the matching current entry/asset graph; their passing auth/data results are not claimed as acceptance of the stale SW. Build mismatch was recovered before any source push/deployment.
- Publication/public acceptance outcomes are recorded below, including the failed aggregate HTTP attempt and bounded recovery.

Browser commands use build marker `1.0-20261102-1240`, cached Chromium-1223 /
WebKit-2272 executables and `scripts/run-playwright.mjs`. iPhone baseline is
393x852 CSS pixels / DPR 3. Builds never write a directory being served by tests.
All mobile evidence is simulation, not physical installed-iPhone acceptance.

## Hosting And Data Safety

- Wrangler verified account `751b9fca4f5173fd70e0dfb69cff81e2` and existing Pages `recall-memory`.
- Previous production `dd286cc8-ab18-4ec5-92e5-e31dd9b3c92d`, source `59f70c5`, URL `https://dd286cc8.recall-memory.pages.dev`. Stable origin `https://recall-memory.pages.dev/` unchanged.
- November 2 account dashboard showed Free / US$0 / current plan. D1 allowances: 5GB total, five million reads/day and 100,000 writes/day. [Official D1 limits](https://developers.cloudflare.com/d1/platform/limits/) confirm 500MB/Free DB and 2MB/BLOB-row. App limits stay 512KiB/image and 64MiB/space. No upgrade.
- Read-only D1 info: `recall-memory-data`, ID `7e0289a3-30a4-479a-a60a-58eabea71507`, 303104 bytes at inventory. Only pending migration `20261101_recall_media.sql`.
- Existing D1 exported before migration to `/private/tmp/recall-integration-private-20261102/pre-media-migration.sql`, directory mode 700/file 600. Never committed, published or used for tests. Wrangler warned export may briefly pause queries. Never publish its signed temporary download URL.
- Secret-name listing confirms encrypted `ARK_API_KEY`, `ARK_BASE_URL`, `ARK_ENDPOINT_ID`, `RECALL_BOOTSTRAP_CODE`, `WEREAD_API_KEY`; values not retrieved/printed. Only requested EP `ep-20261102000025-wt6tl` changes. Keys/recovery/WeRead credentials untouched.
- Old EP `ep-20261031025337-vgbrw` is observed in private local config, not proven to be previous production secret. No guessing that rollback value.
- No production library mutation tests, private screenshots, real-book imports, new paid inference tests, preview credentials or infrastructure. Prior real-book candidate evidence belongs to authorized developer work; this integration does not repeat or import it.

## Publication And Compatible Recovery

Commit/push reviewed source to main before authorized additive migration and
exact-bundle deploy. Recheck main/task tips and production before publication.
A rejected push blocks deploy. Append actual outcomes in docs-only follow-up,
without a second application release.

Keep media tables/counters, cloud images and device IndexedDB during rollback.
Never reset/drop/seed D1 or erase phone storage. Previous assets lack image UI
and grouped-source validators: restore only after checking compatibility and
whether new grouped provenance exists. Otherwise keep compatible worker and
release a tested fix. Private local EP is not proof for automatic secret rollback.
Credentials/data rollback needs separate authorization. No rollback claimed.

See [media](../MEDIA.md), [WeRead](../WEREAD_IMPORT.md), [PWA](../PWA.md),
[hosting](../DEPLOYMENT.md) and [cloud safety](../CLOUD_SYNC.md).

## Published Outcomes

- Source commit `70a98c4b6fe0dcfe454eeb7c7bcdc1be6a5da799`, created `2026-11-02T12:54:54+08:00`.
- Normal `git push origin HEAD:main` succeeded, advancing `ce276d0` to `70a98c4`. Remote SHA recheck matched before deployment and after public validation. Both fixed task tips are reachable; no remaining unmerged task branch was found.
- Production migration command `CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 d1 migrations apply DB --env production --remote` applied only `20261101_recall_media.sql`, five commands / 0.90ms reported. No card seed/reset/update; post-publication listing reports no migrations to apply.
- Existing encrypted production `ARK_ENDPOINT_ID` updated via stdin to requested `ep-20261102000025-wt6tl`; Wrangler reported success. No other credential changed. This confirms configuration publication, not a new live production inference request; runtime compatibility uses developer evidence plus synthetic integrated workerd tests.
- Clean-source deployment command used `pages deploy dist --project-name recall-memory --branch main --commit-hash 70a98c4b6fe0dcfe454eeb7c7bcdc1be6a5da799`, with explicit existing account. All 203 predeployment file hashes passed; no dirty flag. Wrangler uploaded 28 assets, reused 173, and compiled/uploaded the Functions bundle, headers and routes.
- Production deployment ID `3da17d22-3d57-45b3-9058-3c1d6d9bdde4`. Fixed URL `https://3da17d22.recall-memory.pages.dev`; stable origin `https://recall-memory.pages.dev/`. Listing confirmed Production / main / source `70a98c4`. Visible version `1.0-20261102-1240`.
- Read-only HTTP probe checked 38 resources/interfaces: 32 static hashes plus six anonymous API gates. Initial aggregate passed 37/38; `cloze-DpTIrGLd.js` hit two SSL connection timeouts. Individual bounded curl without forced HTTP/1.1 then returned 200 and exact expected SHA-256 `7b10c3a09bc5d51884df052593261e1da7b487998fccca6903fed7a223fba32f`. All 38 verified across attempts, not one aggregate pass. Evidence `/tmp/recall-integration-public-http-20261102.json` and `/tmp/recall-integration-public-http-combined-20261102.json`. Includes root, module/CSS graph, manifest/icons, SW/Workbox, no-store version and anonymous auth/sync/devices/books/merge/media rejection.
- Public grouping suite `RECALL_MERGE_URL=https://recall-memory.pages.dev/ RECALL_MERGE_OUTPUT=/tmp/recall-integration-public-grouping-20261102 ... node scripts/run-playwright.mjs --config e2e/weread-merge.config.ts --workers=2 --timeout=120000`: 14/14 Chromium/WebKit cases passed, including ordered originals, preview/edit/split/combine/import, protected answers and true two-tab draft replacement. All upstream/API test responses intercepted; no live model calls or owner-library mutation. `/tmp/recall-integration-public-grouping-20261102.log`.
- Selected primary suite `RECALL_URL=https://recall-memory.pages.dev/ ... node scripts/run-playwright.mjs --grep '抽屉显示固定构建版本|归档目录兼容|Markdown预览|PWA部署路径' --workers=2 --output=/tmp/recall-integration-public-pwa-20261102`: 8/8 passed. Seven cases exercised the public origin, including Chromium SW/offline reopen, version, archive restore and Markdown progress. The shipped WebKit offline case deliberately serves an isolated local copy, so its pass is local recovery evidence, not public WebKit offline proof. `/tmp/recall-integration-public-pwa-20261102.log`.
- All 203 deployed-bundle files passed an actual-credential exclusion scan. Screenshot/card fixtures are synthetic. No private batch, real-book candidate or source screenshot published.
- Matching `lark-yellow-to-recall` Skill synced to `/Users/bytedance/.codex/skills/lark-yellow-to-recall` after production publication, with previous installation preserved under the restricted private backup directory. Source/install comparison and quick validation passed; Python caches excluded. The new Skill is available on the next turn, not silently activated in unrelated chats.
- Original shared-main archive diff remains the same captured SHA-256; no old worktree was cleaned, staged or rewritten. Preserved dirty copies are already-delivered drafts, not pending new tasks. Both local D1 servers were stopped after validation.

No observed product regression or rollback. Public WebKit offline reopening,
physical iPhone Safari home-screen installation/update/offline acceptance and
authenticated live-production model/media mutation flows are not claimed.
Local D1 and synthetic browser evidence are distinct from those checks.

If recovery becomes necessary, first confirm current production has not moved
past this deployment. Check grouped-provenance/media compatibility before using
the prior deployment. Dashboard route: Workers and Pages > recall-memory >
Deployments > the compatible previous Production deployment > Rollback. Verify
root/version/assets/auth afterward and append the incident. If the old worker
cannot preserve new grouped data, retain a compatible worker and publish a
validated forward fix instead. Never drop media tables, restore the private SQL
over a live library, change credentials or clear device storage as asset rollback.

This final evidence is a documentation-only commit/push after publication. It
does not rebuild/redeploy the unchanged source bundle or create another release.
Final follow-up checks cover exactly six documentation files: 59 local Markdown
links resolve, actual credentials are excluded, added prose uses permitted
characters, and `git diff --check` passes. The initial `python3 -` exclusion
check stopped because this integration/original worktree had no local credential
file; a bounded retry used the known developer environment files without
printing values and passed. No app validation or deployment was repeated.
