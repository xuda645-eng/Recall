import type { DeviceSession, TrustedDevice } from './cloud';
import {
  ApiError, CODE_LIFETIME, COOKIE_NAME, LAST_SEEN_INTERVAL, PAIR_ATTEMPTS, PAIR_WINDOW, ROTATION_GRACE,
  ROTATION_INTERVAL, constantTimeEqual, isRecord, json, randomSecret, readJson,
  setDeviceCookie, sha256, spaceId, validId,
} from './server';
import type { ServerEnv } from './server';

interface DeviceRow {
  id: string;
  space_id: string;
  label: string;
  token_hash: string;
  rotated_at: number;
  last_seen_at: number;
}

export interface AuthenticatedDevice {
  session: DeviceSession;
  rotatedToken?: string;
}

export async function authenticate(request: Request, env: ServerEnv): Promise<AuthenticatedDevice> {
  const cookies = (request.headers.get('Cookie') ?? '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(`${COOKIE_NAME}=`));
  if (cookies.length !== 1) throw new ApiError(401, 'Unauthorized');
  const token = cookies[0].slice(COOKIE_NAME.length + 1);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'Unauthorized');
  const hash = await sha256(token);
  const now = Date.now();
  const row = await env.DB.prepare(`SELECT id, space_id, label, token_hash, rotated_at, last_seen_at FROM trusted_devices
    WHERE space_id = ? AND revoked_at IS NULL AND
      (token_hash = ? OR (previous_token_hash = ? AND previous_token_until > ?))`)
    .bind(spaceId(env), hash, hash, now).first<DeviceRow>();
  if (!row) throw new ApiError(401, 'Unauthorized');
  const authenticated: AuthenticatedDevice = {
    session: { spaceId: row.space_id, device: { id: row.id, label: row.label } },
  };
  if (row.token_hash === hash && row.rotated_at <= now - ROTATION_INTERVAL) {
    const nextToken = randomSecret();
    const rotation = await env.DB.prepare(`UPDATE trusted_devices SET
      previous_token_hash = token_hash, previous_token_until = ?, token_hash = ?,
      rotated_at = ?, last_seen_at = CASE WHEN last_seen_at <= ? THEN ? ELSE last_seen_at END
      WHERE id = ? AND space_id = ? AND token_hash = ? AND rotated_at = ? AND revoked_at IS NULL`)
      .bind(now + ROTATION_GRACE, await sha256(nextToken), now, now - LAST_SEEN_INTERVAL, now, row.id, row.space_id, hash, row.rotated_at).run();
    if (rotation.meta.changes === 1) authenticated.rotatedToken = nextToken;
  } else if (row.last_seen_at <= now - LAST_SEEN_INTERVAL) {
    await env.DB.prepare(`UPDATE trusted_devices SET last_seen_at = ?
      WHERE id = ? AND space_id = ? AND revoked_at IS NULL AND last_seen_at <= ?`)
      .bind(now, row.id, row.space_id, now - LAST_SEEN_INTERVAL).run();
  }
  const active = await env.DB.prepare('SELECT id FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL')
    .bind(row.id, row.space_id).first();
  if (!active) throw new ApiError(401, 'Unauthorized');
  return authenticated;
}

async function limitPairing(request: Request, env: ServerEnv, now: number): Promise<void> {
  const ipHash = await sha256(`recall-pair:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`);
  const statements = [
    env.DB.prepare('DELETE FROM pair_rate_limits WHERE space_id = ? AND window_start <= ?')
      .bind(spaceId(env), now - PAIR_WINDOW),
    env.DB.prepare(`INSERT INTO pair_rate_limits (space_id, ip_hash, window_start, attempts) VALUES (?, ?, ?, 1)
      ON CONFLICT (space_id, ip_hash) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ?
      RETURNING attempts`).bind(spaceId(env), ipHash, now, PAIR_ATTEMPTS),
  ];
  const results = await env.DB.batch<{ attempts: number }>(statements);
  if ((results[1].results[0]?.attempts ?? PAIR_ATTEMPTS + 1) > PAIR_ATTEMPTS) {
    throw new ApiError(429, 'Too many requests');
  }
}

export async function pair(request: Request, env: ServerEnv): Promise<Response> {
  const bootstrap = env.RECALL_BOOTSTRAP_CODE;
  if (!bootstrap || !/^[\x21-\x7e]{32,256}$/.test(bootstrap)) throw new ApiError(503, 'Service unavailable');
  const now = Date.now();
  await limitPairing(request, env, now);
  const input = await readJson(request, 4096);
  if (!isRecord(input) || Object.keys(input).some(key => !['code', 'label'].includes(key))
    || typeof input.code !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(input.code)
    || typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 80
    || Array.from(input.label).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new ApiError(400, 'Invalid request');
  }
  const id = crypto.randomUUID();
  const token = randomSecret();
  const hash = await sha256(token);
  const codeHash = await sha256(input.code);
  const ownerCode = constantTimeEqual(codeHash, await sha256(bootstrap));
  const space = spaceId(env);
  const label = input.label.trim();
  if (ownerCode) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO spaces (id) VALUES (?) ON CONFLICT (id) DO NOTHING').bind(space),
      env.DB.prepare(`INSERT INTO trusted_devices
        (id, space_id, label, token_hash, rotated_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, space, label, hash, now, now, now),
    ]);
  } else {
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE pairing_codes SET used_at = ?, used_by = ?
        WHERE code_hash = ? AND space_id = ? AND used_at IS NULL AND expires_at > ?
        AND EXISTS (SELECT 1 FROM trusted_devices WHERE id = pairing_codes.issued_by
          AND space_id = pairing_codes.space_id AND revoked_at IS NULL)`)
        .bind(now, id, codeHash, space, now),
      env.DB.prepare(`INSERT INTO trusted_devices
        (id, space_id, label, token_hash, rotated_at, created_at, last_seen_at)
        SELECT ?, ?, ?, ?, ?, ?, ? FROM pairing_codes
        WHERE code_hash = ? AND space_id = ? AND used_by = ? AND used_at = ?`)
        .bind(id, space, label, hash, now, now, now, codeHash, space, id, now),
    ]);
    if (results[1].meta.changes !== 1) throw new ApiError(401, 'Unauthorized');
  }
  const session: DeviceSession = { spaceId: space, device: { id, label } };
  const response = json(session);
  setDeviceCookie(response, token);
  return response;
}

export async function issueCode(env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const code = randomSecret();
  const expiresAt = Date.now() + CODE_LIFETIME;
  const result = await env.DB.prepare(`INSERT INTO pairing_codes (code_hash, space_id, issued_by, expires_at)
    SELECT ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM trusted_devices WHERE id = ? AND space_id = ? AND revoked_at IS NULL)`)
    .bind(await sha256(code), auth.session.spaceId, auth.session.device.id, expiresAt, auth.session.device.id, auth.session.spaceId).run();
  if (result.meta.changes !== 1) throw new ApiError(401, 'Unauthorized');
  return json({ code, expiresAt });
}

export async function listDevices(env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const result = await env.DB.prepare(`SELECT id, label, created_at AS createdAt, last_seen_at AS lastSeenAt,
    revoked_at AS revokedAt FROM trusted_devices WHERE space_id = ?
    AND EXISTS (SELECT 1 FROM trusted_devices AS caller WHERE caller.id = ? AND caller.space_id = ? AND caller.revoked_at IS NULL)
    ORDER BY created_at, id`)
    .bind(auth.session.spaceId, auth.session.device.id, auth.session.spaceId).all<TrustedDevice>();
  if (result.results.length === 0) throw new ApiError(401, 'Unauthorized');
  return json({ devices: result.results });
}

export async function revokeDevice(env: ServerEnv, auth: AuthenticatedDevice, id: string): Promise<Response> {
  if (!validId(id)) throw new ApiError(404, 'Not found');
  const result = await env.DB.prepare(`UPDATE trusted_devices SET revoked_at = COALESCE(revoked_at, ?),
    previous_token_hash = NULL, previous_token_until = NULL WHERE id = ? AND space_id = ?
    AND EXISTS (SELECT 1 FROM trusted_devices AS caller WHERE caller.id = ? AND caller.space_id = ? AND caller.revoked_at IS NULL)`)
    .bind(Date.now(), id, auth.session.spaceId, auth.session.device.id, auth.session.spaceId).run();
  if (result.meta.changes !== 1) throw new ApiError(404, 'Not found');
  const response = json({ ok: true });
  if (id === auth.session.device.id) setDeviceCookie(response, null);
  return response;
}

export async function logout(env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  return revokeDevice(env, auth, auth.session.device.id);
}
