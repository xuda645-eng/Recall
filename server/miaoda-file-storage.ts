import { imageDigest, MAX_IMAGE_BYTES, MEDIA_ID } from '../shared/media';

export interface MiaodaFileMetadata {
  filePath: string;
  metadata: { contentLength: string; mimeType: string };
}

export interface MiaodaFileBucket {
  upload(bytes: ArrayBuffer, options: {
    filePath: string;
    fileName: string;
    contentType: string;
    upsert: boolean;
  }): Promise<MiaodaFileMetadata>;
  download(path: string): PromiseLike<{ content: Blob }>;
  getFileMetadata(path: string): Promise<MiaodaFileMetadata | null>;
}

export interface MiaodaFileService {
  from(bucket: string): MiaodaFileBucket;
}

export class MiaodaObjectStorage {
  private readonly bucket: MiaodaFileBucket;

  constructor(service: MiaodaFileService, bucketId: string) {
    if (!bucketId || bucketId.trim() !== bucketId) throw new Error('A verified private bucket is required');
    this.bucket = service.from(bucketId);
  }

  private id(key: string): string {
    const parts = key.split('/');
    if (parts.length !== 3 || parts[0] !== 'recall' || !parts[1] || !MEDIA_ID.test(parts[2])) {
      throw new Error('Invalid Recall storage key');
    }
    let space: string;
    try { space = decodeURIComponent(parts[1]); }
    catch { throw new Error('Invalid Recall storage key'); }
    if (!space || space === '.' || space === '..' || space.includes('/') || space.includes('\\')
      || Array.from(space).some(character => character.charCodeAt(0) < 32)
      || encodeURIComponent(space) !== parts[1]) throw new Error('Invalid Recall storage key');
    return parts[2];
  }

  private async verify(key: string, bytes: ArrayBuffer): Promise<void> {
    const id = this.id(key);
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES
      || await imageDigest(bytes) !== id.slice(0, 64)) {
      throw new Error('Stored image bytes do not match the Recall content hash');
    }
  }

  private async read(key: string): Promise<ArrayBuffer> {
    const result = await this.bucket.download(key);
    if (result.content.size > MAX_IMAGE_BYTES) throw new Error('Stored image exceeds the Recall size limit');
    const bytes = await result.content.arrayBuffer();
    await this.verify(key, bytes);
    return bytes;
  }

  async putIfAbsent(key: string, bytes: ArrayBuffer, mime: string): Promise<void> {
    await this.verify(key, bytes);
    const extension = this.id(key).split('.')[1];
    const expectedMime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    if (mime !== expectedMime) throw new Error('Image MIME does not match the storage key');
    if (!await this.bucket.getFileMetadata(key)) {
      try {
        await this.bucket.upload(bytes, { filePath: key, fileName: this.id(key), contentType: mime, upsert: false });
      } catch (error) {
        if (!await this.bucket.getFileMetadata(key)) throw error;
      }
    }
    const stored = await this.read(key);
    if (stored.byteLength !== bytes.byteLength) throw new Error('Stored image size changed during upload');
  }

  async get(key: string): Promise<ArrayBuffer> {
    this.id(key);
    return this.read(key);
  }
}
