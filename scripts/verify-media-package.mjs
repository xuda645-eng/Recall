import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

if (!process.argv[2]) throw new Error('Usage: node scripts/verify-media-package.mjs <package.json>');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { parseMediaPackage } = await server.ssrLoadModule('/src/services/media-package.ts');
  const { parseMemoryMarkdown, planMemoryImport, applyMemoryImport } = await server.ssrLoadModule('/src/lib/memory-markdown.ts');
  const { createSeedSnapshot } = await server.ssrLoadModule('/src/data/seed.ts');
  const parsed = await parseMediaPackage(await readFile(process.argv[2], 'utf8'));
  if (!parsed.package.markdown) throw new Error('Use an import package, not a backup');
  const document = parseMemoryMarkdown(parsed.package.markdown);
  const empty = { ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [], studySessions: [] };
  const first = applyMemoryImport(empty, planMemoryImport(empty, document, null), new Set());
  const second = applyMemoryImport(first.snapshot, planMemoryImport(first.snapshot, document, null), new Set());
  if (first.added !== document.entries.length || second.skipped !== document.entries.length || second.added || second.updated) throw new Error('Repeat import validation failed');
  console.log(JSON.stringify({ status: 'validated_in_memory_only', cards: first.added, images: parsed.assets.length, repeatedSkipped: second.skipped, attachmentBytes: parsed.assets.reduce((sum, image) => sum + image.bytes.byteLength, 0) }));
} finally { await server.close(); }
