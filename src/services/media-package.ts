import { MAX_PACKAGE_BYTES, mediaRefs, validateMedia, type MediaAsset } from '../../shared/media';
import { parseMemoryMarkdown } from '@/lib/memory-markdown';
import { buildExportPayload, parseImportPayload } from '@/services/import-export';
import { decodeMedia, downloadMedia, saveMedia } from '@/services/media-storage';
import type { RecallStateSnapshot } from '@/types';
import { validateImportSnapshot } from '@/services/repository';

export interface MediaPackage { format: 'recall-media'; version: 1; markdown?: string; backup?: ReturnType<typeof buildExportPayload>; images: { id: string; mime: string; base64: string }[]; }
function packageRefs(contents: string[]): string[] {
  const refs = mediaRefs(contents);
  const rawRefs = contents.flatMap(content => [...content.matchAll(/recall:\/\/([^\s)<>"']+)/g)].map(match => match[1]));
  if (rawRefs.some(id => !refs.includes(id))) throw new Error('带图包含无效或旧版附件引用，请保留并单独备份原图片目录；不会生成缺图备份');
  return refs;
}
function backupContents(snapshot: Pick<RecallStateSnapshot, 'cards'>): string[] {
  if (snapshot.cards.some(card => card.cardType === 'image-occlusion')) throw new Error('完整带图备份暂不支持旧版图片遮挡卡，请保留并单独备份原图片目录；不会生成缺图备份');
  return snapshot.cards.flatMap(card => [card.front, card.back, card.hint]);
}
export function encodeMedia(asset: MediaAsset): MediaPackage['images'][number] {
  const data = new Uint8Array(asset.bytes);
  let binary = '';
  for (let offset = 0; offset < data.length; offset += 8192) binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
  return { id: asset.id, mime: asset.mime, base64: btoa(binary) };
}
export async function parseMediaPackage(text: string): Promise<{ package: MediaPackage; assets: MediaAsset[] }> {
  if (new TextEncoder().encode(text).length > MAX_PACKAGE_BYTES) throw new Error('带图包不能超过 16 MB，请拆成独立批次');
  const value: MediaPackage = JSON.parse(text);
  if (value?.format !== 'recall-media' || value.version !== 1 || !Array.isArray(value.images) || value.images.length > 100
    || (typeof value.markdown === 'string') === !!value.backup) throw new Error('带图包格式无效');
  if (value.backup) validateImportSnapshot(value.backup);
  const contents = value.markdown !== undefined ? [parseMemoryMarkdown(value.markdown).text] : backupContents(parseImportPayload(JSON.stringify(value.backup)));
  const refs = new Set(packageRefs(contents));
  const assets: MediaAsset[] = [];
  const seen = new Set<string>();
  for (const image of value.images) {
    if (!image || typeof image.base64 !== 'string' || image.base64.length > 700000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)) throw new Error('图片数据无效');
    if (seen.has(image.id) || !refs.has(image.id)) throw new Error('附件重复或没有对应卡片');
    const binary = atob(image.base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0)).buffer;
    const asset = await validateMedia(bytes, image.id, image.mime);
    if (typeof Image !== 'undefined') await decodeMedia(asset);
    assets.push(asset);
    seen.add(image.id);
  }
  if (refs.size !== seen.size) throw new Error('带图包缺少来源图片，已停止导入');
  return { package: value, assets };
}
export async function mediaBackup(snapshot: RecallStateSnapshot): Promise<string> {
  const refs = packageRefs(backupContents(snapshot));
  if (refs.length > 100) throw new Error('完整带图备份最多 100 张图片，请按卡组分批备份');
  const images = [];
  for (const id of refs) images.push(encodeMedia(await downloadMedia(id)));
  const text = JSON.stringify({ format: 'recall-media', version: 1, backup: buildExportPayload(snapshot), images } satisfies MediaPackage);
  if (new TextEncoder().encode(text).length > MAX_PACKAGE_BYTES) throw new Error('带图备份超过 16 MB，请按卡组分批备份');
  return text;
}
export async function restoreMediaBackup(text: string): Promise<ReturnType<typeof parseImportPayload>> {
  const parsed = await parseMediaPackage(text);
  if (!parsed.package.backup) throw new Error('这不是完整备份，请使用带图导入入口');
  await saveMedia(parsed.assets);
  return parseImportPayload(JSON.stringify(parsed.package.backup));
}
