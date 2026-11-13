import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? join(source, '../Recall-miaoda-migration'));
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== 'app_17hv4js1tsy') throw new Error('Not the authorized Recall migration test application');

const files = ['server/miaoda-file-storage.ts', 'shared/media.ts', 'shared/client-http.ts'];
const manifestPath = join(target, 'shared/recall/source-manifest.json');
let previous = [];
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const file of files) {
  const destination = join(target, 'shared/recall', file);
  try {
    const content = await readFile(destination);
    const hash = createHash('sha256').update(content).digest('hex');
    const record = previous.find(entry => entry.file === file);
    if (!record || record.sha256 !== hash) throw new Error(`Staged file has unreviewed changes: ${file}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const manifest = [];
for (const file of files) {
  const destination = join(target, 'shared/recall', file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(source, file), destination);
  const content = await readFile(destination);
  manifest.push({ file, sha256: createHash('sha256').update(content).digest('hex') });
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Staged ${files.length} allowlisted source files into the authorized test application`);
