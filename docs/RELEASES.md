# Release Records And Delivery Workflow

The user approved this workflow on 2026-10-31. Testing and delivery are default
parts of completing requested Recall work, not questions to ask at the end.
`AGENTS.md` defines the standing authorization and its safety boundaries.

The explicit-only parallel delivery exception in `AGENTS.md` applies only when
the user enables `$recall-parallel-delivery` for the current chat. Developers
still validate, commit task branches, deliver applicable previews and keep unique
pending task records, but do not push main or deploy production. The integration
owner updates this shared index and completes the combined main/production
delivery. Safe previews on existing authorized infrastructure do not require
repeated business confirmation and must remain separate from production/data.
Without explicit activation, the normal delivery loop below is unchanged;
maintaining or installing the Skill does not activate it.

## Delivery Loop

1. Inspect the worktree, current branch/remotes and applicable agent rules.
   Preserve unrelated changes. Check the existing Cloudflare account, project
   and current production deployment before an app release. Keep the production
   origin at `https://recall-memory.pages.dev/`.
2. Implement the requested change and run applicable verification proactively.
   Start with focused tests, then lint, unit tests, type checks, production build
   and relevant mobile acceptance for app changes. Follow `PWA.md` for the
   393 x 852 CSS-pixel iPhone 15 baseline and `CLOUD_SYNC.md` for local cloud
   checks. Do not mutate the owner's real production library during testing.
3. Create a unique `releases/<YYYYMMDDTHHMMSS+0800>-<slug>.md` record and add it
   to the index below. Record actual timezone-qualified timestamps and the
   previous production deployment before publishing. A timestamp release ID is
   independent of the package's semantic version; do not create a `v*` tag or
   trigger desktop releases unless the task calls for it.
4. Review the diff for secrets/private data and task scope, commit the validated
   changes, and push normally to `xuda645-eng/Recall` on `main`. Preserve history.
   A rejected push requires inspecting the divergence, not force-pushing or
   overwriting others' work. Do not deploy after a failed push.
5. Publish the exact committed, validated root-path app bundle to the existing
   Cloudflare Pages project `recall-memory`, following `DEPLOYMENT.md` and
   `CLOUD_SYNC.md`. Do not ship unrelated dirty work or claim an uncommitted
   bundle matches the recorded source SHA.
6. Verify the live origin, root-path manifest/icons, Service Worker and relevant
   mobile flows. Record whether checks were local, public, simulated or physical.
   Use only non-destructive production checks; authenticated mutation tests
   belong on local/synthetic data.
7. Append deployment IDs/URLs, the deployed source SHA, push outcome, verification
   results and completion time to the same record, then commit/push this evidence
   as a documentation-only follow-up. Record its push outcome in the final status
   report; do not create an endless chain of commits describing their own push.
   This metadata update is not another app release. Report the production URL,
   result, release record path and any remaining limitations to the user.

Documentation-only work still gets validation, a commit/push and its own record,
but does not replace the unchanged Pages app. Check Markdown links and diff
whitespace rather than running unrelated application tests. Private card batches
and internal handoffs remain local under the existing ignore/privacy rules; the
authorization does not make them public or authorize an APP import. The parent
workspace's `AGENTS.md` is a local mirror, not a second GitHub repository.

## Validation Failures And Rollback

- When a command cannot run, attempt a reasonable recovery and record the exact
  failure, attempts and unverified scope. Do not label unavailable checks as
  passes. A known regression or critical unverified behavior blocks deployment;
  do not ask whether testing is wanted or silently weaken the release gate.
- Keep records for blocked/failed attempts, with the production state unchanged
  if nothing was deployed. Never claim success just because upload completed.
- If this release causes a post-deploy regression, restoring its compatible,
  recorded known-good Cloudflare Pages deployment is pre-approved. Recheck the
  current live deployment so that recovery does not replace somebody else's
  newer release. Use Pages deployment rollback, not a sync-relay Workers command.
  Verify recovery and append a timestamped incident/rollback section.
- An asset/code rollback does not undo D1 schema/data changes, device-local data
  or Service Worker caches. Check compatibility first. Never reset databases,
  clear phone storage or reverse destructive migrations under this authorization.
  If a safe rollback is unavailable, report the blocker instead of guessing.
- For a source-level recovery, create a scoped revert/new fix commit, run checks,
  push normally and release it with a new record referencing the incident. Do
  not reset shared history, force-push or rewrite an old release record.

## Required Record Fields

| Field | Required evidence |
|---|---|
| Identity | Unique release ID, title, app/docs/private-local scope, status. |
| Time | Start, validation, commit/push, deployment, verification and completion times with timezone; use `not applicable` where appropriate. |
| Changes | What changed, why, affected files/behavior and data/schema/API impact. |
| Source | Repository/branch, deployed implementation SHA, evidence follow-up SHA or Git locator, remote push outcome. |
| Validation | Exact commands, results/counts where available, environment, failures and unverified physical-device checks. |
| Deployment | Production origin, actual deployment ID/URL and result, or explicit reason no app deployment occurred. |
| Previous version | Prior production deployment ID/source SHA and whether its known-good/compatibility status was verified. |
| Recovery | Specific target and recovery procedure, compatibility/data limits, incident timestamps and verification if used. |

Do not store credentials, real cards, recovery codes or private database exports
in release records. Redact sensitive test output. Historical releases are not
retroactively marked verified just because a deployment still exists.

## Index

| Release | Scope | Result | Record |
|---|---|---|---|
| `20261101T185732+0800-main-worktree-reconciliation` | Main draft preservation / already-committed content reconciliation / docs | All six drafts preserved; original main synchronized cleanly, record `1ef1be8` pushed; no app redeployment | [Main worktree reconciliation](./releases/20261101T185732+0800-main-worktree-reconciliation.md) |
| `20261101T165615+0800-iphone-system-frame-adoption` | Proven F viewport mechanism in iPhone standalone app / default cover elsewhere | `b5e79fd` deployed as `b15d48db`, version `1656`; 1423 unit/74 mobile passed; public bytes/auth and 3 browser cases passed, 1 Chromium startup case failed including retry; owner accepts real-app upper-edge clarity at 18:04, wider native PWA paths unverified | [iPhone system-frame adoption and lessons](./releases/20261101T165615+0800-iphone-system-frame-adoption.md) |
| `20261101T144312+0800-weread-no-action-cap` | Remove online/manual single-action 20-question ceiling / daily 300 retained / large-job recovery | `165219c` deployed as `8856d0ab`, version `1443`; 1414 unit, 191 cloud, 46 WeRead and 86 core mobile checks passed; public bytes/auth verified with recoveries, live SW/cache and physical acceptance unverified | [WeRead without the 20-question action cap](./releases/20261101T144312+0800-weread-no-action-cap.md) |
| `20261101T142411+0800-weread-image-capability` | Official image-resource research / defer image viewer / confirm daily 300 live | Research `9e52ebc` pushed; current Skill 1.0.5 and 17 live APIs supply no book-interior image resource; no image UI shipped; 133 cloud and 12 client checks passed; existing `d6bc9380` retained, no new app deployment | [WeRead image capability decision](./releases/20261101T142411+0800-weread-image-capability.md) |
| `20261101T134408+0800-weread-daily-300` | Daily AI attempts 100 to 300 / shared server-client budget / boundary tests | `9b85a18` deployed as `d6bc9380`, version `1350`; 1405 unit/191 cloud and local mobile gates passed across recorded retries; public bytes/auth and Chromium passed, full public WebKit/physical acceptance unverified | [WeRead daily budget 300](./releases/20261101T134408+0800-weread-daily-300.md) |
| `20261101T142400+0800-system-safe-frame` | Original-installed static F / browser-managed safe-frame comparison | `ba1cfbf` deployed as `f175e4fc`, version `1424`; 1406 unit/68 mobile and public checks passed after recorded retries; user confirms physical F clear and no visible status-bar overlap | [System safe-frame comparison](./releases/20261101T142400+0800-system-safe-frame.md) |
| `20261101T133526+0800-installed-context-variants` | A/B/C comparison inside original PWA / native blur reproduction | `51421fc` deployed as `1279e5dc`, version `1335`; physical A/B/C blurred; clear D has same viewport but Logo top 10 vs B 69; no winning fix | [Original-context variant comparison](./releases/20261101T133526+0800-installed-context-variants.md) |
| `20261101T111411+0800-installed-context-diagnostics` | Original-PWA read-only display report / same-origin static comparison | `08c6e46` deployed as `e31a1318`, version `1114`; 1385 unit/66 mobile checks and public checks passed after recorded retries; original-iPhone static page also blurred | [Original installed-context diagnostics](./releases/20261101T111411+0800-installed-context-diagnostics.md) |
| `20261101T104013+0800-full-shell-device-probe` | Actual-source D/E shell probe / physical evidence | `cb055bf` preview `898bd7f7`; user confirms D/E both clear in installed PWA, production symptom not reproduced; no production fix claimed | [Full shell device comparison](./releases/20261101T104013+0800-full-shell-device-probe.md) |
| `20261101T090121+0800-status-edge-device-probe` | Synthetic installed-PWA A/B/C probe / failed native result evidence | r2 `467ae94` preview `3d883c6b`; user reports A/B/C all clear, including baseline A, so production trigger not reproduced; production unchanged | [Installed PWA device probe](./releases/20261101T090121+0800-status-edge-device-probe.md) |
| `20261101T022522+0800-all-pending-integration` | All pending Recall tasks / folder archive / PWA version-refresh / Skill scope / evidence | Main `a319c3b` deployed as `2ac571d2`; 1382 app, 187 cloud, 118 local mobile/update/WeRead passed; public assets/auth verified across attempts, browser acceptance partial, physical unverified | [All pending tasks unified integration](./releases/20261101T022522+0800-all-pending-integration.md) |
| `20261101T020208+0800-preview-delivery-policy` | Skill preview handoff / explicit parallel authorization / docs | Snapshot `db0c145` integrated/pushed with `a319c3b`; updated Skill installed, no separate app deployment | [Preview delivery and explicit parallel authorization](./releases/20261101T020208+0800-preview-delivery-policy.md) |
| `20261101T014653+0800-folder-archive-version` | Whole-folder archive / build version / safe refresh / isolated preview tools | Snapshot `638a1d7` integrated; combined main `a319c3b` deployed as `2ac571d2` | [Folder archive and PWA build version](./releases/20261101T014653+0800-folder-archive-version.md) |
| `20261101T015717+0800-status-sampling-safe-area` | Installed WebKit PWA sampling region / mobile regression checks | Source `3e6a08e` deployed/integrated; user subsequently confirmed blur persists on iOS 27.0.1 installed PWA, see device-probe record | [Safe-area status sampling](./releases/20261101T015717+0800-status-sampling-safe-area.md) |
| `20261101T014756+0800-explicit-parallel-skill` | Explicit-only Skill / local installation / docs | Validated, installed and source `12457e6` pushed; no app deployment | [Explicit-only parallel delivery Skill](./releases/20261101T014756+0800-explicit-parallel-skill.md) |
| `20261101T010911+0800-main-integration` | Combined study queue / WeRead final correction / iOS shell / release reconciliation | Main `b198189` pushed/deployed; 1341 app, 187 cloud, 106 local mobile/update checks passed; public assets/auth and 8 mobile checks passed across attempts, full public/physical acceptance not claimed | [Main integration and production release](./releases/20261101T010911+0800-main-integration.md) |
| `20261101T001208+0800-ios-status-edge` | Installed WebKit PWA / isolated-copy fix / tests | Merged and deployed; 1201 unit, 187 cloud, 46 PWA and 38 WeRead checks passed; live WebKit recovered, broader Chromium loading and physical effect unverified | [iOS status edge compatibility](./releases/20261101T001208+0800-ios-status-edge.md) |
| `20261101T002727+0800-weread-automatic-import` | Production WeRead book cards / confirmed automatic import / persistent jobs / protected APIs | Initial version deployed; final correction `4af5d3a` included in main integration deployment `0a8d051f` | [WeRead book selection and automatic import](./releases/20261101T002727+0800-weread-automatic-import.md) |
| `20261101T002412+0800-review-study-task-branch` | PWA study scheduling/selection/settings and interface / isolated task branch | Task commits `c2a460a` / `c3db6fc` fully merged into main `b198189`, pushed and deployed by main integration | [PWA review queue task branch](./releases/20261101T002412+0800-review-study-task-branch.md) |
| `20261031T234739+0800-weread-selection-design` | Independent high-fidelity prototype / synthetic mobile tests / docs | Source pushed; 32 mobile browser checks passed, no production app change | [WeRead selection and automatic import design](./releases/20261031T234739+0800-weread-selection-design.md) |
| `20261031T233712+0800-browser-crash-guard` | Local browser test tooling / safety docs | 17 guard checks, 1158 unit tests and 44 mobile E2E passed; no app redeployment | [macOS test browser crash prevention](./releases/20261031T233712+0800-browser-crash-guard.md) |
| `20261031T232024+0800-topbar-weread-runtime` | Mobile topbar / WeRead Workers transport / tests | Source `dfed397` pushed and deployed; inherited pending evidence preserved by main integration, physical iOS 27 unverified | [Idle topbar and WeRead runtime compatibility](./releases/20261031T232024+0800-topbar-weread-runtime.md) |
| `20261031T223906+0800-release-coordination-diagnosis` | Coordination / read-only diagnosis / docs | Concurrent release complete; Logo and production WeRead diagnosis incomplete, app unchanged | [Release coordination and diagnosis](./releases/20261031T223906+0800-release-coordination-diagnosis.md) |
| `20261031T222000+0800-startup-optimization` | App startup / SW registration / font precache / acceptance | Deployed; local and public WebKit passed, public Chromium offline check network-blocked | [Startup dependency and offline optimization](./releases/20261031T222000+0800-startup-optimization.md) |
| `20261031T214845+0800-public-test-budget` | Acceptance configuration / docs | Pushed; public budget 5 minutes, behavior assertions retained | [Bounded public acceptance budget](./releases/20261031T214845+0800-public-test-budget.md) |
| `20261031T214513+0800-network-retry-release` | Normal-network retest / pending PWA + WeRead AI release | Deployed; assets/auth passed, browser verification partial due to network | [Network retest and pending release](./releases/20261031T214513+0800-network-retry-release.md) |
| `20261031T212804+0800-public-diagnosis` | Read-only network / app and SW-stage diagnosis / docs | Slow transfers and delayed serial precache identified; production unchanged | [Public loading blocker diagnosis](./releases/20261031T212804+0800-public-diagnosis.md) |
| `20261031T210732+0800-publish-pending` | Combined PWA / WeRead AI / additive D1 / config / docs | Source pushed; deployed in later network-retry release with partial live verification | [Publish reviewed pending work](./releases/20261031T210732+0800-publish-pending.md) |
| `20261031T204601+0800-smoke-once` | Automation / one manual live probe / docs | Source pushed; automation remains paused; no app release for this task | [One current smoke round](./releases/20261031T204601+0800-smoke-once.md) |
| `20261031T204352+0800-smoke-24h` | Local smoke automation / script / docs | Source pushed; schedule superseded by cancellation | [24-hour smoke window](./releases/20261031T204352+0800-smoke-24h.md) |
| `20261031T202802+0800-weread-ai` | App / protected API / additive D1 | Deployed in network-retry release; auth boundary passed, real-book acceptance unverified | [WeRead online import and AI questions](./releases/20261031T202802+0800-weread-ai.md) |
| `20261031T202358+0800-topbar-opaque-surface` | Mobile PWA shell | Deployed in network-retry release; local tests passed, physical blur unverified | [Opaque mobile topbar surface](./releases/20261031T202358+0800-topbar-opaque-surface.md) |
| `20261031T195831+0800-standing-authorization` | Documentation | Published to GitHub; app unchanged | [Standing authorization and default verification](./releases/20261031T195831+0800-standing-authorization.md) |
| `20261031T202329+0800-project-auto-review` | Agent configuration and documentation | Configuration verified and source pushed; no separate app release | [Project automatic approval review](./releases/20261031T202329+0800-project-auto-review.md) |
