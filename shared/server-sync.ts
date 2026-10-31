import { canonical } from './cloud';
import type { CloudEntity, CloudMutation, CloudState, EntityKind } from './cloud';
import { ApiError, json, readJson, sha256 } from './server';
import type { ServerEnv } from './server';
import type { AuthenticatedDevice } from './server-auth';
import { assembleState, validateMutation } from './server-validation';

interface EntityRow {
  kind: EntityKind;
  id: string;
  value_json: string;
  revision: number;
}

interface ReceiptRow {
  payload_hash: string;
  revision: number;
}

async function state(env: ServerEnv, auth: AuthenticatedDevice, since = -1): Promise<CloudState> {
  const space = auth.session.spaceId;
  const deviceId = auth.session.device.id;
  const results = await env.DB.batch<{ revision: number } | EntityRow>([
    env.DB.prepare(`SELECT revision FROM spaces WHERE id = ? AND EXISTS (
      SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)`)
      .bind(space, deviceId, space),
    env.DB.prepare(`SELECT kind, id, value_json, revision FROM cloud_entities
      WHERE space_id = ? AND revision > ? AND EXISTS (
        SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)
      ORDER BY revision, kind, id`).bind(space, since, deviceId, space),
  ]);
  const revision = results[0].results[0]?.revision;
  if (revision === undefined) throw new ApiError(401, 'Unauthorized');
  const entities: CloudEntity[] = (results[1].results as EntityRow[]).map(row => ({
    kind: row.kind, id: row.id, value: JSON.parse(row.value_json), revision: row.revision,
  }));
  return { revision, entities };
}

export async function getSync(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const since = query.get('since') ?? '0';
  if (!/^\d+$/.test(since) || !Number.isSafeInteger(Number(since)) || query.getAll('since').length > 1
    || [...query.keys()].some(key => key !== 'since')) throw new ApiError(400, 'Invalid request');
  const snapshot = await state(env, auth, Number(since));
  if (Number(since) > snapshot.revision) throw new ApiError(409, 'Conflict', snapshot.revision);
  return json(snapshot);
}

async function receipt(env: ServerEnv, auth: AuthenticatedDevice, id: string): Promise<ReceiptRow | null> {
  return env.DB.prepare(`SELECT payload_hash, revision FROM mutation_receipts WHERE space_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)`)
    .bind(auth.session.spaceId, id, auth.session.device.id, auth.session.spaceId).first<ReceiptRow>();
}

function replay(previous: ReceiptRow, hash: string): Response {
  if (previous.payload_hash !== hash) throw new ApiError(409, 'Conflict', previous.revision);
  return json({ revision: previous.revision });
}

function changeChunks(mutation: CloudMutation): string[] {
  const chunks: string[] = [];
  const encoder = new TextEncoder();
  let entries: string[] = [];
  let bytes = 2;
  for (const change of mutation.changes) {
    const entry = JSON.stringify({ kind: change.kind, id: change.id, value_json: JSON.stringify(change.value) });
    const size = encoder.encode(entry).byteLength + 1;
    if (size + 2 > 1024 * 1024) throw new ApiError(413, 'Payload too large');
    if (entries.length && bytes + size > 1024 * 1024) {
      chunks.push(`[${entries.join(',')}]`);
      entries = [];
      bytes = 2;
    }
    entries.push(entry);
    bytes += size;
  }
  if (entries.length) chunks.push(`[${entries.join(',')}]`);
  return chunks;
}

export async function postSync(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const mutation = validateMutation(await readJson(request));
  const space = auth.session.spaceId;
  const hash = await sha256(canonical(mutation));
  const previous = await receipt(env, auth, mutation.id);
  if (previous) return replay(previous, hash);
  const snapshot = await state(env, auth);
  if (snapshot.revision !== mutation.baseRevision) {
    const committed = await receipt(env, auth, mutation.id);
    if (committed) return replay(committed, hash);
    throw new ApiError(409, 'Conflict', snapshot.revision);
  }
  assembleState(snapshot.entities, mutation);
  const revision = mutation.baseRevision + 1;
  const statements = [
    env.DB.prepare(`INSERT INTO mutation_receipts
      (space_id, id, payload_hash, base_revision, revision, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(space, mutation.id, hash, mutation.baseRevision, revision, auth.session.device.id, Date.now()),
    ...changeChunks(mutation).map(chunk => env.DB.prepare(`INSERT INTO cloud_entities (space_id, kind, id, value_json, revision)
      SELECT ?, json_extract(value, '$.kind'), json_extract(value, '$.id'), json_extract(value, '$.value_json'), ?
      FROM json_each(?) WHERE 1
      ON CONFLICT (space_id, kind, id) DO UPDATE SET value_json = excluded.value_json, revision = excluded.revision`)
      .bind(space, revision, chunk)),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const committed = await receipt(env, auth, mutation.id);
    if (committed) return replay(committed, hash);
    const active = await env.DB.prepare('SELECT id FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL')
      .bind(auth.session.device.id, space).first();
    if (!active) throw new ApiError(401, 'Unauthorized');
    const current = await env.DB.prepare('SELECT revision FROM spaces WHERE id = ?').bind(space).first<{ revision: number }>();
    if (current && current.revision !== mutation.baseRevision) throw new ApiError(409, 'Conflict', current.revision);
    throw error;
  }
  return json({ revision });
}
