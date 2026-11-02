import { boundedImageBody, MAX_IMAGE_PIXELS, MEDIA_ID, validateMedia, type MediaAsset } from '../../shared/media';

export async function decodeMedia(asset: MediaAsset): Promise<void> {
  const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) throw new Error('来源图片尺寸无效');
  } catch { throw new Error('来源图片无法解码，请重新获取清晰、完整的截图'); }
  finally { URL.revokeObjectURL(url); }
}

interface StoredMedia extends MediaAsset { uploadedSpace?: string; }
let database: Promise<IDBDatabase> | undefined;
function openMedia(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('此浏览器没有可用的图片存储，请使用 Safari 或 Chrome，且不要清理网站数据'));
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('recall-media-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('图片存储升级被其他页面阻止，请关闭旧页面后重试')); };
  });
  return database;
}

export async function localMedia(id: string): Promise<StoredMedia | undefined> {
  const db = await openMedia();
  return new Promise((resolve, reject) => {
    const request = db.transaction('images', 'readonly').objectStore('images').get(id);
    request.onsuccess = () => resolve(request.result as StoredMedia | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMedia(assets: MediaAsset[], uploadedSpace?: string): Promise<void> {
  const db = await openMedia();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('images', 'readwrite');
    const store = transaction.objectStore('images');
    for (const asset of assets) {
      const existing = store.get(asset.id);
      existing.onsuccess = () => store.put({ ...asset, uploadedSpace: uploadedSpace ?? (existing.result as StoredMedia | undefined)?.uploadedSpace });
    }
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error('图片未保存：本机空间不足或存储写入失败。原卡片不受影响，请备份后重试'));
    transaction.onerror = () => reject(transaction.error);
  });
  window.dispatchEvent(new Event('recall-media-saved'));
}

const downloads = new Map<string, Promise<MediaAsset>>();
async function fetchMedia(id: string): Promise<MediaAsset> {
  const existing = await localMedia(id);
  if (existing) return existing;
  const response = await fetch(`/api/media/${id}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? '图片需要设备授权；已下载的图片仍可离线查看' : response.status === 404 ? '来源图片尚未上传，请在原设备同步后重试' : '图片下载失败，请重试'), { status: response.status });
  const length = Number(response.headers.get('Content-Length'));
  if (length > 512 * 1024) throw new Error('云端图片过大，已停止下载');
  const asset = await validateMedia(await boundedImageBody(response.body), id, response.headers.get('Content-Type')?.split(';')[0]);
  await decodeMedia(asset);
  await saveMedia([asset]);
  return asset;
}

export function downloadMedia(id: string): Promise<MediaAsset> {
  if (!MEDIA_ID.test(id)) return Promise.reject(new Error('来源图片编号无效'));
  const pending = downloads.get(id);
  if (pending) return pending;
  const work = fetchMedia(id).finally(() => downloads.delete(id));
  downloads.set(id, work);
  return work;
}
