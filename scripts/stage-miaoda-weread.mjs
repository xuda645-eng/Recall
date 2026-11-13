import { build } from 'vite';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir, lstat, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? join(source, '../Recall-miaoda-migration'));
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== 'app_17hv4js1tsy') throw new Error('Not the authorized WeRead app');
const temporary = await mkdtemp(join(tmpdir(), 'recall-weread-build-'));
await build({ configFile: false, root: source, logLevel: 'warn', build: {
  ssr: join(source, 'server/weread.ts'), outDir: join(temporary, 'bundle'),
  minify: false, sourcemap: false, emptyOutDir: false,
  rollupOptions: { output: { entryFileNames: 'weread.js', format: 'es', inlineDynamicImports: true } },
} });
const config = ts.readConfigFile(join(source, 'tsconfig.cloud.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, source);
const program = ts.createProgram([join(source, 'server/weread.ts')], {
  ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true,
  rootDir: source, outDir: join(temporary, 'types'),
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => source, getCanonicalFileName: name => name, getNewLine: () => '\n',
}));
if (program.emit().emitSkipped) throw new Error('WeRead declarations did not emit');
const entries = [['server/weread.js', join(temporary, 'bundle/weread.js')]];
entries.push(['shared/weread-api.ts', join(source, 'shared/weread-api.ts')]);
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await collect(path);
    else if (item.name.endsWith('.d.ts')) entries.push([relative(join(temporary, 'types'), path), path]);
  }
}
await collect(join(temporary, 'types'));
const output = join(target, 'shared/recall-weread');
const manifestPath = join(output, 'source-manifest.json');
let previous = [];
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
async function rejectSymlinks(path) {
  let current = target;
  for (const part of ['', ...relative(target, path).split('/')]) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Destination symlink rejected'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
await rejectSymlinks(manifestPath);
const ready = [];
for (const [file, path] of entries) {
  await rejectSymlinks(join(output, file));
  try {
    const bytes = await readFile(join(output, file));
    if (previous.find(record => record.file === file)?.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
      throw new Error(`Unreviewed WeRead artifact: ${file}`);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  ready.push({ file, bytes: await readFile(path) });
}
const manifest = [];
for (const { file, bytes } of ready) {
  await mkdir(dirname(join(output, file)), { recursive: true });
  await writeFile(join(output, file), bytes);
  manifest.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Staged ${ready.length} WeRead core/types artifacts; no SDK/schema/env or private data`);
