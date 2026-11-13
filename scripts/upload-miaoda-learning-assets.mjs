import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(source, '../Recall-miaoda-migration');
const appId = 'app_17hv4js1tsy';
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== appId) throw new Error('Not the authorized migration test app');
const root = join(source, 'dist-miaoda-learning');
const manifestPath = join(source, 'miaoda/learning-assets.json');
let manifest = { appId, assets: [] };
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (manifest.appId !== appId) throw new Error('Resource manifest belongs to a different app');
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Resource symlinks are not allowed');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile() && /\.(woff2|png|svg)$/.test(entry.name)) result.push(relative(root, path));
  }
  return result;
}
let uploaded = 0;
for (const file of (await files(root)).sort()) {
  const bytes = await readFile(join(root, file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (manifest.assets.some(entry => entry.file === file && entry.sha256 === sha256)) continue;
  const result = await execute('lark-cli', ['apps', '+file-upload', '--app-id', appId, '--as', 'user',
    '--file', relative(source, join(root, file))], { cwd: source, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } });
  const response = JSON.parse(result.stdout);
  if (!response.ok || !response.data?.download_url || response.data.size_bytes !== bytes.byteLength) {
    throw new Error('Platform resource upload did not return matching metadata');
  }
  const url = response.data.download_url;
  if (typeof url !== 'string' || !url.startsWith(`/spark/app/${appId}/runtime/`) || /[?#]/.test(url)) {
    throw new Error('Resource URL is not a stable application-relative download path');
  }
  manifest.assets = manifest.assets.filter(entry => entry.file !== file);
  manifest.assets.push({ file, sha256, bytes: bytes.byteLength, path: response.data.path, url });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  uploaded++;
  console.log(`Uploaded reviewed UI resource ${uploaded}: ${file}`);
}
console.log(`UI resource manifest ready: ${manifest.assets.length} entries; no card/media business upload`);
