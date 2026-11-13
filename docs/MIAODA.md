# Miaoda Development

Recall retains its original PWA and portable server contracts. The Miaoda client
mounts the same learning workspace inside the native platform shell. Publishing
source changes here does not switch the original production origin.

## Runtime Boundaries

- Browser-local storage remains the first save destination. Optional personal
  synchronization uses platform login, account binding, aggregate version CAS
  and authenticated encrypted-media reads.
- Native WeRead routes expose fixed notebook/highlight/progress and question/
  merge operations. Credentials remain in server environment variables; selected
  text requires explicit consent before model use or local import.
- The private Base mirror is one-way. Source saves must succeed independently of
  mirror queue failures. Metadata-only events and scheduled catch-up avoid
  recording the private aggregate in trigger logs.
- Old migration probes and local offline experiments are development artifacts,
  not the production learning route. Their existence does not prove readiness or
  physical iPhone offline/update acceptance.

## Source And Resources

`src/miaoda-client/` owns the learning mount, lifecycle and layout. `server/` and
`shared/` own portable protocol engines. The separate native platform project
provides SDK adapters and generated database types.

`miaoda/learning-assets.json` contains only public UI resources, hashes and
stable application-relative paths. Staging relocates fonts to those resources;
it does not upload private card images. Do not publish private handoffs, database
readbacks, API keys, imports, screenshots or diagnostic evidence.

## Verification

```bash
pnpm lint
pnpm test
pnpm test:cloud
pnpm build
pnpm build:server
```

Portable backend tests run without a Miaoda project. Three explicit native
integration files require the initialized sibling `../Recall-miaoda-migration`
and its installed SDK dependencies:

```bash
pnpm test:miaoda-native
```

Native tests are a separate required check for Miaoda releases, not silently
skipped or reported as portable passes. Use the guarded Playwright launcher for
browser acceptance; follow `PWA.md` for device dimensions and safe areas. Desktop
Chromium/WebKit simulations do not establish installed iPhone acceptance.

## Icon Verification

The default `pnpm test` suite checks the committed SVG vectors only. It does not
read ignored PNG resources or require Python. Raster validation is a separate
required check for Miaoda icon releases, not a silently skipped portable test.

Raster generation and validation require `python3` with PyMuPDF (`fitz`) and
Pillow (`PIL`) installed. A fresh clone must generate its local ignored PNGs
before running the explicit raster suite:

```bash
python3 -m pip install PyMuPDF Pillow
python3 scripts/miaoda-icons.py
pnpm test:miaoda-icons
```

Generation uses the committed brand vectors and supersampling, not bitmap
upscaling. For retained artifacts, use the same renderer/library versions for
byte-identical checks; `python3 scripts/miaoda-icons.py --check` validates them
without rewriting files. Do not add generated PNGs to source commits or replace
uploaded resources merely to run tests.
