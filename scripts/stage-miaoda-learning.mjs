import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? join(source, '../Recall-miaoda-migration'));
const appId = 'app_17hv4js1tsy';
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== appId) throw new Error('Not the authorized migration test app');
const root = join(source, 'dist-miaoda-learning');
const output = join(target, 'client/public/recall-learning');
const moduleOutput = join(target, 'client/src/recall-learning');
const resources = JSON.parse(await readFile(join(source, 'miaoda/learning-assets.json'), 'utf8'));
if (resources.appId !== appId) throw new Error('Resource manifest belongs to a different app');
const manifestPath = join(output, 'source-manifest.json');
let previous = [];
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
async function rejectSymlinks(file) {
  let current = target;
  for (const part of ['', ...relative(target, file).split(/[\\/]/).filter(Boolean)]) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Destination symlinks are not allowed'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Artifact symlinks are not allowed');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile() && /\.(js|css|json)$/.test(entry.name)) result.push(relative(root, path));
  }
  return result;
}
const entries = (await files(root)).sort();
for (const required of ['recall-pwa.js', 'recall-pwa.css', 'pwa-viewport.js', 'version.json']) {
  if (!entries.includes(required)) throw new Error(`Missing learning artifact: ${required}`);
}
const staged = [];
const modules = [];
for (const file of entries) {
  let text = await readFile(join(root, file), 'utf8');
  if (file.endsWith('.css')) {
    const css = postcss.parse(text);
    css.walkDecls('src', declaration => {
      if (declaration.parent?.type !== 'atrule' || declaration.parent.name !== 'font-face') return;
      const faces = declaration.value.split(',').filter(face => !/format\(["']?(woff|truetype)["']?\)/.test(face));
      declaration.value = faces.join(',');
      if (declaration.value.includes('data:')) throw new Error('Inline fonts are not allowed in a platform release');
    });
    text = css.toString().replace(/url\(([^)]+)\)/g, (match, value) => {
      const path = value.replace(/^["']|["']$/g, '').replace(/^\.\//, '');
      if (/^(data:|https?:|#)/.test(path)) return match;
      const record = resources.assets.find(entry => entry.file === path);
      if (!record) throw new Error(`No uploaded UI resource for CSS path: ${path}`);
      return `url("${record.url}")`;
    });
  }
  const destination = file.endsWith('.js') && file !== 'pwa-viewport.js' ? modules : staged;
  destination.push({ file, bytes: Buffer.from(text) });
}
staged.push({ file: 'asset-manifest.json', bytes: Buffer.from(`${JSON.stringify(resources, null, 2)}\n`) });
const licenses = ['LICENSE', 'node_modules/katex/LICENSE', 'node_modules/@fontsource-variable/inter/LICENSE',
  'node_modules/@fontsource-variable/plus-jakarta-sans/LICENSE', 'node_modules/@fontsource-variable/jetbrains-mono/LICENSE'];
const notices = [];
for (const file of licenses) notices.push(`${file}\n\n${await readFile(join(source, file), 'utf8')}`);
staged.push({ file: 'THIRD_PARTY_NOTICES.txt', bytes: Buffer.from(notices.join('\n\n')) });
const moduleManifestPath = join(moduleOutput, 'source-manifest.json');
let previousModules = [];
try { previousModules = JSON.parse(await readFile(moduleManifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const destinations = [
  { output, manifestPath, previous, entries: staged },
  { output: moduleOutput, manifestPath: moduleManifestPath, previous: previousModules, entries: modules },
];
for (const destination of destinations) {
  await rejectSymlinks(destination.manifestPath);
  for (const entry of destination.entries) {
    const path = join(destination.output, entry.file);
    await rejectSymlinks(path);
    try {
      const existing = await readFile(path);
      const record = destination.previous.find(value => value.file === entry.file);
      if (!record || record.sha256 !== createHash('sha256').update(existing).digest('hex')) {
        throw new Error(`Unreviewed staged learning changes: ${entry.file}`);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
for (const destination of destinations) {
  const manifest = destination.previous.filter(record => !destination.entries.some(entry => entry.file === record.file));
  for (const entry of destination.entries) {
    await mkdir(dirname(join(destination.output, entry.file)), { recursive: true });
    await writeFile(join(destination.output, entry.file), entry.bytes);
    manifest.push({ file: entry.file, sha256: createHash('sha256').update(entry.bytes).digest('hex') });
  }
  await writeFile(destination.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`Staged ${modules.length} compiler-managed modules and ${staged.length} public text artifacts; retained legacy files, no bundled fonts/images, worker, backend or private data`);
