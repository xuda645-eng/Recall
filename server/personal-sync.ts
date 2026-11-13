import { canonical, entityKey } from '../shared/cloud';
import { ApiError, isRecord, sha256 } from '../shared/server';
import { assembleState, validateEntity, validateMutation } from '../shared/server-validation';
import { mediaRefs, MEDIA_ID, MAX_IMAGE_BYTES, MAX_MEDIA_BYTES, validateMedia } from '../shared/media';
import type { PersonalDocument, PersonalEntity, PersonalMedia, PersonalObjectFiles, PersonalRepository, PersonalRow, PersonalState } from '../shared/personal-sync';

export class PersonalSyncError extends Error {
  constructor(readonly status: number, message: string, readonly revision?: number) { super(message); }
}

const maximumRevision = 2147483647;
const maximumDocumentBytes = 16 * 1024 * 1024;

function document(row: PersonalRow | null): PersonalDocument {
  if (!row) return { entities: [], receipts: [] };
  try {
    if (!Number.isInteger(row.revision) || row.revision < 0 || row.revision > maximumRevision) throw new Error();
    const value: unknown = JSON.parse(row.stateJson);
    if (!isRecord(value) || Object.keys(value).some(key => !['entities', 'receipts', 'media', 'mediaKey'].includes(key))
      || !Array.isArray(value.entities) || !Array.isArray(value.receipts)) throw new Error();
    if (value.media !== undefined && !Array.isArray(value.media)) throw new Error();
    if (value.mediaKey !== undefined && (typeof value.mediaKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value.mediaKey))) throw new Error();
    const mediaIds = new Set<string>();
    let mediaBytes = 0;
    for (const asset of (value.media ?? []) as unknown[]) {
      if (!isRecord(asset) || Object.keys(asset).sort().join(',') !== 'id,mime,size,status'
        || typeof asset.id !== 'string' || !MEDIA_ID.test(asset.id) || mediaIds.has(asset.id)
        || !Number.isInteger(asset.size) || Number(asset.size) <= 0 || Number(asset.size) > MAX_IMAGE_BYTES
        || !['pending', 'ready'].includes(String(asset.status))
        || asset.mime !== (asset.id.endsWith('.jpg') ? 'image/jpeg' : asset.id.endsWith('.png') ? 'image/png' : 'image/webp')) throw new Error();
      mediaIds.add(asset.id);
      mediaBytes += Number(asset.size) + 29;
    }
    if (mediaIds.size && !value.mediaKey || mediaBytes > MAX_MEDIA_BYTES) throw new Error();
    const keys = new Set<string>();
    for (const entity of value.entities) {
      if (!isRecord(entity) || Object.keys(entity).sort().join(',') !== 'id,kind,revision,value'
        || !Number.isInteger(entity.revision) || Number(entity.revision) < 1 || Number(entity.revision) > row.revision) throw new Error();
      const candidate = entity as unknown as PersonalEntity;
      validateEntity(candidate);
      const key = entityKey(candidate);
      if (keys.has(key)) throw new Error();
      keys.add(key);
    }
    const receipts = new Set<string>();
    for (const receipt of value.receipts) {
      if (!isRecord(receipt) || Object.keys(receipt).sort().join(',') !== 'hash,id,revision'
        || typeof receipt.id !== 'string' || !receipt.id || receipts.has(receipt.id)
        || typeof receipt.hash !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.hash)
        || !Number.isInteger(receipt.revision) || Number(receipt.revision) < 1 || Number(receipt.revision) > row.revision) throw new Error();
      receipts.add(receipt.id);
    }
    if (receipts.size !== row.revision) throw new Error();
    return value as unknown as PersonalDocument;
  } catch { throw new PersonalSyncError(503, 'Stored synchronization state is invalid; local data is unchanged'); }
}

function requireOwner(ownerId: string, libraryKey: string): void {
  if (!/^\d{1,64}$/.test(ownerId) || !/^[a-zA-Z0-9-]{1,96}$/.test(libraryKey)) {
    throw new PersonalSyncError(401, 'Authentication required');
  }
}

export class PersonalSyncEngine {
  constructor(private readonly repository: PersonalRepository) {}

  async read(ownerId: string, libraryKey: string, since = 0): Promise<PersonalState> {
    requireOwner(ownerId, libraryKey);
    if (!Number.isInteger(since) || since < 0 || since > maximumRevision) throw new PersonalSyncError(400, 'Invalid revision');
    const row = await this.repository.read(ownerId, libraryKey);
    const value = document(row);
    const revision = row?.revision ?? 0;
    if (since > revision) throw new PersonalSyncError(409, 'Conflict', revision);
    return { revision, entities: value.entities.filter(entity => entity.revision > since) };
  }

  async mutate(ownerId: string, libraryKey: string, input: unknown): Promise<{ revision: number }> {
    requireOwner(ownerId, libraryKey);
    try {
      const mutation = validateMutation(input);
      if (mutation.baseRevision >= maximumRevision) throw new PersonalSyncError(413, 'Revision capacity reached');
      const hash = await sha256(canonical(mutation));
      const row = await this.repository.read(ownerId, libraryKey);
      const previous = document(row);
      const receipt = previous.receipts.find(candidate => candidate.id === mutation.id);
      if (receipt) {
        if (receipt.hash !== hash) throw new PersonalSyncError(409, 'Mutation ID was reused with different data', receipt.revision);
        return { revision: receipt.revision };
      }
      if ((row?.revision ?? 0) !== mutation.baseRevision) throw new PersonalSyncError(409, 'Conflict', row?.revision ?? 0);
      const revision = mutation.baseRevision + 1;
      const entities = assembleState(previous.entities, mutation);
      const cards = entities.filter(entity => entity.kind === 'card' && isRecord(entity.value)).map(entity => entity.value as Record<string, unknown>);
      const references = mediaRefs(cards.flatMap(card => [card.front, card.back, card.hint].filter((value): value is string => typeof value === 'string')));
      if (cards.some(card => card.cardType === 'image-occlusion') || references.some(id => !previous.media?.some(asset => asset.id === id && asset.status === 'ready'))) {
        throw new PersonalSyncError(422, 'Source images are not ready; no entities or receipts were committed');
      }
      const next: PersonalDocument = { ...previous, entities, receipts: [...previous.receipts, { id: mutation.id, hash, revision }] };
      const stateJson = JSON.stringify(next);
      if (new TextEncoder().encode(stateJson).byteLength > maximumDocumentBytes) {
        throw new PersonalSyncError(413, 'Library capacity reached; no data or replay receipts were removed');
      }
      if (!await this.repository.compareSwap(ownerId, libraryKey, mutation.baseRevision, { revision, stateJson })) {
        const latestRow = await this.repository.read(ownerId, libraryKey);
        const committed = document(latestRow).receipts.find(candidate => candidate.id === mutation.id);
        if (committed?.hash === hash) return { revision: committed.revision };
        throw new PersonalSyncError(409, 'Conflict', latestRow?.revision ?? 0);
      }
      return { revision };
    } catch (error) {
      if (error instanceof ApiError) throw new PersonalSyncError(error.status, error.message, error.revision);
      throw error;
    }
  }

  async media(ownerId: string, libraryKey: string, id: string): Promise<{ asset: PersonalMedia; key: string }> {
    requireOwner(ownerId, libraryKey);
    if (!MEDIA_ID.test(id)) throw new PersonalSyncError(400, 'Invalid image identifier');
    const current = document(await this.repository.read(ownerId, libraryKey));
    const asset = current.media?.find(candidate => candidate.id === id);
    if (!asset || !current.mediaKey) throw new PersonalSyncError(404, 'Image is not uploaded');
    return { asset, key: current.mediaKey };
  }

  async transitionMedia(ownerId: string, libraryKey: string, asset: PersonalMedia): Promise<{ asset: PersonalMedia; key: string }> {
    requireOwner(ownerId, libraryKey);
    if (!MEDIA_ID.test(asset.id) || !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > MAX_IMAGE_BYTES
      || asset.mime !== (asset.id.endsWith('.jpg') ? 'image/jpeg' : asset.id.endsWith('.png') ? 'image/png' : 'image/webp')
      || !['pending', 'ready'].includes(asset.status)) throw new PersonalSyncError(400, 'Invalid image metadata');
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.repository.read(ownerId, libraryKey);
      const current = document(row);
      const previous = current.media?.find(candidate => candidate.id === asset.id);
      if (previous && (previous.mime !== asset.mime || previous.size !== asset.size)) throw new PersonalSyncError(409, 'Image identifier metadata conflict');
      if (asset.status === 'ready' && !previous) throw new PersonalSyncError(409, 'Image reservation is missing');
      if (previous && (previous.status === 'ready' || previous.status === asset.status)) return { asset: previous, key: current.mediaKey! };
      const media = [...(current.media ?? []).filter(candidate => candidate.id !== asset.id), asset];
      if (media.reduce((total, candidate) => total + candidate.size + 29, 0) > MAX_MEDIA_BYTES) throw new PersonalSyncError(413, 'Image quota reached; local images are retained');
      const revision = (row?.revision ?? 0) + 1;
      if (revision > maximumRevision) throw new PersonalSyncError(413, 'Revision capacity reached');
      const key = current.mediaKey ?? btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      const id = `@media:${asset.id}:${asset.status}`;
      const next: PersonalDocument = { ...current, media, mediaKey: key,
        receipts: [...current.receipts, { id, hash: await sha256(canonical(asset)), revision }] };
      const stateJson = JSON.stringify(next);
      if (new TextEncoder().encode(stateJson).byteLength > maximumDocumentBytes) throw new PersonalSyncError(413, 'Library capacity reached');
      if (await this.repository.compareSwap(ownerId, libraryKey, row?.revision ?? 0, { revision, stateJson })) return { asset, key };
    }
    throw new PersonalSyncError(409, 'Concurrent synchronization; retry with local images retained');
  }
}

export class PersonalMediaEngine {
  constructor(private readonly sync: PersonalSyncEngine, private readonly files: PersonalObjectFiles) {}

  private async path(ownerId: string, libraryKey: string, id: string): Promise<string> {
    return `recall-encrypted/${await sha256(`${ownerId}:${libraryKey}`)}/${id}.bin`;
  }

  private async key(encoded: string): Promise<CryptoKey> {
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  private async decrypt(envelope: ArrayBuffer, encoded: string, id: string, mime: string, size: number): Promise<ArrayBuffer> {
    try {
      const bytes = new Uint8Array(envelope);
      if (bytes.length !== size + 29 || bytes[0] !== 1) throw new Error();
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(1, 13) }, await this.key(encoded), bytes.slice(13));
      await validateMedia(plaintext, id, mime);
      return plaintext;
    } catch { throw new PersonalSyncError(503, 'Stored image integrity check failed; local images are retained'); }
  }

  async put(ownerId: string, libraryKey: string, id: string, mime: string, bytes: ArrayBuffer): Promise<void> {
    requireOwner(ownerId, libraryKey);
    await validateMedia(bytes, id, mime);
    const reserved = await this.sync.transitionMedia(ownerId, libraryKey, { id, mime, size: bytes.byteLength, status: 'pending' });
    const path = await this.path(ownerId, libraryKey, id);
    let stored = await this.files.get(path);
    if (!stored) {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await this.key(reserved.key), bytes));
      const envelope = new Uint8Array(13 + ciphertext.length);
      envelope[0] = 1; envelope.set(nonce, 1); envelope.set(ciphertext, 13);
      try { await this.files.putIfAbsent(path, envelope.buffer); }
      catch (error) { if (!await this.files.get(path)) throw error; }
      stored = await this.files.get(path);
    }
    if (!stored) throw new PersonalSyncError(503, 'Encrypted image upload was not confirmed');
    await this.decrypt(stored, reserved.key, id, mime, bytes.byteLength);
    await this.sync.transitionMedia(ownerId, libraryKey, { id, mime, size: bytes.byteLength, status: 'ready' });
  }

  async get(ownerId: string, libraryKey: string, id: string, includeBytes: boolean): Promise<{ mime: string; size: number; bytes?: ArrayBuffer }> {
    const current = await this.sync.media(ownerId, libraryKey, id);
    if (current.asset.status !== 'ready') throw new PersonalSyncError(404, 'Image upload is pending');
    if (!includeBytes) return { mime: current.asset.mime, size: current.asset.size };
    const stored = await this.files.get(await this.path(ownerId, libraryKey, id));
    if (!stored) throw new PersonalSyncError(503, 'Encrypted image object is missing');
    const bytes = await this.decrypt(stored, current.key, id, current.asset.mime, current.asset.size);
    return { mime: current.asset.mime, size: current.asset.size, bytes };
  }
}
