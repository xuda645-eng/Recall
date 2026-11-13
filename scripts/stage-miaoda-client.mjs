import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, copyFile, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? join(source, '../Recall-miaoda-migration'));
async function rejectSymlinks(root, file) {
  const parts = relative(root, file).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of ['', ...parts]) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlinks are not allowed in client staging paths');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
await rejectSymlinks(target, join(target, '.spark/meta.json'));
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== 'app_17hv4js1tsy') throw new Error('Not the authorized migration test app');
const input = join(source, 'dist-miaoda-client');
const output = join(target, 'client/public/recall');
const manifestPath = join(output, 'source-manifest.json');
await rejectSymlinks(source, input);
await rejectSymlinks(target, manifestPath);
let previous = [];
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in client artifacts');
    if (entry.isDirectory()) result.push(...await files(file));
    else if (entry.isFile()) result.push(relative(input, file));
  }
  return result;
}
const entries = (await files(input)).sort();
for (const file of ['recall-pwa.js', 'recall-pwa.css', 'miaoda-client.html', 'manifest.webmanifest', 'sw.js']) {
  if (!entries.includes(file)) throw new Error(`Missing client artifact: ${file}`);
}
for (const file of entries) {
  if (file === 'source-manifest.json' || !/\.(?:js|css|html|svg|png|woff2?|ttf|webmanifest|json)$/.test(file)) {
    throw new Error('Unexpected client artifact');
  }
  await rejectSymlinks(target, join(output, file));
  try {
    const bytes = await readFile(join(output, file));
    const record = previous.find(entry => entry.file === file);
    if (!record || record.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
      throw new Error(`Unreviewed staged client changes: ${file}`);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const manifest = previous.filter(entry => !entries.includes(entry.file));
for (const file of entries) {
  await mkdir(dirname(join(output, file)), { recursive: true });
  await copyFile(join(input, file), join(output, file));
  manifest.push({ file, sha256: createHash('sha256').update(await readFile(join(output, file))).digest('hex') });
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Staged ${manifest.length} local client artifacts; no cloud release or data import`);
