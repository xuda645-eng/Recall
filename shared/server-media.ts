import { ApiError, json } from './server';
import type { ServerEnv } from './server';
import type { AuthenticatedDevice } from './server-auth';
import { boundedImageBody, MAX_IMAGE_BYTES, MEDIA_ID, validateMedia } from './media';

export async function serveMedia(request: Request, env: ServerEnv, auth: AuthenticatedDevice, id: string): Promise<Response> {
  if (!MEDIA_ID.test(id) || new URL(request.url).search) throw new ApiError(400, 'Invalid image ID');
  const space = auth.session.spaceId;
  const device = auth.session.device.id;
  if (request.method === 'PUT') {
    const length = request.headers.get('Content-Length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_IMAGE_BYTES)) throw new ApiError(413, 'Image too large');
    const mime = request.headers.get('Content-Type')?.split(';')[0];
    if (!mime || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new ApiError(415, 'Unsupported image type');
    let bytes: ArrayBuffer;
    try { bytes = await boundedImageBody(request.body); }
    catch { throw new ApiError(413, 'Image too large or empty'); }
    try { await validateMedia(bytes, id, mime); }
    catch { throw new ApiError(400, 'Invalid image or checksum'); }
    try {
      await env.DB.prepare(`INSERT INTO media_assets (space_id, id, mime, data, created_at)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)
        ON CONFLICT (space_id, id) DO NOTHING`).bind(space, id, mime, new Uint8Array(bytes), Date.now(), device, space).run();
    } catch (error) {
      if (String(error).includes('CHECK constraint failed')) throw new ApiError(413, 'Image storage quota reached (64 MB). Local images are retained.');
      throw error;
    }
  } else if (!['GET', 'HEAD'].includes(request.method)) throw new ApiError(405, 'Method not allowed');
  const result = await env.DB.batch([
    env.DB.prepare('SELECT id FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL').bind(device, space),
    env.DB.prepare(`SELECT mime, ${request.method === 'GET' ? 'data' : 'length(data) AS size'} FROM media_assets
      WHERE space_id = ? AND id = ? AND EXISTS (
        SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)`).bind(space, id, device, space),
  ]);
  if (!result[0].results.length) throw new ApiError(401, 'Unauthorized');
  const row = result[1].results[0] as { mime: string; data?: number[] | Uint8Array; size?: number } | undefined;
  if (!row) throw new ApiError(404, 'Image not uploaded');
  if (request.method === 'PUT') return json({ id });
  const data = row.data ? new Uint8Array(row.data).buffer : null;
  return new Response(request.method === 'HEAD' ? null : data, { headers: {
    'Content-Type': row.mime, 'Content-Length': String(data?.byteLength ?? row.size),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin',
  } });
}
