# WeRead Ark Endpoint Check

## Scope And Delivery Status

- Role: parallel developer task, explicitly enabled by the user.
- Status: pending integration, not deployed to production.
- Requested prerequisite: switch the task's Ark endpoint to
  `ep-20261102000025-wt6tl` and verify a real inference request before implementing
  the agreed multi-highlight grouping design.
- Application source baseline: `1c64e517c9ce4030895073ce6e2ec16958c95fda`.
- Task branch: `codex/weread-endpoint-20261102`.
- Worktree: `/private/tmp/recall-weread-endpoint-20261102`.
- A separate clean worktree was created because the supplied worktree contained
  six unrelated uncommitted files. Those changes were not copied, staged or
  edited. No application source, shared release index or database schema changed.
- The task-local ignored `.dev.vars` now selects the requested endpoint and the
  existing supported Ark base. It contains no API key. This local file is not a
  production configuration change and is not included in Git.
- The existing private credential file and API key were read in memory only and
  were not modified or copied into this worktree.
- The production endpoint secret, production deployment, main branch and real
  library were not changed. No production release or new preview was created.

## Real Request Evidence

- Request started at `2026-11-02T00:03:44.821+08:00`, Asia/Shanghai.
- Validation command:
  `node --experimental-strip-types /private/tmp/recall-weread-endpoint-probe-20261102.mjs`.
- The task-local endpoint was used with the unmodified
  `questionRequest`, `arkResponsesUrl` and `parseQuestionResponse` functions from
  `shared/weread-ai.ts` at the application source baseline.
- Request contract: `weread-question-v1`, strict JSON schema, no tools,
  `thinking.type=disabled`, `store=false`, `stream=false`, summary disabled and
  maximum output of 384 tokens. Redirects were not followed.
- Exactly one real model request was made, with a 45-second timeout and no retry.
  The input was a short synthetic sentence, not a book excerpt or personal
  highlight. No WeRead account request or production D1 request was made.
- Result: HTTP 200, response status `completed`; the existing application's
  response parser accepted the returned question and `summary=null`.
- The response's `model` field reported `deepseek-v4-1-flash-261017`. This records
  the observed response field, not an independent model-catalog verification.
- Returned synthetic question: "检验结论时，应按照什么顺序区分和处理事实与判断？"
- Duration: 1237ms. Reported usage: 213 input tokens and 24 output tokens.
  No monetary cost or free-inference claim is made.
- Upstream request ID:
  `0217935490250346cb63cadb26a6eb1a5dd8bb71cce3d7f7a1cff`.
- Sanitized local result artifact:
  `/private/tmp/recall-weread-endpoint-result-20261102.json`.
- The previously paused scheduled smoke and its bounded state were not resumed,
  reset or modified. This was a new, explicitly requested single check.

## Validation And Limits

- Windows vault and Graphify remain unavailable on this Mac. Used the existing
  project owner-file map and targeted configuration/documentation inspection.
  No Graphify update is needed or claimed for this documentation-only task.
- `node --check /private/tmp/recall-weread-endpoint-probe-20261102.mjs` passed.
- The first optional `arkcli resources resolve --help` inspection could not
  initialize its dedicated local state under the sandbox. No ArkCLI business
  request was made, and its error said that existing state was not overwritten.
  The task did not require that CLI; the real check instead used the configured
  Ark Responses API and the actual Recall request/response contract.
- Inline Node document validation passed: both relative links resolve, the
  existing API key value is absent, and prose/whitespace checks pass.
  `git diff --check` passed; staged diff checks also run before committing.
- `git check-ignore .dev.vars` confirms the task-local endpoint configuration
  is ignored. Only this release record is included in the task commit.
- App lint, app unit suites, a production build and browser acceptance are not
  rerun for this record-only change to unchanged app source. No phone or PWA
  acceptance is claimed.
- This confirms direct upstream compatibility for one current single-highlight
  question request. It does not verify production Worker egress, installed
  iPhone calls, multi-highlight grouping, long contexts, latency under load or
  the semantic correctness of future generated questions.
- No browser preview is applicable to this prerequisite-only task. Review this
  record and the synthetic request result instead. Temporary files may disappear
  after machine cleanup; the committed evidence remains available.

## Integration Handoff

- Keep the selected endpoint for the upcoming grouping implementation. The
  grouping feature itself has not been implemented in this prerequisite task.
- The integration owner must change only the existing production
  `ARK_ENDPOINT_ID` secret to `ep-20261102000025-wt6tl` under the normal hosting
  safeguards and verify when the new value takes effect. Do not publish keys,
  use preview credentials, reset usage counters or migrate the real library.
- Before any production change, inspect the then-current project, deployment
  and operator configuration. The old endpoint in the existing private local
  file was `ep-20261031025337-vgbrw`; this is not proof of the current production
  secret, whose value was not inspected in this task.
- A production deployment ID, previous production deployment and production
  rollback are not applicable to this unpublished local check. If integration
  later changes production, record its actual outcomes separately and use its
  verified prior configuration for rollback.
- Read the existing [WeRead import contract](../WEREAD_IMPORT.md) and
  [cloud configuration safeguards](../CLOUD_SYNC.md) before integration.
- Shared interfaces changed: none. Potential later overlap: grouping changes
  will affect the WeRead AI request, source identity and import contracts and
  need coordination before implementation.
- Obtain the exact handoff commit SHA from this task branch after the record is
  committed. Do not mistake the unchanged application baseline for a newly
  deployed build.
