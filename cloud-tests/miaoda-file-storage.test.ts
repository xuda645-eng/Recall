import { describe, expect, it, vi } from 'vitest';
import { imageDigest, MAX_IMAGE_BYTES } from '../shared/media';
import { MiaodaObjectStorage } from '../server/miaoda-file-storage';
import type { MiaodaFileBucket, MiaodaFileMetadata } from '../server/miaoda-file-storage';
import type { ObjectStorage } from '../server/object-media';

async function fixture() {
  const bytes = Uint8Array.from([1, 2, 3, 4]).buffer;
  const key = `recall/synthetic-space/${await imageDigest(bytes)}.png`;
  const files = new Map<string, ArrayBuffer>();
  const metadata = (path: string): MiaodaFileMetadata => ({ filePath: path,
    metadata: { contentLength: String(files.get(path)?.byteLength ?? 0), mimeType: 'image/png' } });
  const bucket: MiaodaFileBucket = {
    upload: vi.fn(async (content, options) => {
      if (files.has(options.filePath)) throw new Error('Synthetic upload conflict');
      files.set(options.filePath, content.slice(0));
      return metadata(options.filePath);
    }),
    download: vi.fn(async path => {
      const content = files.get(path);
      if (!content) throw new Error('Missing synthetic object');
      return { content: new Blob([content]) };
    }),
    getFileMetadata: vi.fn(async path => files.has(path) ? metadata(path) : null),
  };
  const from = vi.fn(() => bucket);
  const storage: ObjectStorage = new MiaodaObjectStorage({ from }, 'synthetic-private-bucket');
  return { storage, bucket, from, files, bytes, key, metadata };
}

describe('Miaoda file SDK object storage adapter', () => {
  it('uses an explicit bucket, immutable SDK upload and authenticated read-back without exposing URLs', async () => {
    const setup = await fixture();
    await setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/png');
    expect(setup.from).toHaveBeenCalledWith('synthetic-private-bucket');
    expect(setup.bucket.upload).toHaveBeenCalledWith(setup.bytes, {
      filePath: setup.key, fileName: setup.key.split('/')[2], contentType: 'image/png', upsert: false,
    });
    expect(await setup.storage.get(setup.key)).toEqual(setup.bytes);
    expect(setup.bucket.download).toHaveBeenCalledTimes(2);
  });

  it('repeated uploads do not overwrite existing content and still verify stored bytes', async () => {
    const setup = await fixture();
    await setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/png');
    await setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/png');
    expect(setup.bucket.upload).toHaveBeenCalledTimes(1);
    expect(setup.bucket.download).toHaveBeenCalledTimes(2);
  });

  it('accepts a concurrent winner only after verifying the stored content', async () => {
    const setup = await fixture();
    vi.mocked(setup.bucket.upload).mockImplementation(async () => {
      setup.files.set(setup.key, setup.bytes);
      throw new Error('Synthetic concurrent winner');
    });
    await expect(setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/png')).resolves.toBeUndefined();
    expect(setup.bucket.download).toHaveBeenCalledOnce();
  });

  it('preserves failure when no object exists after an upload error', async () => {
    const setup = await fixture();
    vi.mocked(setup.bucket.upload).mockRejectedValue(new Error('Synthetic storage unavailable'));
    await expect(setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/png')).rejects.toThrow('Synthetic storage unavailable');
    expect(setup.bucket.download).not.toHaveBeenCalled();
  });

  it('rejects transformed content before a caller can finalize the asset', async () => {
    const setup = await fixture();
    vi.mocked(setup.bucket.upload).mockImplementation(async () => {
      setup.files.set(setup.key, Uint8Array.from([4, 3, 2, 1]).buffer);
      return setup.metadata(setup.key);
    });
    await expect(setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/png')).rejects.toThrow('content hash');
    await expect(setup.storage.get(setup.key)).rejects.toThrow('content hash');
  });

  it('does not overwrite or accept an existing corrupted object', async () => {
    const setup = await fixture();
    setup.files.set(setup.key, Uint8Array.from([9]).buffer);
    await expect(setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/png')).rejects.toThrow('content hash');
    expect(setup.bucket.upload).not.toHaveBeenCalled();
  });

  it('rejects invalid paths, mismatched content/MIME and oversized bytes before SDK access', async () => {
    const setup = await fixture();
    for (const key of ['recall/../file.png', setup.key.replace('synthetic-space', '%2F'),
      setup.key.replace('synthetic-space', '%2e%2e'), `/${setup.key}`, `${setup.key}/suffix`]) {
      await expect(setup.storage.putIfAbsent(key, setup.bytes, 'image/png')).rejects.toThrow('storage key');
    }
    await expect(setup.storage.putIfAbsent(setup.key, Uint8Array.from([2]).buffer, 'image/png')).rejects.toThrow('content hash');
    await expect(setup.storage.putIfAbsent(setup.key, setup.bytes, 'image/jpeg')).rejects.toThrow('MIME');
    await expect(setup.storage.putIfAbsent(setup.key, new ArrayBuffer(MAX_IMAGE_BYTES + 1), 'image/png')).rejects.toThrow('content hash');
    expect(setup.bucket.getFileMetadata).not.toHaveBeenCalled();
    expect(setup.bucket.upload).not.toHaveBeenCalled();
  });

  it('rejects oversized downloads without reading their ArrayBuffer', async () => {
    const setup = await fixture();
    const content = new Blob([new ArrayBuffer(MAX_IMAGE_BYTES + 1)]);
    const read = vi.spyOn(content, 'arrayBuffer');
    vi.mocked(setup.bucket.download).mockResolvedValue({ content });
    await expect(setup.storage.get(setup.key)).rejects.toThrow('size limit');
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses an absent or noncanonical private bucket', () => {
    const from = vi.fn();
    for (const bucket of ['', ' ', ' bucket', 'bucket ']) {
      expect(() => new MiaodaObjectStorage({ from }, bucket)).toThrow('private bucket');
    }
    expect(from).not.toHaveBeenCalled();
  });
});
