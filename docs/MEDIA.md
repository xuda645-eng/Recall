# Source Screenshot Attachments

## Task Scope

This feature is developed on a separate task branch and is pending integration.
It covers user-provided screenshots and authorized Lark red-frame excerpts, not
WeRead book-image acquisition. It does not invoke a model for image display,
compression, upload, download or synchronization.

## Portable Format And Identity

- `recall-media`, version 1, is a JSON container with either `markdown` or a
  credential-free Recall `backup`, and a deduplicated `images` array. Each image
  contains `id`, `mime`, and `base64`. Base64 is only a portable-file encoding;
  card bodies and ordinary cloud snapshots contain references, never binaries.
- A content SHA-256 plus `.png`, `.jpg` or `.webp` identifies an immutable image.
  Markdown uses `![Source screenshot](recall://<hash>.<extension>)`. Multiple
  cards share the image. Updating images does not change stable card identity.
- Supported files are static PNG, JPEG and WebP. Limits: 512 KiB per image,
  16 million decoded pixels, 8192 per dimension, 100 images and 16 MiB per
  portable package. Legacy Tauri image names retain their previous resolver.
- Missing, duplicate, unrelated, mismatched or oversized attachments reject
  the package before card import. Previews do not save images; confirmation
  saves images first and cards second. A failed card write can leave an
  unreferenced local attachment, but never a successfully imported missing one.
- Discovery conservatively retains content-hash `recall://` tokens, including
  nested-alt Markdown and reference definitions. Literal code examples containing
  real image IDs can therefore retain an extra attachment rather than lose one.
  Server/Node checks validate bounded structure and actual image payload presence;
  browser import/download additionally decodes every new image before persistence.
- The existing Markdown parser and explicit update choice retain card progress
  and archive state. Standalone Markdown downloads carry references only.

## Capture And Reading

The task's `skills/lark-yellow-to-recall/` adds local compression before model
inspection and a separate package command after immutable batch generation.
Pillow compression uses at most 2000 pixels on the long edge, quality 88 WebP.
No automatic quality degradation beyond the byte cap: split or crop the source
when necessary, and verify small text, dates and diagrams visually. Preserve
the full red frame and context. Frame-external content is not answer evidence.
File-size reduction is not a proportional reduction in image-model tokens.

The answer renders a bounded 220px image preview. A separate full-screen dialog
supports pinch scaling, drag, zoom buttons, reset, Escape and close, with focus
return. Safe-area padding and 44px controls preserve mobile usability. Image
gestures and keyboard events do not propagate into reader scoring/navigation.
External image URLs remain blocked. Source links are user-followed Markdown
links, not automatic Lark requests or public image embeds.

The card editor offers add, replace and remove. Removal only changes a reference;
it cannot delete images used by another card. Archival retains references.

## Storage And Sync

- Browser images live in IndexedDB `recall-media-v1`, outside LocalStorage and
  the ordinary snapshot/journal. Concurrent reads share a download; object URLs
  are released when a view unmounts. Read errors show retry without blocking text.
- Text sync completes before the independent two-worker image queue. Local
  success and text success are not image-sync completion. The UI displays
  pending-image count, errors and retry. Online/resume/60-second text-sync
  checks retry the attachment queue; iOS background execution is not promised.
  Requests during an active run schedule a follow-up rescan, so newly attached
  images are not silently omitted when the earlier queue reaches zero.
- An authorized device HEAD-checks unconfirmed images, PUTs missing binaries
  once, and caches successful space-specific receipt metadata. Missing local
  images are downloaded and verified. Scores/text edits do not resend image
  bytes. Initial new-device download is bounded-concurrency, not a full-state
  JSON blob; downloaded attachments can then be read offline.
- `/api/media/<hash>.<extension>` supports authenticated GET, HEAD and PUT,
  reuses device cookies and same-origin checks, and never redirects to a public
  external URL. Responses are private/no-store/nosniff/same-origin. Stream reads
  are size-bounded without trusting Content-Length. Duplicate PUT is idempotent.
- Additive migration `20261101_recall_media.sql` uses independent BLOB rows and
  an atomic per-space counter, capped at 64 MiB. Images do not advance ordinary
  card revisions. No new cloud service, bucket, paid binding or model key.
- Existing Free D1 limits include 500 MB per database and 2 MB per BLOB/row;
  the app's limits are deliberately lower. Limits and account plan must be
  rechecked by the integrator before applying migration to the authorized DB.
  See [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
- Unreferenced attachments are conservatively retained in this first version.
  Automatic garbage collection and arbitrary cloud deletion are deferred to
  avoid destroying shared, archived or not-yet-synchronized references. Quota
  failures preserve local data and do not trigger cleanup or plan upgrades.

## Backup, Preview And Delivery

Settings exposes explicit complete image backup and merge restore. Missing
images stop export rather than producing a falsely complete backup. Group
management supports scoped backup with ancestors retained. Normal `.recall`
remains text/reference-only. Credentials and journals are excluded from backup.

The prepared HTTPS task preview uses a dedicated `_worker.js` denying every
`/api` request. Synthetic image/package files are the only demo assets. No
production D1, recovery secret, AI or real library is attached. Local D1 tests
run exclusively on loopback and a synthetic space. Production migration and
deployment belong to the integration owner, not this developer task.

The task Skill copy is versioned for integration; the globally installed Skill
is not silently replaced while production lacks the matching parser. Physical
iPhone installed-PWA acceptance remains distinct from browser simulations.
