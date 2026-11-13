export interface StoredMedia {
  mime: string;
  size: number;
  bytes?: ArrayBuffer;
}

export interface MediaRepository {
  put(space: string, device: string, id: string, mime: string, bytes: ArrayBuffer): Promise<void>;
  get(space: string, device: string, id: string, includeBytes: boolean): Promise<StoredMedia>;
}
