import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const roots: string[] = [];
const script = resolve('scripts/stage-miaoda-runtime.mjs');

async function target(appId = 'app_17hv4js1tsy'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'recall-miaoda-stage-'));
  roots.push(directory);
  await mkdir(join(directory, '.spark'));
  await writeFile(join(directory, '.spark/meta.json'), JSON.stringify({ app_id: appId }));
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('allowlisted Miaoda runtime staging', () => {
  it('copies only the allowlisted runtime files and records exact hashes without credentials or cards', async () => {
    const directory = await target();
    await execute(process.execPath, [script, directory]);
    const manifest = JSON.parse(await readFile(join(directory, 'shared/recall/source-manifest.json'), 'utf8')) as
      { file: string; sha256: string }[];
    expect(manifest.map(entry => entry.file)).toEqual(['server/miaoda-file-storage.ts', 'shared/media.ts', 'shared/client-http.ts']);
    for (const entry of manifest) {
      const staged = await readFile(join(directory, 'shared/recall', entry.file));
      const source = await readFile(resolve(entry.file));
      expect(staged).toEqual(source);
      expect(entry.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    }
    await execute(process.execPath, [script, directory]);
  });

  it('rejects a different application before copying source', async () => {
    const directory = await target('synthetic-unapproved-app');
    await expect(execute(process.execPath, [script, directory])).rejects.toThrow('authorized Recall');
    await expect(readFile(join(directory, 'shared/recall/source-manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves unreviewed staged edits and leaves all other staged files untouched', async () => {
    const directory = await target();
    await execute(process.execPath, [script, directory]);
    const changed = join(directory, 'shared/recall/shared/media.ts');
    const other = join(directory, 'shared/recall/server/miaoda-file-storage.ts');
    const original = await readFile(other, 'utf8');
    await writeFile(changed, 'Synthetic manual edit that must be preserved');
    await expect(execute(process.execPath, [script, directory])).rejects.toThrow('unreviewed changes');
    expect(await readFile(changed, 'utf8')).toBe('Synthetic manual edit that must be preserved');
    expect(await readFile(other, 'utf8')).toBe(original);
  });
});
