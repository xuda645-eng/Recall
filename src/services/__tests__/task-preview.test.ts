// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createTaskPreviewServer } from '../../../scripts/serve-task-preview.mjs';

describe('isolated task preview server', () => {
  let directory: string;
  let server: Server;
  let url: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'recall-task-preview-'));
    await writeFile(join(directory, 'index.html'), '<html><head></head><body>Preview</body></html>');
    await writeFile(join(directory, 'version.json'), JSON.stringify({ version: '1.0-20261101-0200' }));
    server = createTaskPreviewServer({ directory, demoSnapshot: { cards: [{ front: '<unsafe>' }] } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Preview did not start');
    url = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true });
  });
  it('serves build metadata uncached without changing the bundled files', async () => {
    const response = await fetch(`${url}/version.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ version: '1.0-20261101-0200' });
    expect(await readFile(join(directory, 'index.html'), 'utf8')).not.toContain('localStorage');
  });
  it('seeds synthetic data only when the isolated origin has no existing snapshot', async () => {
    const text = await (await fetch(`${url}/`)).text();
    expect(text).toContain('if(!localStorage.getItem("recall.snapshot.v1"))');
    expect(text).not.toContain('<unsafe>');
    expect(text).toContain('\\u003cunsafe>');
  });
  it.each(['GET', 'POST', 'PUT', 'DELETE'])('never proxies or mutates a cloud API through %s', async method => {
    const response = await fetch(`${url}/api/sync`, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'PREVIEW_LOCAL_ONLY' });
  });
  it('refuses file writes and missing metadata instead of returning the app HTML', async () => {
    expect((await fetch(`${url}/version.json`, { method: 'PUT', body: 'changed' })).status).toBe(405);
    expect((await fetch(`${url}/missing.json`)).status).toBe(404);
  });
  it('rejects traversal and symlinks escaping the build directory', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'recall-task-outside-'));
    try {
      await writeFile(join(outside, 'secret.txt'), 'not for preview');
      await symlink(join(outside, 'secret.txt'), join(directory, 'escape.txt'));
      expect((await fetch(`${url}/..%2fsecret.txt`)).status).toBe(403);
      expect((await fetch(`${url}/escape.txt`)).status).toBe(403);
    } finally { await rm(outside, { recursive: true }); }
  });
});
