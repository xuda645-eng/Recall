import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'recall-learning-stage-'));
  roots.push(root);
  const target = join(root, 'target');
  const input = join(root, 'dist-miaoda-learning');
  const output = join(target, 'client/public/recall-learning');
  const moduleOutput = join(target, 'client/src/recall-learning');
  await mkdir(join(root, 'scripts'));
  await copyFile(resolve('scripts/stage-miaoda-learning.mjs'), join(root, 'scripts/stage.mjs'));
  await symlink(resolve('node_modules'), join(root, 'node_modules'));
  await writeFile(join(root, 'LICENSE'), 'Synthetic application license');
  await mkdir(join(root, 'miaoda'), { recursive: true });
  const assets = { appId: 'app_17hv4js1tsy', assets: [{ file: 'assets/font.woff2', url: '/spark/app/app_17hv4js1tsy/runtime/font.woff2' }] };
  const assetPath = join(root, 'miaoda/learning-assets.json');
  await writeFile(assetPath, JSON.stringify(assets));
  await mkdir(join(target, '.spark'), { recursive: true });
  await writeFile(join(target, '.spark/meta.json'), JSON.stringify({ app_id: 'app_17hv4js1tsy' }));
  await mkdir(join(input, 'assets'), { recursive: true });
  for (const file of ['recall-pwa.js', 'pwa-viewport.js', 'version.json']) await writeFile(join(input, file), 'Synthetic text');
  await writeFile(join(input, 'recall-pwa.css'), '@font-face{font-family:Synthetic;src:url(assets/font.woff2) format("woff2"),url(assets/font.woff) format("woff"),url(assets/font.ttf) format("truetype")}');
  await writeFile(join(input, 'assets/font.woff2'), 'Synthetic binary asset');
  return { root, target, input, output, moduleOutput, assetPath, run: () => execute(process.execPath, [join(root, 'scripts/stage.mjs'), target]) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('publishable learning staging', () => {
  it('stages text only, relocates WOFF2 and excludes legacy font fallbacks', async () => {
    const staged = await fixture();
    await staged.run();
    const css = await readFile(join(staged.output, 'recall-pwa.css'), 'utf8');
    expect(css).toContain('/spark/app/app_17hv4js1tsy/runtime/font.woff2');
    expect(css).not.toContain('format("woff")');
    expect(css).not.toContain('font.ttf');
    expect((await readdir(staged.output)).every(file => /\.(js|css|json|txt)$/.test(file))).toBe(true);
    const manifest = JSON.parse(await readFile(join(staged.output, 'source-manifest.json'), 'utf8')) as { file: string; sha256: string }[];
    for (const record of manifest) {
      expect(record.sha256).toBe(createHash('sha256').update(await readFile(join(staged.output, record.file))).digest('hex'));
    }
    expect(await readFile(join(staged.moduleOutput, 'recall-pwa.js'), 'utf8')).toBe('Synthetic text');
    await expect(readFile(join(staged.output, 'recall-pwa.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    await staged.run();
  });
  it('refuses another app before staging', async () => {
    const staged = await fixture();
    await writeFile(join(staged.target, '.spark/meta.json'), JSON.stringify({ app_id: 'synthetic-unapproved' }));
    await expect(staged.run()).rejects.toThrow('authorized migration test app');
  });
  it('refuses a CSS font that has no supported uploaded resource URL', async () => {
    const staged = await fixture();
    await writeFile(staged.assetPath, JSON.stringify({ appId: 'app_17hv4js1tsy', assets: [] }));
    await expect(staged.run()).rejects.toThrow('No uploaded UI resource');
    await expect(readFile(join(staged.output, 'recall-pwa.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('preserves manual edits before any artifact is overwritten', async () => {
    const staged = await fixture();
    await staged.run();
    await writeFile(join(staged.moduleOutput, 'recall-pwa.js'), 'Synthetic manual edit');
    await expect(staged.run()).rejects.toThrow('Unreviewed staged learning changes');
    expect(await readFile(join(staged.moduleOutput, 'recall-pwa.js'), 'utf8')).toBe('Synthetic manual edit');
  });
  it('rejects destination symlinks without writing outside the app', async () => {
    const staged = await fixture();
    const outside = join(staged.root, 'outside');
    await mkdir(outside);
    await mkdir(join(staged.target, 'client/public'), { recursive: true });
    await symlink(outside, staged.output);
    await expect(staged.run()).rejects.toThrow('Destination symlinks');
    expect(await readdir(outside)).toEqual([]);
  });
  it('rejects module symlinks before overwriting public artifacts', async () => {
    const staged = await fixture();
    const outside = join(staged.root, 'outside-modules');
    await mkdir(outside);
    await mkdir(join(staged.target, 'client/src'), { recursive: true });
    await symlink(outside, staged.moduleOutput);
    await expect(staged.run()).rejects.toThrow('Destination symlinks');
    expect(await readdir(outside)).toEqual([]);
    await expect(readFile(join(staged.output, 'recall-pwa.css'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('retains legacy public modules without modifying their bytes', async () => {
    const staged = await fixture();
    await staged.run();
    await writeFile(join(staged.output, 'recall-pwa.js'), 'Synthetic legacy release');
    await staged.run();
    expect(await readFile(join(staged.output, 'recall-pwa.js'), 'utf8')).toBe('Synthetic legacy release');
  });
});
