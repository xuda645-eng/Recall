# AGENTS.md - Recall Flashcard App

## Standing Authorization And Release Discipline (user approved 2026-10-31)

The user has pre-approved the normal delivery loop for requested Recall work. Do not ask whether to run tests, commit, push to GitHub or publish to production after completing a task.

- **Validate by default:** run relevant tests and verification proactively, starting with focused checks and broadening as appropriate. App changes require lint, unit tests, type checking, the production build and relevant iPhone 15 PWA acceptance checks. Run cloud/local D1 checks when that code changes; never run mutation tests against the owner's production library. Documentation-only work requires documentation/link and diff checks rather than unrelated app tests.
- **When checks cannot run:** try a reasonable recovery, then record the exact command, failure reason, attempted recovery and unverified scope. Do not claim a pass, silently skip a required check, or ask the user whether testing is wanted. Known regressions and critical unverified release behavior block deployment; report the blocker instead of shipping blindly.
- **Commit, push, then deploy:** once a coherent task passes applicable checks, commit only its reviewed changes, push normally to `xuda645-eng/Recall` on `main`, and deploy that exact committed production bundle to the existing `recall-memory` project. No repeated business approval is needed. Preserve unrelated dirty/staged work; do not deploy it with `--commit-dirty=true` or use force-push. Never switch the production origin or add paid resources. Documentation-only commits publish to GitHub without replacing the unchanged app deployment.
- **One record per task/release:** create `docs/releases/<timestamp>-<slug>.md` and update `docs/RELEASES.md` before committing. Include detailed changes, timezone-qualified timestamps, validation evidence, source SHA, push result, deployment ID/URLs, previous production deployment and compatible rollback steps. Append actual outcomes after publication in a documentation-only follow-up commit/push; this does not trigger another app release. Record blocked, failed and rolled-back attempts, not only successes. Do not invent missing historical evidence.
- **Verify after deployment:** check the public app, manifest/icons, Service Worker/update behavior and relevant mobile flows without mutating real user data. Distinguish browser simulation from physical iPhone verification. If this release introduces a regression and a compatible known-good deployment exists, roll back this release, verify recovery and append the incident to its record. Database/data rollback, credential changes and history rewriting are not covered.
- **Other pre-approved work:** routine reversible reads, task-scoped edits, local tests/builds, affected-file formatting and read-only Git/hosting checks need no extra confirmation. Paid infrastructure, destructive operations, disclosure of private data, security weakening and out-of-project actions still require explicit approval. Tool-enforced sandbox and authentication approvals cannot be waived by this file. A later explicit hold or narrower instruction overrides this standing authorization.

Follow `docs/RELEASES.md`, `docs/DEPLOYMENT.md` and `docs/CLOUD_SYNC.md` for release records, existing hosting and data-safety constraints. This policy authorizes delivery of requested work, not unrelated feature development or automatic import of private cards.

## Primary target: iPhone 15 PWA (user confirmed 2026-10-31)

The product direction is to refine the existing optimized PWA prototype, implement it, and deploy it. The user's primary usage is **Safari-installed home-screen PWA on iPhone 15, portrait**. Do not use the old Tauri UI or a desktop screenshot as the design baseline.

- **Validate mobile first:** use a **393 x 852 CSS-pixel viewport, device pixel ratio 3**. These are CSS dimensions, not physical screenshot dimensions. Desktop and Tauri checks follow the primary mobile checks.
- **Safe areas:** preserve `viewport-fit=cover`, all four `env(safe-area-inset-*)` values, dynamic viewport height, and sufficient space for the status bar and home indicator. Include inset stress tests (for example, 59px top and 34px bottom), but do not assume these sample values cover every iOS/browser state.
- **Shared shell:** retain the series guideline's 48 x 48 Logo, 48px-high three-slot appbar, 8px gaps, 14px control radii, and the stationary bottom-layer drawer with the same Logo and whole foreground page moving together. Check the first visible animation frame, rapid toggles, all closing paths, focus restoration, and reduced motion.
- **Mobile acceptance:** check the home page, folder hierarchy, card list, Markdown preview/import/update, long question/answer reading, rating/undo, statistics, and editing sheets. Require no page-level horizontal overflow, no fixed controls covering content, readable text, and core touch targets of at least 44 x 44 CSS pixels. Vertical reading must not accidentally rate or switch cards.
- **Secondary checks:** after the iPhone 15 baseline, check narrow widths, the 760px breakpoint, landscape, text enlargement, keyboard behavior, and desktop layout. Desktop improvements must not regress the primary PWA experience.
- **Installed PWA acceptance:** verify the real iPhone Safari home-screen launch, safe areas, app name/icon/theme, standalone behavior, offline reopening, refresh persistence, and update behavior before claiming phone/PWA acceptance. State clearly which checks are simulated, which were physically tested, and which remain unverified.
- **Design references:** the canonical PWA series guideline and Kidventure supplement remain in the parent workspace at `../prototypes/recall-v5/reference/`. The shipped implementation contract and acceptance commands are in `docs/PWA.md`. Keep prototype demo storage separate from production data; an interactive preview is not a shipped, installable PWA.

## HARD GATE: session bootstrap (do this before coding)

**Obsidian vault + Graphify exist so agents burn fewer tokens.** Soft "efficiency notes" are not enough. **Skipping this gate is a process failure.**

### Before the first tool call that explores or edits product code

1. **Read vault home**  
   `C:\Users\nnand\Documents\Obsidian\RecallFlashcard\00 Home.md`
2. **Read project map** (or Current State if you only need status)  
   `C:\Users\nnand\Documents\Obsidian\RecallFlashcard\02 Project Map.md`  
   optional: `01 Current State.md`, `SESSION_HANDOFF.md` (repo root)
3. **Route via Graphify before broad search**  
   - Binary: `graphify` (on PATH, often `~/.local/bin/graphify`)  
   - Graph data: repo `graphify-out/` and/or vault `graphify-out/`  
   - Prefer: `graphify query "<your question>"` (from repo root)  
   - Then `rg`/`grep` only on files the graph (or map) pointed at  
   - **Do not** open with multi-file parallel Read of random `src/**` when the map already names the file
4. **Only then** read source and change code
5. **After meaningful code edits** (not pure docs/typo):  
   `graphify update .` from repo root when available; keep vault copy in sync if that is part of your handoff

### Why this is mandatory

- Vault = human/project map (architecture, conventions, active work)
- Graphify = symbol/call/import graph (blast radius)
- Source still wins for truth; vault/graph **route** you so you do not re-discover the tree every session

### Explicitly forbidden

- Ignoring vault/graph because "I know the stack" or "simple task"
- Parallel-reading many large files to "orient" when Home + Project Map already orient
- Treating the Obsidian section at the bottom of this file as optional flavor text

### Playbook (full detail)

`C:\Users\nnand\Documents\Obsidian\RecallFlashcard\Agent Tooling\Obsidian and Graphify Playbook.md`

### Paths (Windows)

| What | Path |
|------|------|
| Vault | `C:\Users\nnand\Documents\Obsidian\RecallFlashcard\` |
| Repo graph | `graphify-out/` (in this repo) |
| Vault graph mirror | vault `graphify-out/` |
| Session handoff | `SESSION_HANDOFF.md` (repo root) |

If vault or `graphify` is missing on this machine: state that once, then fall back to `02 Project Map` architecture table in this file + targeted `rg`. Do not silently skip forever.

---

## Project

React + TypeScript + Vite frontend, Tauri desktop backend. FSRS spaced repetition (`ts-fsrs`). Zustand state, Dexie (browser) / Rusqlite (Tauri) persistence.

## Architecture-at-a-glance

| Concern | File |
|---|---|
| State | `src/stores/recall-store.ts` (Zustand store), slices in `src/stores/slices/` |
| Repo layer | `src/services/repository.ts` (DB abstraction, import/export/migrate) |
| DB schema | `src/db/schema.ts` |
| Crypto (E2E sync) | `src/services/crypto.ts` AES-GCM, PBKDF2 |
| FSRS scheduling | `src/services/fsrs-engine.ts` (`applyReview`, `previewIntervals`) |
| FSRS optimizer | `src/services/fsrs-optimizer.ts` |
| Import/export | `src/services/import-export.ts` `.recall` format, parse/validate/merge |
| Sync protocol | `src/services/sync-protocol.ts` encrypted upload/download to relay |
| Sync folder | `src/services/sync.ts` local folder sync |
| i18n | `src/lib/i18n.ts` (i18next, en+id), locales in `src/locales/` |
| Design tokens | `src/index.css` (CSS custom props) 3 themes: light/dark/high-contrast |

## Key patterns

- Zustand store: `dataState(get())` then destructure `{ decks, cards, settings, ... }` for persistence shape.
- Settings updates: `updateSettings(partial)` merges into existing settings. **Never pass full objects that clobber user prefs.**
- DB writes use `saveSnapshot(snapshot)` (full wipe+insert) or `saveSettings(settings, state)` (targeted). Both take the full `RecallStateSnapshot` shape for safety.
- i18n: `t("namespace.key")`. Plural keys use `_one`/`_other` (NOT legacy `_plural`).
- Tauri-only: dynamic-import Tauri modules inside try/catch. Browser fallback must not throw.
- **Security:** `syncCode` = E2E key material. Never serialize into exports. `preserveDeviceSyncSettings()` in `repository.ts` protects device creds from import override.
- **Prose:** avoid em dash (U+2014) and en dash (U+2013) in agent-written docs/README; use ASCII `-` or rewrite the sentence.

## Testing

```bash
pnpm test          # vitest (count drifts; run to verify)
npx tsc -b --noEmit # typecheck
pnpm lint          # eslint
pnpm test:e2e      # playwright (starts pnpm dev via config)
```

## Agent efficiency (after bootstrap)

- Avoid re-reading files you just edited. Edit tool confirms success from context.
- `rg -n` / `grep -n` to find exact lines before reading big files; do not Read whole 600-line files when you need 20 lines.
- Prefer 1-2 focused subagents over 4 parallel (each burns huge context).
- Big files (>500 lines without headers): read once at opening, use grep thereafter.
- Prefer vault + graphify over inventing a second architecture narrative.

## Source And Deployment

The original upstream is **Madlezz/Recall**. This workspace's user-owned fork is **xuda645-eng/Recall**. Commit and push source changes to this fork using authenticated HTTPS. Preserve the fork's history and never force-push or publish private card batches, credentials, or internal handoff documents.

**Production hosting is Cloudflare Pages, not GitHub Pages.** Reuse the existing **recall-memory** project, production branch **main**, and **https://recall-memory.pages.dev/**. GitHub is the source host, not permission to choose a different production platform. Read `docs/SELFHOST.md` and `docs/DEPLOYMENT.md` before deploying, verify the authenticated Cloudflare account and existing project, then build and test the root-path production bundle. Do not create another project, enable databases or paid bindings, or change DNS as part of a static PWA release. Keep the origin stable to preserve access to existing device-local cards. The GitHub Pages workflow is a manual-only fallback preview, not the production release path.

The user-approved 2026-10-31 device-auth/private D1 milestone is an exception to
the static-only database restriction above, not to the no-paid-infrastructure
rule. See `docs/CLOUD_SYNC.md`; use only the verified Free account, dedicated
Recall DB and production-only secret. Never seed production with test data.

## Cost / infra (HARD)

**Maintainer does not pay for hosted infra on this open-source project.**

- **Do not** deploy, renew, or operate **owner-billed** cloud services (Cloudflare paid plans, custom domain DNS that bills the maintainer, paid Workers/R2 beyond free-tier play if it risks charges, hosted DBs, paid CI minutes beyond free GitHub Actions, etc.) unless the human **explicitly** says they accept the bill.
- Default for sync: **self-host** (`sync-relay/` + user CF account) or **local folder sync** / file export. There is **no** maintainer public relay (`getDefaultRelayUrl()` is empty). Code for the worker stays in-repo; **running** it on Madlezz's dime is out of scope.
- Agents: if a task needs paid deploy, **stop**, document the checklist, mark backlog **deferred (no owner-paid infra)**, pick free work (tests, security-in-app, docs, self-host guides).
- Free-tier experiments only when the human opts in and understands limits; never assume free forever.
- Prefer features that work offline / on-device. Cloud is optional, never a paid maintainer dependency.
