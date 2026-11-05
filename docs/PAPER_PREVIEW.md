# Paper Editorial Local Preview

Status: private local-copy development guide. Production publication status is
recorded in [the V1.1 release](./releases/20261105T180104+0800-v1-1-paper-editorial.md).
The initial publication hold was later explicitly lifted by the user.

## Scope

The A / paper-editorial direction is applied to the real React PWA workspace,
not the separate style comparison mockup. The home, folder/card lists, reader,
imports, statistics, drawer and editing sheets share warm paper, olive accents,
original SVG book illustrations and serif reading typography. Existing review,
folder, import, archive and undo actions remain in place.

Mobile retains the 48px Logo, three-slot appbar, 8px gaps, 14px controls,
stationary underlying drawer, whole-foreground movement and four safe-area
insets. The shipped iPhone standalone viewport strategy is unchanged.

## Start A Private Preview

Build into a new, unused output directory. Do not rebuild the directory of a
currently running preview. The following commands use a local-only build flag
and loopback server, without the Cloudflare Worker or production credentials.
Run from the isolated worktree root. Stop an existing server before rebinding
port 4410. The updated preview serves `quality/paper-comments/build`;
the example below uses a different directory for a subsequent build.

```bash
VITE_RECALL_LOCAL_PREVIEW=1 node node_modules/vite/bin/vite.js build --outDir quality/paper-preview/build-review-next
RECALL_PAPER_BUILD_DIR=quality/paper-preview/build-review-next RECALL_PAPER_PORT=4410 node scripts/paper-preview-server.mjs
```

- Application: `http://127.0.0.1:4410/`
- Persistent 393 x 852 comparison frame: `http://127.0.0.1:4410/iphone15.html`
- Different browser profiles and ports have independent libraries.
- The comparison frame shares this local origin's library, not the online one.
- The server rejects API requests and non-read HTTP methods. Background cloud
  sync is disabled in the local-only build. The normal build is not affected.

## Load A Private Owner Copy

1. In the existing authorized production browser, export the full backup through
   Settings > Backup > backup with source images. This does not rate or edit cards.
2. Keep the file private. Never commit, upload or bundle it in the application.
3. In a fresh, empty local preview, open Settings > Local acceptance copy.
4. Choose the full `.recall-media.json` backup. Check the displayed counts and
   explicitly confirm loading the local copy.
5. The local-only loader retains card/deck IDs, duplicate questions, images,
   review logs and sessions without deduplication, and rejects a nonempty
   destination. Following the user's directory correction, the workspace then
   performs the existing one-time WeRead organization into the "微信读书" root,
   with a credential-free safety backup before persistence. Other hierarchy and
   card content/progress are retained. Previously organized groups keep later
   user moves/renames rather than being repeatedly reset.
6. Device sync keys, cloud settings, local sync/backup folders and automatic
   backup/notification behavior are disabled. Review plans/preferences are kept.
7. Export the local copy again and compare card content/history/image fields
   against the source, accounting explicitly for the requested WeRead directory
   changes. Refresh to check persistence. Never replace a copy containing newer
   user imports with an earlier backup.

The local WeRead page supports file import only and does not attempt online
connection or AI requests. The normal build retains online functionality.
See [the nine-comment correction record](./releases/20261105T173213+0800-paper-browser-comments.md).

`quality/` and `card-imports/` are ignored private directories. A local preview
can be edited and rated, but those operations affect only its copy. Automated
mutation tests must use synthetic browser contexts, not the owner copy.

## Verification

Use installed browser paths through `RECALL_CHROMIUM` and `RECALL_WEBKIT`.
On macOS, run browser commands outside the Codex Seatbelt sandbox as instructed
by [AGENTS.md](../AGENTS.md). Both configs include the launch guard and preflight.

```bash
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/vite/bin/vite.js build
node scripts/run-playwright.mjs --config=e2e/product-review.config.ts --workers=2
node scripts/run-playwright.mjs --config=e2e/paper-editorial.config.ts --workers=2
```

The second browser command requires the isolated build/server above. It checks
the paper home dock and exact local-copy loader using synthetic data. The first
checks the normal production-style bundle's full mobile product flow.

Browser checks at DPR 3 / 393 x 852, safe-area stress, narrow widths, 760/761px,
landscape, desktop, reduced motion, offline and update behavior are simulations.
The framed desktop preview does not emulate an installed iPhone PWA, physical
keyboard behavior, Safari's native status bar or device offline reopening.

See [the task record](./releases/20261105T111604+0800-paper-editorial-preview.md)
for actual results and remaining acceptance.

The user rejected the flattened article-like appearance. The current revision
restores separate rounded card surfaces/borders on home, folders, recent/list
cards, reader and statistics without changing their data or interaction logic.
See [card-shape correction](./releases/20261105T154950+0800-paper-card-shape.md).
