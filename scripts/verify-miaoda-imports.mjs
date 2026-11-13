import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] ?? '/private/tmp/recall-miaoda-import-verification');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const records = [];
const migration = JSON.parse(await readFile(join(root, 'card-imports/migrations/20261105T175203+0800/manifest.json'), 'utf8'));
for (const batch of migration.batches) records.push({
  batch: batch.batch, main: `待导入/${batch.main_file}`, parent: batch.import_parent,
  files: batch.delivery_files.map(file => ({ path: `待导入/${file.name}`, sha256: file.sha256 })),
});
for (const directory of await readdir(join(root, 'card-imports/batches'), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const name = directory.name;
  try {
    const delivery = JSON.parse(await readFile(join(root, 'card-imports/batches', name, 'delivery.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(join(root, 'card-imports/batches', name, 'manifest.json'), 'utf8'));
    if (!records.some(record => record.batch === name)) records.push({ batch: name, main: delivery.main_file, parent: manifest.import_parent, files: delivery.files });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
records.sort((left, right) => left.batch.localeCompare(right.batch));
const server = await createServer({ root, configFile: false, optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': join(root, 'src') } }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const markdown = await server.ssrLoadModule('/src/lib/memory-markdown.ts');
  const media = await server.ssrLoadModule('/src/services/media-package.ts');
  const seed = await server.ssrLoadModule('/src/data/seed.ts');
  const repository = await server.ssrLoadModule('/src/services/repository.ts');
  const references = await server.ssrLoadModule('/shared/media.ts');
  const blank = () => ({ ...seed.createSeedSnapshot(), decks: [], cards: [], reviewLogs: [], studySessions: [] });
  const report = { generatedAt: new Date().toISOString(), databaseAccessed: false, physicalPhoneTested: false, files: [], selected: [], superseded: [], excluded: [] };
  const parsed = new Map();
  const declared = new Set();
  for (const record of records) for (const file of record.files) {
    declared.add(file.path);
    const bytes = await readFile(join(root, file.path));
    if (sha(bytes) !== file.sha256) throw new Error(`Delivered checksum mismatch: ${file.path}`);
    const text = bytes.toString('utf8');
    const pack = file.path.endsWith('.json') ? await media.parseMediaPackage(text) : null;
    const document = markdown.parseMemoryMarkdown(pack ? pack.package.markdown : text, '2026-11-12T00:00:00+08:00');
    if (document.entries.some(entry => entry.generated)) throw new Error(`Missing stable card identity: ${file.path}`);
    const first = markdown.applyMemoryImport(blank(), markdown.planMemoryImport(blank(), document, null), new Set());
    const review = { ...first.snapshot.cards[0], reps: 17, lapses: 2 };
    first.snapshot.cards[0] = review;
    const repeat = markdown.applyMemoryImport(first.snapshot, markdown.planMemoryImport(first.snapshot, document, null), new Set());
    if (repeat.added || repeat.updated || repeat.skipped !== document.entries.length || JSON.stringify(repeat.snapshot.cards[0]) !== JSON.stringify(review)) throw new Error(`Repeat/progress failure: ${file.path}`);
    const changed = { ...document, entries: document.entries.map((entry, index) => index ? entry : { ...entry, front: `${entry.front} [synthetic revision]` }) };
    const updated = markdown.applyMemoryImport(first.snapshot, markdown.planMemoryImport(first.snapshot, changed, null), new Set([document.entries[0].id]));
    if (updated.updated !== 1 || updated.snapshot.cards[0].reps !== 17 || updated.snapshot.cards[0].lapses !== 2 || first.snapshot.cards[0].front === updated.snapshot.cards[0].front) throw new Error(`Explicit update failure: ${file.path}`);
    parsed.set(file.path, { document, assets: pack?.assets ?? [] });
    report.files.push({ path: file.path, sha256: sha(bytes), cards: document.entries.length, images: pack?.assets.length ?? 0, first: 'passed', repeat: 'passed', explicitUpdate: 'passed', reviewPreserved: true, carriesImageBytes: !!pack });
  }
  for (const name of await readdir(join(root, '待导入'))) {
    if (/\.(md|json)$/.test(name) && name !== 'README.md' && !declared.has(`待导入/${name}`)) throw new Error(`Unmapped deliverable requires review: ${name}`);
  }
  let snapshot = blank();
  const assets = new Map();
  for (const record of records) {
    if (record.main === '待导入/车载语音架构-2026-10-31.md' || record.main === '待导入/DT-2026-11-10.recall-media.json') {
      report.superseded.push({ path: record.main, reason: 'Complete stable-ID successor selected; original retained and tested' }); continue;
    }
    const item = parsed.get(record.main);
    if (!item) throw new Error(`Missing main deliverable: ${record.main}`);
    const paths = item.document.entries.map(entry => [...(record.parent ?? []), ...entry.path]);
    if (paths.some(path => !['AI汽车', 'AI 汽车'].includes(path[0]))) throw new Error(`Outside authorized hierarchy: ${record.main}`);
    let parent = null;
    for (const name of record.parent ?? []) {
      let deck = snapshot.decks.find(candidate => candidate.name === name && (candidate.parentId ?? null) === parent);
      if (!deck) { deck = { id: `miaoda-import-${sha(Buffer.from(`${parent ?? ''}/${name}`)).slice(0, 24)}`, name, parentId: parent, description: '', color: 'slate', createdAt: item.document.batchAt, updatedAt: item.document.batchAt }; snapshot.decks.push(deck); }
      parent = deck.id;
    }
    const plan = markdown.planMemoryImport(snapshot, item.document, parent);
    if (plan.rows.some(row => row.status === 'change')) throw new Error(`Unresolved overlapping card revision: ${record.main}`);
    const result = markdown.applyMemoryImport(snapshot, plan, new Set());
    snapshot = result.snapshot;
    for (const asset of item.assets) assets.set(asset.id, asset);
    report.selected.push({ path: record.main, parent: record.parent, cards: item.document.entries.length, added: result.added, skipped: result.skipped, paths: [...new Set(paths.map(path => path.join(' / ')))] });
  }
  repository.validateImportSnapshot(snapshot);
  const refs = references.mediaRefs(snapshot.cards.flatMap(card => [card.front, card.back, card.hint]));
  if (refs.some(id => !assets.has(id))) throw new Error('Selected library is missing images');
  const images = refs.map(id => media.encodeMedia(assets.get(id)));
  const totalBytes = refs.reduce((total, id) => total + assets.get(id).bytes.byteLength, 0);
  if (totalBytes + refs.length * 29 > references.MAX_MEDIA_BYTES) throw new Error('Selected encrypted images exceed quota');
  report.summary = { cards: snapshot.cards.length, decks: snapshot.decks.length, images: refs.length, imageBytes: totalBytes, snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)), privateDataUploaded: false };
  report.excluded.push({ path: 'card-imports/batches/20261101T205717264397+0800-b27847e7', reason: 'Historical source checksum mismatch retained; migration-record verified direct delivery used instead' });
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(output, 'snapshot.json'), JSON.stringify(snapshot), { mode: 0o600 });
  await writeFile(join(output, 'images.json'), JSON.stringify(images), { mode: 0o600 });
  const imageMap = new Map(images.map(image => [image.id, image]));
  const blocks = snapshot.cards.map(card => {
    const path = [];
    let deck = snapshot.decks.find(candidate => candidate.id === card.deckId);
    while (deck) { path.unshift(deck.name); deck = snapshot.decks.find(candidate => candidate.id === deck.parentId); }
    const meta = { id: card.id, type: card.contentKind ?? 'qa', ...(card.bookTitle ? { bookTitle: card.bookTitle } : {}), ...(card.chapter ? { chapter: card.chapter } : {}) };
    return `${path.map((name, index) => `${'#'.repeat(index + 1)} ${name}`).join('\n')}\n\n<!-- recall:card ${JSON.stringify(meta)} -->\n${meta.type === 'qa' ? `问题：${card.front}\n\n` : ''}${card.back}\n<!-- recall:end -->\n`;
  });
  report.importParts = [];
  let current = [];
  const packageText = list => {
    const markdown = list.join('\n');
    return JSON.stringify({ format: 'recall-media', version: 1, markdown, images: references.mediaRefs([markdown]).map(id => imageMap.get(id)) });
  };
  const savePart = async () => {
    if (!current.length) return;
    const text = packageText(current);
    const verified = await media.parseMediaPackage(text);
    const entries = markdown.parseMemoryMarkdown(verified.package.markdown).entries;
    for (const entry of entries) {
      const original = snapshot.cards.find(card => card.id === entry.id);
      if (!original || original.front !== entry.front || original.back !== entry.back) throw new Error('Migration part changed source question/answer');
    }
    const file = `ai-car-migration-${report.importParts.length + 1}.recall-media.json`;
    await writeFile(join(output, file), text, { mode: 0o600 });
    report.importParts.push({ file, sha256: sha(Buffer.from(text)), bytes: Buffer.byteLength(text), cards: entries.length, images: verified.assets.length });
    current = [];
  };
  for (const block of blocks) {
    if (current.length && Buffer.byteLength(packageText([...current, block])) > 8 * 1024 * 1024) await savePart();
    current.push(block);
  }
  await savePart();
  if (report.importParts.reduce((total, part) => total + part.cards, 0) !== snapshot.cards.length) throw new Error('Migration part card coverage failed');
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report.summary));
  console.log(`Validated ${report.files.length} deliverables; private inventory retained in ${output}; no database/network writes`);
} finally { await server.close(); }
