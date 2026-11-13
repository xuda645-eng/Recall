import { ApiError } from '../shared/server';
import type { RecallDatabase } from '../shared/server';
import { validateMedia } from '../shared/media';
import type { MediaRepository, StoredMedia } from '../shared/server-media-repository';

export interface ObjectStorage {
  putIfAbsent(key: string, bytes: ArrayBuffer, mime: string): Promise<void>;
  get(key: string): Promise<ArrayBuffer>;
}

interface MediaRow { mime: string; size: number; storage_key: string; }

export class ObjectMediaRepository implements MediaRepository {
  constructor(private readonly database: RecallDatabase, private readonly storage: ObjectStorage) {}

  private active(space: string, device: string) {
    return this.database.prepare('SELECT id FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL').bind(device, space);
  }

  async put(space: string, device: string, id: string, mime: string, bytes: ArrayBuffer): Promise<void> {
    if (!await this.active(space, device).first()) throw new ApiError(401, 'Unauthorized');
    await validateMedia(bytes, id, mime);
    const key = `recall/${encodeURIComponent(space)}/${id}`;
    try {
      const results = await this.database.batch([
        this.database.prepare(`INSERT INTO media_assets (space_id, id, mime, size, storage_key, created_at)
          SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)
          ON CONFLICT (space_id, id) DO NOTHING`).bind(space, id, mime, bytes.byteLength, key, Date.now(), device, space),
        this.active(space, device),
      ]);
      if (!results[1].results.length) throw new ApiError(401, 'Unauthorized');
    } catch (error) {
      if (error instanceof Error && 'constraint' in error && error.constraint === 'media_usage_quota') {
        throw new ApiError(413, 'Image storage quota reached (64 MB). Local images are retained.');
      }
      throw error;
    }
    await this.storage.putIfAbsent(key, bytes, mime);
    const finalized = await this.database.prepare(`UPDATE media_assets SET status = 'ready'
      WHERE space_id = ? AND id = ? AND EXISTS (
        SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)`)
      .bind(space, id, device, space).run();
    if (finalized.meta.changes !== 1) throw new ApiError(401, 'Unauthorized');
  }

  async get(space: string, device: string, id: string, includeBytes: boolean): Promise<StoredMedia> {
    const results = await this.database.batch([
      this.active(space, device),
      this.database.prepare(`SELECT mime, size, storage_key FROM media_assets WHERE space_id = ? AND id = ? AND status = 'ready'
        AND EXISTS (SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)`).bind(space, id, device, space),
    ]);
    if (!results[0].results.length) throw new ApiError(401, 'Unauthorized');
    const row = results[1].results[0] as unknown as MediaRow | undefined;
    if (!row) throw new ApiError(404, 'Image not uploaded');
    if (!includeBytes) return { mime: row.mime, size: row.size };
    const bytes = await this.storage.get(row.storage_key);
    if (bytes.byteLength !== row.size) throw new ApiError(503, 'Service unavailable');
    try { await validateMedia(bytes, id, row.mime); }
    catch { throw new ApiError(503, 'Service unavailable'); }
    if (!await this.active(space, device).first()) throw new ApiError(401, 'Unauthorized');
    return { mime: row.mime, size: row.size, bytes };
  }
}
