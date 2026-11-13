import { build } from 'vite';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir, lstat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? join(source, '../Recall-miaoda-migration'));
const meta = JSON.parse(await readFile(join(target, '.spark/meta.json'), 'utf8'));
if (meta.app_id !== 'app_17hv4js1tsy') throw new Error('Not the authorized personal-sync app');
const temporary = await mkdtemp(join(tmpdir(), 'recall-personal-build-'));
await build({ configFile: false, root: source, logLevel: 'warn', build: {
  ssr: join(source, 'server/personal-sync.ts'), outDir: join(temporary, 'bundle'),
  minify: false, sourcemap: false, emptyOutDir: false,
  rollupOptions: { output: { entryFileNames: 'personal-sync.js', format: 'es', inlineDynamicImports: true } },
} });
const config = ts.readConfigFile(join(source, 'tsconfig.cloud.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, source);
const program = ts.createProgram([join(source, 'server/personal-sync.ts')], {
  ...parsed.options, noEmit: false, declaration: true, emitDeclarationOnly: true,
  rootDir: source, outDir: join(temporary, 'types'),
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => source, getCanonicalFileName: name => name, getNewLine: () => '\n',
}));
if (program.emit().emitSkipped) throw new Error('Personal-sync declarations did not emit');
const output = join(target, 'shared/recall-personal');
const entries = [
  ['server/personal-sync.js', join(temporary, 'bundle/personal-sync.js')],
  ['server/personal-sync.d.ts', join(temporary, 'types/server/personal-sync.d.ts')],
  ['shared/personal-sync.ts', join(source, 'shared/personal-sync.ts')],
];
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
      throw new Error(`Unreviewed personal-sync artifact: ${file}`);
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
console.log(`Staged ${ready.length} personal-sync core/types artifacts; no SDK/schema/env or private data`);
