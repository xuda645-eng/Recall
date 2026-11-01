export const MAX_IMAGE_BYTES = 512 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
export const MEDIA_ID = /^[a-f0-9]{64}\.(png|jpg|webp)$/;
export interface MediaAsset { id: string; mime: string; bytes: ArrayBuffer; width: number; height: number; }
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function pngChecksum(data: Uint8Array, start: number, end: number): number {
  let value = 0xffffffff;
  for (let offset = start; offset < end; offset++) value = PNG_CRC_TABLE[(value ^ data[offset]) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export async function boundedImageBody(body: ReadableStream<Uint8Array> | null): Promise<ArrayBuffer> {
  if (!body) throw new Error('图片内容为空');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('单张附件不能超过 512 KB'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes.buffer;
}

export async function imageDigest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function imageInfo(bytes: ArrayBuffer): { mime: string; extension: string; width: number; height: number } {
  const data = new Uint8Array(bytes);
  const view = new DataView(bytes);
  const text = (start: number, length: number) => String.fromCharCode(...data.slice(start, start + length));
  let mime = '', extension = '', width = 0, height = 0;
  if (data.length >= 45 && data[0] === 137 && text(1, 7) === 'PNG\r\n\x1a\n' && text(12, 4) === 'IHDR' && text(data.length - 8, 4) === 'IEND') {
    if (view.getUint32(8) !== 13) throw new Error('PNG 图片头无效');
    mime = 'image/png'; extension = 'png'; width = view.getUint32(16); height = view.getUint32(20);
    let offset = 8;
    let payload = 0;
    while (offset + 12 <= data.length) {
      const length = view.getUint32(offset);
      if (offset + 12 + length > data.length || text(offset + 4, 4) === 'acTL') throw new Error('不支持损坏或动态 PNG 图片');
      if (pngChecksum(data, offset + 4, offset + 8 + length) !== view.getUint32(offset + 8 + length)) throw new Error('PNG 图片数据校验失败');
      if (text(offset + 4, 4) === 'IDAT') payload += length;
      offset += 12 + length;
    }
    if (offset !== data.length || payload <= 6 || view.getUint32(data.length - 12) !== 0) throw new Error('PNG 图片不完整');
  } else if (data.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP' && view.getUint32(4, true) + 8 === data.length) {
    mime = 'image/webp'; extension = 'webp';
    let offset = 12;
    let payload = false;
    let canvasWidth = 0, canvasHeight = 0;
    while (offset + 8 <= data.length) {
      const kind = text(offset, 4), length = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + length > data.length || ['ANIM', 'ANMF'].includes(kind)) throw new Error('不支持损坏或动态 WebP 图片');
      if (kind === 'VP8X') {
        if (length !== 10 || data[start] & 2) throw new Error('WebP 图片头无效');
        canvasWidth = 1 + data[start + 4] + (data[start + 5] << 8) + (data[start + 6] << 16);
        canvasHeight = 1 + data[start + 7] + (data[start + 8] << 8) + (data[start + 9] << 16);
      } else if (kind === 'VP8 ' && length > 10 && text(start + 3, 3) === '\x9d\x01\x2a') {
        width = view.getUint16(start + 6, true) & 16383; height = view.getUint16(start + 8, true) & 16383; payload = true;
      } else if (kind === 'VP8L' && length > 5 && data[start] === 47) {
        const bits = view.getUint32(start + 1, true);
        width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1; payload = true;
      }
      offset = start + length + (length % 2);
    }
    if (!payload || offset !== data.length || (canvasWidth && (canvasWidth !== width || canvasHeight !== height))) throw new Error('WebP 图片不完整');
  } else if (data.length >= 4 && data[0] === 255 && data[1] === 216 && data[data.length - 2] === 255 && data[data.length - 1] === 217) {
    mime = 'image/jpeg'; extension = 'jpg';
    let offset = 2;
    while (offset + 4 < data.length) {
      if (data[offset++] !== 255) break;
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 217) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > data.length) break;
      if (marker === 218) {
        if (length >= 6 && offset + length < data.length - 2) break;
        width = 0; height = 0; break;
      }
      if ([192, 193, 194].includes(marker) && length >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5);
      }
      offset += length;
    }
    if (offset >= data.length - 2 || data[offset - 1] !== 218) { width = 0; height = 0; }
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > MAX_IMAGE_PIXELS) throw new Error('图片格式或尺寸无效，仅支持静态 PNG、JPEG、WebP（最多 1600 万像素）');
  return { mime, extension, width, height };
}

export async function validateMedia(bytes: ArrayBuffer, id?: string, mime?: string): Promise<MediaAsset> {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('单张附件不能超过 512 KB，请先压缩且保持文字清晰');
  const info = imageInfo(bytes);
  const actual = `${await imageDigest(bytes)}.${info.extension}`;
  if (id !== undefined && (!MEDIA_ID.test(id) || id !== actual)) throw new Error('图片编号或校验值不匹配');
  if (mime !== undefined && mime !== info.mime) throw new Error('图片类型不匹配');
  return { id: actual, mime: info.mime, bytes, width: info.width, height: info.height };
}

export function mediaRefs(contents: string[]): string[] {
  const refs = new Set<string>();
  for (const content of contents) {
    for (const match of content.matchAll(/recall:\/\/([a-f0-9]{64}\.(?:png|jpg|webp))(?=[\s)<>"']|$)/g)) refs.add(match[1]);
  }
  return [...refs];
}
