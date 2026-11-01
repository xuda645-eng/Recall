// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mediaRefs, validateMedia, imageInfo, MAX_IMAGE_BYTES, boundedImageBody } from '../../../shared/media';
import { encodeMedia, parseMediaPackage } from '../media-package';
import { createSeedSnapshot } from '@/data/seed';
import { parseMemoryMarkdown, planMemoryImport, applyMemoryImport } from '@/lib/memory-markdown';
import { buildExportPayload } from '@/services/import-export';

const original = readFileSync(new URL('../../../e2e/fixtures/source-screenshot.png', import.meta.url));
const bytes = Uint8Array.from(original).buffer;
describe('portable screenshot attachments', () => {
  it('validates complete backup structure before saving and omits sync key material', async () => {
    const snapshot = { ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [], studySessions: [] };
    snapshot.settings.syncCode = 'synthetic-key-that-must-not-be-exported';
    const backup = buildExportPayload(snapshot);
    const value = { format: 'recall-media', version: 1, backup, images: [] };
    const parsed = await parseMediaPackage(JSON.stringify(value));
    expect(parsed.package.backup?.settings.syncCode).toBeNull();
    expect(parsed.package.backup?.settings.syncEnabled).toBe(false);
    expect(parsed.assets).toEqual([]);
    const invalid = buildExportPayload(createSeedSnapshot());
    invalid.cards[0].deckId = 'missing-deck';
    await expect(parseMediaPackage(JSON.stringify({ ...value, backup: invalid }))).rejects.toThrow('missing deck');
    await expect(parseMediaPackage(JSON.stringify({ ...value, markdown: '# Extra' }))).rejects.toThrow('格式');
  });
  it('validates image bytes and rejects type, hash, excessive size and SVG', async () => {
    const asset = await validateMedia(bytes);
    expect(asset.width).toBe(1200);
    expect(asset.height).toBe(800);
    await expect(validateMedia(bytes, 'a'.repeat(64) + '.png')).rejects.toThrow('校验');
    await expect(validateMedia(bytes, asset.id, 'image/webp')).rejects.toThrow('类型');
    await expect(validateMedia(new ArrayBuffer(MAX_IMAGE_BYTES + 1))).rejects.toThrow('512');
    expect(() => imageInfo(new TextEncoder().encode('<svg onload="alert(1)"/>').buffer)).toThrow('格式');
  });
  it('caps streamed bytes without trusting Content-Length', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES + 1)); controller.close(); } });
    await expect(boundedImageBody(stream)).rejects.toThrow('512');
  });
  it('rejects header-only PNG, WebP and JPEG without an image payload', async () => {
    for (const hexadecimal of [
      '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000049454e44ae426082',
      '524946461600000057454250565038580a00000000000000000000000000',
      'ffd8ffc0000b080001000101011100ffd9',
    ]) await expect(validateMedia(Uint8Array.from(Buffer.from(hexadecimal, 'hex')).buffer)).rejects.toThrow();
  });
  it('rejects PNG chunk corruption even if a tolerant browser decoder would accept it', async () => {
    const damaged = Buffer.from(original);
    damaged[damaged.indexOf(Buffer.from('IDAT')) + 4] ^= 1;
    await expect(validateMedia(Uint8Array.from(damaged).buffer)).rejects.toThrow('校验');
  });
  it('retains nested-alt and reference-style Markdown attachments in packages', async () => {
    const asset = await validateMedia(bytes);
    const markup = `![Source [1]](<recall://${asset.id}> "Title")\n\n![Source][figure]\n\n[figure]: recall://${asset.id}`;
    expect(mediaRefs([markup])).toEqual([asset.id]);
    const markdown = `# Sources\n<!-- recall:card {} -->\n问题：Why?\n\nEvidence\n${markup}\n<!-- recall:end -->`;
    const value = { format: 'recall-media', version: 1, markdown, images: [encodeMedia(asset)] };
    expect((await parseMediaPackage(JSON.stringify(value))).assets).toHaveLength(1);
    await expect(parseMediaPackage(JSON.stringify({ ...value, images: [] }))).rejects.toThrow('缺少');
  });
  it('deduplicates references, parses a package and reimports without changing progress', async () => {
    const asset = await validateMedia(bytes);
    const markup = `![来源截图](recall://${asset.id})`;
    const markdown = `# Screenshots\n\n<!-- recall:card {"id":"screenshot-card"} -->\n问题：What is the source?\n\nEvidence.\n\n${markup}\n<!-- recall:end -->`;
    const value = { format: 'recall-media', version: 1, markdown, images: [encodeMedia(asset)] };
    const parsed = await parseMediaPackage(JSON.stringify(value));
    expect(parsed.assets[0]).toEqual(asset);
    expect(mediaRefs([markup, markup])).toEqual([asset.id]);
    const empty = { ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [], studySessions: [] };
    const document = parseMemoryMarkdown(markdown);
    const imported = applyMemoryImport(empty, planMemoryImport(empty, document, null), new Set());
    imported.snapshot.cards[0].reps = 12;
    const repeated = applyMemoryImport(imported.snapshot, planMemoryImport(imported.snapshot, document, null), new Set());
    expect(repeated.skipped).toBe(1);
    expect(repeated.snapshot.cards[0].reps).toBe(12);
    const changed = parseMemoryMarkdown(markdown.replace('Evidence.', 'Revised evidence.'));
    const updated = applyMemoryImport(repeated.snapshot, planMemoryImport(repeated.snapshot, changed, null), new Set(['screenshot-card']));
    expect(updated.updated).toBe(1);
    expect(updated.snapshot.cards[0].reps).toBe(12);
    expect(updated.snapshot.cards[0].back).toContain(asset.id);
  });
  it('blocks missing, duplicate and unrelated attachments before imports', async () => {
    const asset = await validateMedia(bytes);
    const value = { format: 'recall-media', version: 1, markdown: `# Source\n<!-- recall:card {} -->\n问题：Why?\n\nAnswer\n![截图](recall://${asset.id})\n<!-- recall:end -->`, images: [encodeMedia(asset)] };
    await expect(parseMediaPackage(JSON.stringify({ ...value, images: [] }))).rejects.toThrow('缺少');
    await expect(parseMediaPackage(JSON.stringify({ ...value, images: [value.images[0], value.images[0]] }))).rejects.toThrow('重复');
    await expect(parseMediaPackage(JSON.stringify({ ...value, markdown: value.markdown.replace(asset.id, 'bad-id') }))).rejects.toThrow('无效');
    await expect(parseMediaPackage(JSON.stringify({ ...value, version: 2 }))).rejects.toThrow('格式');
  });
});
