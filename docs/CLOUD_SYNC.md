# Personal Device Authorization And Cloud Sync

Recall's browser/PWA can use a private Cloudflare D1 library on the existing
`https://recall-memory.pages.dev/` origin. Local-only use remains available.
This is separate from the legacy encrypted relay and desktop folder sync.

## Device Authorization

Open **Settings and data > Cloud sync**. The first device uses the owner's strong
recovery code. Store that code privately, outside source control. An authorized
device can generate a one-use code for another device; it expires after 15 minutes.
All authorized devices belong to the same `personal` space, not separate libraries.

Each device receives an independent HttpOnly, Secure, SameSite=Strict cookie under
`/api`. D1 stores SHA-256 token hashes, not raw tokens. There is no server-side
annual or idle expiry. Tokens rotate after 30 days, with a two-minute race-safe
grace period. Browser cookie eviction, clearing site data, reinstalling, or using
another browser can require authorization again. An installed iPhone PWA may
have separate browser storage from a Safari tab.

The device list allows explicit revocation. Revocation blocks subsequent cloud
access, but cannot remotely erase previously downloaded offline copies. Do not
clear Safari storage to fix a synchronization issue.

## Data Safety

- Local changes are persisted before network requests. An atomic cache/journal
  write under `recall.snapshot.v1` keeps the baseline, pending mutation and cache
  together. Quota/write failure leaves the previous disk snapshot intact.
- Before first authorization, a credential-free migration backup is saved under
  `recall.snapshot.pre-cloud.v1`. Also export a `.recall` file before migration.
- A fresh device downloads the existing library. Existing local cards, stable
  identities, archived state, review history and schedules are merged rather
  than replaced with an empty cloud snapshot.
- Card/deck changes, review logs, study sessions and shared review settings use
  revisions, tombstones and stable mutation IDs. A lost response can be retried
  without duplicating the mutation. No wall-clock last-writer-wins replacement.
- Conflicting edits or incompatible folder/card changes stop automatic merging.
  Export both versions, verify the downloaded file, then explicitly choose all
  conflicting local or remote versions. The backup JSON contains `local` and
  `remote` Recall export payloads plus conflict details. It is not itself a
  directly importable `.recall` file.
- Credentials, cloud journals, theme and device-local relay settings are not
  uploaded as card data or included in Recall exports. D1 holds readable card
  content behind device authentication; this feature is not end-to-end encrypted.
- A cloud request/full state is capped at 10MiB and one mutation at 10,000
  changes. An oversized library or pending batch produces an error, not partial
  publication. Device storage can reach its own quota earlier.
- LocalStorage, migration backups and the sync baseline consume device storage.
  Keep file backups. A quota error is reported, not bypassed by deleting data.

While open, saves trigger an 800ms debounce; resuming, reconnecting and visible
60-second checks retry synchronization. iOS does not guarantee background
execution. Offline reopening still depends on successful Service Worker caching.
The UI reports pending, offline, unauthorized, conflict and error states; pairing
success alone does not prove synchronization completed.

## Free Scope

The Recall Cloudflare account was verified on 2026-10-31 in the Workers plan
dashboard as **Free / US$0 / current plan**. No plan upgrade is required.
Current official allowances:

- Workers Free: 100,000 requests/day and 10ms CPU/request. Only `/api/*` invokes
  Pages Functions; static assets are excluded from Function routing.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5GB total storage,
  at most 10 databases. Limits are account-wide and shared with other projects.
- At a D1 free limit, queries fail instead of generating paid overage. The app
  retains local data and retries later. Do not upgrade automatically.

Sources: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
Recheck the account plan and current limits before future infrastructure changes.

## Local Validation

Use Node 22+ and existing dependencies. No production test fixtures.

```bash
pnpm exec tsc -b
pnpm typecheck:cloud
pnpm test:coverage
pnpm test:cloud
pnpm exec vite build --mode production
npx --yes wrangler@4.156.0 d1 migrations apply DB --local --persist-to .wrangler/cloud-test-state
npx --yes wrangler@4.156.0 pages dev dist --port 8788 --ip 127.0.0.1 --local-protocol https --persist-to .wrangler/cloud-test-state --binding RECALL_SPACE_ID=synthetic-local-test --binding RECALL_BOOTSTRAP_CODE=synthetic-local-only-recovery-not-a-production-secret
pnpm exec playwright test --config e2e/cloud.config.ts
```

The cloud integration suite asserts the loopback URL and test space before
seeding/clearing synthetic data. It uses isolated browser contexts and real local
D1. Never run it against production. Browser simulations are not physical iPhone
acceptance. `RECALL_CHROMIUM` / `RECALL_WEBKIT` can select installed test binaries.
Fault-injection contexts disable Service Workers so routed API failures are
deterministic. The separate PWA mobile suite tests actual shell caching/offline
reopening; the cloud fault test does not independently prove precache completion.

## Deployment And Recovery

`wrangler.jsonc` has separate local, production and disabled preview bindings.
Production binds `DB` to `recall-memory-data`. Preview does not inherit the
production database or recovery secret. Keep `RECALL_SPACE_ID=personal` stable.
Do not create another Pages project, alter DNS, use another project's database,
or introduce R2/paid services.

```bash
npx --yes wrangler@4.156.0 whoami
npx --yes wrangler@4.156.0 pages project list
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 d1 migrations apply DB --env production --remote
```

Provision `RECALL_BOOTSTRAP_CODE` only as a **production encrypted secret**, using
32 random bytes encoded as 64 hexadecimal characters. Never put its value into
Wrangler config, Vite environment variables, logs, test fixtures or commits.
Wrangler supports secret input through stdin:

```bash
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages secret put RECALL_BOOTSTRAP_CODE --project-name recall-memory --env production
```

Changing the recovery secret does not revoke existing devices; revoke them
individually if compromised. If all devices are lost, the owner can set a new
secret and redeploy through their Cloudflare account. Do not reset D1.

After checks, commit/push only source changes, then deploy the root-path bundle:

```bash
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main
```

Live smoke checks must not seed, clear or update the owner's library. Verify
anonymous API rejection, asset paths and the production binding/secret types
without printing secret values. Use local D1 for authenticated mutation tests.
Keep the previous static deployment for asset rollback and D1 intact. Back up D1
through the owner's secure account before future schema changes; do not commit
database exports.
