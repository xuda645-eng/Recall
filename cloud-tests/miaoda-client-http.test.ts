import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendFetch, installBackendTransport } from '../shared/client-http';

const root = resolve(process.env.RECALL_MIAODA_TARGET ?? '../Recall-miaoda-migration');
const requireTarget = createRequire(resolve(root, 'package.json'));
const source = readFileSync(resolve(root, 'client/src/api/recall-http.ts'), 'utf8');
let cleanup: (() => void) | undefined;

function install(request: ReturnType<typeof vi.fn>): () => void {
  const exports: Record<string, unknown> = {};
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  runInNewContext(output, {
    exports, Response, Headers, ArrayBuffer, Uint8Array, TextEncoder,
    require(name: string) {
      if (name === 'axios') return requireTarget('axios');
      if (name === '@lark-apaas/client-toolkit/utils/getAxiosForBackend') return { axiosForBackend: request };
      if (name === '@shared/recall/shared/client-http') return { installBackendTransport };
      throw new Error('Unexpected runtime dependency');
    },
  });
  const installer = exports.installMiaodaBackendTransport;
  if (typeof installer !== 'function') throw new Error('Missing platform transport export');
  return installer();
}

afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

describe('actual Miaoda client transport source with a synthetic SDK boundary', () => {
  it('uses the platform request entry without adding a guessed app prefix', async () => {
    const bytes = new TextEncoder().encode('{"revision":1}').buffer;
    const request = vi.fn().mockResolvedValue({ status: 200, headers: { 'content-type': 'application/json' }, data: bytes });
    cleanup = install(request);
    const signal = new AbortController().signal;
    expect(await (await backendFetch('/api/sync?since=0', { signal, cache: 'no-store' })).json()).toEqual({ revision: 1 });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/sync?since=0', responseType: 'arraybuffer', signal,
      headers: { 'cache-control': 'no-store', pragma: 'no-cache' },
    }));
  });

  it('preserves binary subarray boundaries rather than uploading adjacent bytes', async () => {
    const request = vi.fn().mockResolvedValue({ status: 204, headers: {}, data: new ArrayBuffer(0) });
    cleanup = install(request);
    const bytes = new Uint8Array([99, 1, 2, 88]).subarray(1, 3);
    const response = await backendFetch('/api/media/synthetic', { method: 'PUT', body: bytes });
    expect(response.status).toBe(204);
    expect([...new Uint8Array(request.mock.calls[0][0].data)]).toEqual([1, 2]);
  });

  it('keeps private JSON text out of SDK JSON logs while preserving exact UTF-8 bytes', async () => {
    const body = JSON.stringify({ text: 'private synthetic \u4e2d\u6587', progress: 7 });
    const request = vi.fn().mockResolvedValue({ status: 204, headers: {}, data: new ArrayBuffer(0) });
    cleanup = install(request);
    await backendFetch('/api/recall/weread/question', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' },
    });
    const config = request.mock.calls[0][0];
    expect(new TextDecoder().decode(config.data)).toBe(body);
    expect(JSON.stringify({ request_body: config.data })).not.toContain('private synthetic');
    expect(config.headers['content-type']).toBe('application/json');
    expect(config.redact).toEqual(['headers', 'data']);
    const { AxiosError } = requireTarget('axios');
    const failure = new AxiosError('Synthetic failure', 'ERR_NETWORK', {
      ...config, headers: { 'X-Suda-Csrf-Token': 'private-synthetic-csrf' },
    });
    expect(JSON.stringify(failure)).not.toContain('private-synthetic-csrf');
  });

  it.each([401, 403, 409, 429, 503])('preserves HTTP %s responses rather than converting them to network errors', async status => {
    const bytes = new TextEncoder().encode('{"error":"Synthetic rejection"}').buffer;
    const request = vi.fn().mockRejectedValue({ isAxiosError: true, response: {
      status, headers: { 'content-type': 'application/json' }, data: bytes,
    } });
    cleanup = install(request);
    const response = await backendFetch('/api/sync');
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: 'Synthetic rejection' });
  });

  it('keeps HEAD responses bodyless even when SDK metadata contains data', async () => {
    cleanup = install(vi.fn().mockResolvedValue({ status: 200, headers: { 'content-length': '3' }, data: new Uint8Array([1, 2, 3]).buffer }));
    const response = await backendFetch('/api/media/synthetic', { method: 'HEAD' });
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(response.headers.get('content-length')).toBe('3');
  });

  it('propagates network failures without retrying an unprefixed native endpoint', async () => {
    const failure = new Error('Synthetic SDK failure');
    cleanup = install(vi.fn().mockRejectedValue(failure));
    const native = vi.fn();
    vi.stubGlobal('fetch', native);
    await expect(backendFetch('/api/sync')).rejects.toBe(failure);
    expect(native).not.toHaveBeenCalled();
  });

  it('refuses to silently send platform credentials when omission is requested', async () => {
    const request = vi.fn();
    cleanup = install(request);
    await expect(backendFetch('/api/sync', { credentials: 'omit' })).rejects.toThrow('same-origin credentials');
    expect(request).not.toHaveBeenCalled();
  });
});
