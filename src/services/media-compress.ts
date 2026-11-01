import { imageInfo, MAX_IMAGE_PIXELS, validateMedia, type MediaAsset } from '../../shared/media';

export async function compressImage(file: File): Promise<MediaAsset> {
  if (file.size > 12 * 1024 * 1024) throw new Error('原图不能超过 12 MB，请先裁去无关空白');
  imageInfo(await file.arrayBuffer());
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) throw new Error('图片像素过多');
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法压缩图片');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片编码失败')), 'image/webp', 0.88));
    return await validateMedia(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
