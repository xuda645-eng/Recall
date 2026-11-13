import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const roots: string[] = [];
const required = ['recall-pwa.js', 'recall-pwa.css', 'miaoda-client.html', 'manifest.webmanifest', 'sw.js'];

async function fixture(appId = 'app_17hv4js1tsy') {
  const root = await mkdtemp(join(tmpdir(), 'recall-client-staging-'));
  roots.push(root);
  const target = join(root, 'target');
  const input = join(root, 'dist-miaoda-client');
  const output = join(target, 'client/public/recall');
  await mkdir(join(root, 'scripts'));
  await copyFile(resolve('scripts/stage-miaoda-client.mjs'), join(root, 'scripts/stage.mjs'));
  await mkdir(join(target, '.spark'), { recursive: true });
  await writeFile(join(target, '.spark/meta.json'), JSON.stringify({ app_id: appId }));
  await mkdir(join(input, 'assets'), { recursive: true });
  for (const file of [...required, 'assets/synthetic.woff2']) await writeFile(join(input, file), `Synthetic ${file}`);
  const run = () => execute(process.execPath, [join(root, 'scripts/stage.mjs'), target]);
  return { root, target, input, output, run };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('local PWA artifact staging', () => {
  it('copies only built files with exact hashes and allows safe repeat staging', async () => {
    const staged = await fixture();
    await staged.run();
    const manifest = JSON.parse(await readFile(join(staged.output, 'source-manifest.json'), 'utf8')) as
      { file: string; sha256: string }[];
    expect(manifest.map(entry => entry.file)).toEqual([...required, 'assets/synthetic.woff2'].sort());
    for (const entry of manifest) {
      const source = await readFile(join(staged.input, entry.file));
      expect(await readFile(join(staged.output, entry.file))).toEqual(source);
      expect(entry.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    }
    await staged.run();
  });
  it('rejects a different application without copying files', async () => {
    const staged = await fixture('synthetic-unapproved-app');
    await expect(staged.run()).rejects.toThrow('authorized migration test app');
    await expect(readFile(join(staged.output, 'recall-pwa.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects missing or unexpected artifacts before copying anything', async () => {
    const staged = await fixture();
    await rm(join(staged.input, 'sw.js'));
    await expect(staged.run()).rejects.toThrow('Missing client artifact: sw.js');
    await writeFile(join(staged.input, 'sw.js'), 'Synthetic worker');
    await writeFile(join(staged.input, '.env'), 'Synthetic forbidden configuration');
    await expect(staged.run()).rejects.toThrow('Unexpected client artifact');
    await expect(readFile(join(staged.output, 'recall-pwa.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('preserves all staged files when a manual change is found', async () => {
    const staged = await fixture();
    await staged.run();
    const original = await readFile(join(staged.output, 'recall-pwa.css'));
    await writeFile(join(staged.output, 'sw.js'), 'Synthetic manual edit');
    await writeFile(join(staged.input, 'recall-pwa.css'), 'Synthetic next build');
    await expect(staged.run()).rejects.toThrow('Unreviewed staged client changes');
    expect(await readFile(join(staged.output, 'recall-pwa.css'))).toEqual(original);
    expect(await readFile(join(staged.output, 'sw.js'), 'utf8')).toBe('Synthetic manual edit');
  });
  it('rejects symlinks in generated source artifacts', async () => {
    const staged = await fixture();
    await symlink(join(staged.input, 'sw.js'), join(staged.input, 'assets/alias.js'));
    await expect(staged.run()).rejects.toThrow('Symlinks are not allowed');
  });
  it.each(['client/public/recall', 'client/public/recall/assets'])('rejects destination symlinks at %s', async path => {
    const staged = await fixture();
    const outside = join(staged.root, 'outside');
    await mkdir(outside);
    const destination = join(staged.target, path);
    await mkdir(join(destination, '..'), { recursive: true });
    await symlink(outside, destination);
    await expect(staged.run()).rejects.toThrow('Symlinks are not allowed');
    await expect(readFile(join(outside, 'recall-pwa.js'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('retains obsolete generated files and their ownership hashes', async () => {
    const staged = await fixture();
    const obsolete = join(staged.input, 'assets/obsolete.js');
    await writeFile(obsolete, 'Synthetic previous build');
    await staged.run();
    await rm(obsolete);
    await staged.run();
    expect(await readFile(join(staged.output, 'assets/obsolete.js'), 'utf8')).toBe('Synthetic previous build');
    await writeFile(obsolete, 'Synthetic restored chunk');
    await staged.run();
    expect(await readFile(join(staged.output, 'assets/obsolete.js'), 'utf8')).toBe('Synthetic restored chunk');
  });
});
