import { ApiError, isRecord, json, readJson, requireOrigin, setDeviceCookie } from '../../shared/server';
import type { ServerContext } from '../../shared/server';
import { authenticate, issueCode, listDevices, logout, pair, revokeDevice } from '../../shared/server-auth';
import { getSync, postSync } from '../../shared/server-sync';

export async function onRequest({ request, env }: ServerContext): Promise<Response> {
  let rotatedToken: string | undefined;
  try {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) requireOrigin(request);
    if (path === '/api/auth/pair' && method === 'POST') return await pair(request, env);
    const auth = await authenticate(request, env);
    rotatedToken = auth.rotatedToken;
    if (method !== 'GET' && path !== '/api/sync' && request.body) {
      const input = await readJson(request, 4096, true);
      if (!isRecord(input) || Object.keys(input).length !== 0) throw new ApiError(400, 'Invalid request');
    }
    let response: Response;
    if (path === '/api/auth/session' && method === 'GET') response = json(auth.session);
    else if (path === '/api/auth/codes' && method === 'POST') response = await issueCode(env, auth);
    else if (path === '/api/auth/devices' && method === 'GET') response = await listDevices(env, auth);
    else if (path.startsWith('/api/auth/devices/') && method === 'DELETE') {
      response = await revokeDevice(env, auth, path.slice('/api/auth/devices/'.length));
    } else if (path === '/api/auth/logout' && method === 'POST') response = await logout(env, auth);
    else if (path === '/api/sync' && method === 'GET') response = await getSync(request, env, auth);
    else if (path === '/api/sync' && method === 'POST') response = await postSync(request, env, auth);
    else throw new ApiError(404, 'Not found');
    if (rotatedToken && !response.headers.has('Set-Cookie')) setDeviceCookie(response, rotatedToken);
    return response;
  } catch (error) {
    const response = error instanceof ApiError
      ? json({ error: error.message, ...(error.revision === undefined ? {} : { revision: error.revision }) }, error.status)
      : json({ error: 'Service unavailable' }, 503);
    if (rotatedToken && response.status !== 401) setDeviceCookie(response, rotatedToken);
    return response;
  }
}
