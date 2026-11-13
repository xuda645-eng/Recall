import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'recall-local-preflight-'));
  roots.push(root);
  const target = join(root, 'target');
  await mkdir(join(root, 'scripts'));
  await copyFile(resolve('scripts/start-miaoda-local.mjs'), join(root, 'scripts/start.mjs'));
  for (const path of ['.spark', 'node_modules/vite/bin', 'dist/server', 'dist/client']) {
    await mkdir(join(target, path), { recursive: true });
  }
  await symlink(resolve('../Recall-miaoda-migration/node_modules/dotenv'), join(target, 'node_modules/dotenv'));
  await writeFile(join(target, '.spark/meta.json'), JSON.stringify({ app_id: 'app_17hv4js1tsy' }));
  await writeFile(join(target, 'dist/server/main.js'), 'throw new Error("Preflight must not start the server")');
  await writeFile(join(target, 'dist/client/index.html'), '<!doctype html><title>Synthetic production client</title>');
  await writeFile(join(target, 'node_modules/vite/bin/vite.js'), 'throw new Error("Preflight must not start the client")');
  const env = { ...process.env, CLIENT_BASE_PATH: '/app/app_17hv4js1tsy', SUDA_WEBUSER: '{"synthetic":"private-marker"}' };
  const run = (productionClient = false) => execute(process.execPath,
    [join(root, 'scripts/start.mjs'), target, '--check', ...(productionClient ? ['--production-client'] : [])], { env });
  return { target, env, run };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('safe local runtime preflight', () => {
  it('checks a synthetic target without starting services or printing identity values', async () => {
    const local = await fixture();
    const result = await local.run();
    expect(result.stdout).toContain('no runtime started');
    expect(result.stdout + result.stderr).not.toContain('private-marker');
  });
  it('rejects an unapproved app before starting a service', async () => {
    const local = await fixture();
    await writeFile(join(local.target, '.spark/meta.json'), JSON.stringify({ app_id: 'synthetic-unapproved' }));
    await expect(local.run()).rejects.toThrow('authorized migration test app');
  });
  it('rejects a mismatched application base path', async () => {
    const local = await fixture();
    local.env.CLIENT_BASE_PATH = '/different-app';
    await expect(local.run()).rejects.toThrow('authorized application base path');
  });
  it('rejects malformed identity without disclosing its contents', async () => {
    const local = await fixture();
    local.env.SUDA_WEBUSER = 'synthetic-private-invalid-value';
    try { await local.run(); throw new Error('Expected preflight rejection'); }
    catch (error) {
      expect(String(error)).toContain('Platform identity environment is malformed');
      expect(String(error)).not.toContain('synthetic-private-invalid-value');
    }
  });
  it('requires a compiled server without building or upgrading it implicitly', async () => {
    const local = await fixture();
    await rm(join(local.target, 'dist/server/main.js'));
    await expect(local.run()).rejects.toMatchObject({ code: 1 });
  });
  it('checks the frozen production client without starting its CDN or exposing identity', async () => {
    const local = await fixture();
    const result = await local.run(true);
    expect(result.stdout).toContain('no runtime started');
    expect(result.stdout + result.stderr).not.toContain('private-marker');
  });
  it('refuses development HTML for production-client acceptance', async () => {
    const local = await fixture();
    await writeFile(join(local.target, 'dist/client/index.html'), '<script src="/@vite/client"></script>');
    await expect(local.run(true)).rejects.toThrow('Production HTML required');
  });
});
