# 20261031T195831+0800 - Standing Authorization And Default Verification

## Identity And Timeline

- Release ID: `20261031T195831+0800-standing-authorization`.
- Scope: documentation and agent instructions only.
- Status: in progress.
- Record started: `2026-10-31T19:58:31+08:00`.
- Validation: `2026-10-31T20:00:40+08:00`.
- Commit/push and completion: pending.
- App deployment time: not applicable; no app code is changed by this task.

## Changes And Reasons

1. `AGENTS.md`: persist the user's authorization to test, commit, push and release
   requested work without asking at each step. Require validation by default,
   precise blocker reporting and preservation of unrelated changes/private data.
2. Parent workspace `../AGENTS.md`: mirror the same rules for future workspace
   sessions and prototypes. This file is local-only; the parent has no committed
   history or configured remote and is not pushed to the app's GitHub repository.
3. `docs/RELEASES.md`: define one detailed record per task/release, the
   commit-before-deploy order, post-deployment evidence, version index and safe
   recovery. Documentation-only evidence commits do not trigger release loops.
4. `docs/DEPLOYMENT.md` and `docs/README.md`: link the delivery workflow from
   existing deployment guidance and the documentation index.
5. This record: establish an auditable first entry rather than inventing evidence
   for older deployments.

No app behavior, schema, API, device cards, credentials or paid resources change.
The existing uncommitted changes in `docs/PWA.md`, `docs/SELFHOST.md`,
`e2e/memory-workspace.spec.ts` and `src/components/memory-appearance.css` were
present at task start and are excluded from this commit/release.

## Source And Publication

- Repository: `xuda645-eng/Recall`, branch `main`.
- Base source: `d76f615`.
- Implementation commit: the first commit adding this record; resolve with
  `git log --diff-filter=A --format=%H -- docs/releases/20261031T195831+0800-standing-authorization.md`.
- Push result: pending.
- App deployment: not applicable. The rules/docs are published as source on
  GitHub; redeploying unchanged committed app code would risk replacing the
  current production bundle, which may include pre-existing uncommitted work.

## Validation

- `git diff --check`: passed for tracked changes. New record/index whitespace
  checks use `git diff --no-index --check /dev/null <file>`; status 1 alone means
  files differ, not a whitespace failure.
- A Node full-document relative-link check found a pre-existing broken
  `./TROUBLESHOOTING.md` link in `docs/README.md`. This task does not change that
  link; no unrelated documentation repair was included.
- Node inline validation (using `node --input-type=module`): passed for all six
  changed documents, 14 relative links inspected, no newly broken links,
  instruction dash and new-file whitespace checks passed. The unchanged broken
  link was confirmed against `git show HEAD:docs/README.md` and recorded above.
- Staging scope: limited to the four app-repository documentation files and this
  release record; the parent mirror and four pre-existing edits are excluded.
- Application tests/build and physical iPhone checks: not applicable to this
  documentation-only change; no phone or app acceptance claim is made.
- Read-only Wrangler identity/project/deployment checks initially failed in the
  sandbox with `EPERM` on `/Users/bytedance/.npm/_cacache/tmp/`. The same checks
  succeeded with tool-approved escalation; no credential values were copied.

## Production Baseline And Recovery

- Production origin: `https://recall-memory.pages.dev/`.
- Observed current production deployment:
  `8adde351-c4c8-4c8d-aa5b-cdd100a3affe`, source reported as `d76f615`.
- Deployment URL: `https://8adde351.recall-memory.pages.dev/`.
- Prior production deployment:
  `8e3a2d28-e70e-49af-bea1-c609038fed7e`, also reported as `d76f615`.
- Evidence commands: `npx --yes wrangler@4.156.0 whoami`,
  `npx --yes wrangler@4.156.0 pages project list`,
  `npx --yes wrangler@4.156.0 pages deployment list --project-name recall-memory --environment production`.
- These IDs are an observed baseline, not proof that an older deployment is
  known-good or that the reported SHA includes all previously deployed changes.
- No production rollback is needed for this documentation-only task. If these
  rules need correction, make a scoped revert/new documentation commit in the
  app repository and update the local workspace mirror. Do not force-push,
  replace the live app, reset D1 or clear device storage.
