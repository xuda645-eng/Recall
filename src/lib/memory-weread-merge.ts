import type { RecallStateSnapshot } from '@/types';
import { buildWereadDrafts, parseWereadExport, planWereadImport, wereadHighlightPosition, wereadSourceId, type WereadDraft, type WereadHighlight } from './memory-weread';
export { orderedWereadDrafts } from './memory-weread';

export const WEREAD_MERGED_MAX_MEMBERS = 4;
export const WEREAD_MERGED_MAX_ANSWER = 6000;

const sha256Constants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
function identityBytes(bookId: string, members: WereadHighlight[]): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([bookId, members.map(member => member.bookmarkId)]));
}
function rotateRight(value: number, count: number): number {
  return value >>> count | value << (32 - count);
}

// The synchronous import/job APIs must verify persisted IDs without trusting a cache.
function verifiedGroupId(bookId: string, members: WereadHighlight[]): string {
  const bytes = identityBytes(bookId, members), padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bytes.length * 8);
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index++) {
      const first = words[index - 15], second = words[index - 2];
      words[index] = words[index - 16] + (rotateRight(first, 7) ^ rotateRight(first, 18) ^ first >>> 3) + words[index - 7] + (rotateRight(second, 17) ^ rotateRight(second, 19) ^ second >>> 10);
    }
    let [first, second, third, fourth, fifth, sixth, seventh, eighth] = hash;
    for (let index = 0; index < 64; index++) {
      const sum = eighth + (rotateRight(fifth, 6) ^ rotateRight(fifth, 11) ^ rotateRight(fifth, 25)) + (fifth & sixth ^ ~fifth & seventh) + sha256Constants[index] + words[index];
      const other = (rotateRight(first, 2) ^ rotateRight(first, 13) ^ rotateRight(first, 22)) + (first & second ^ first & third ^ second & third);
      eighth = seventh; seventh = sixth; sixth = fifth; fifth = fourth + sum | 0;
      fourth = third; third = second; second = first; first = sum + other | 0;
    }
    for (const [index, value] of [first, second, third, fourth, fifth, sixth, seventh, eighth].entries()) hash[index] = hash[index] + value >>> 0;
  }
  return `weread-group:${hash.map(value => value.toString(16).padStart(8, '0')).join('')}`;
}

export function validateMergedWereadDraft(draft: WereadDraft, verifyIdentity = true): void {
  if (!Array.isArray(draft.members) || !draft.members.length || draft.members.length > WEREAD_MERGED_MAX_MEMBERS) throw new Error('分组须包含 1-4 条划线');
  if (!['qa', 'task', 'excerpt'].includes(draft.kind) || typeof draft.question !== 'string' || (draft.kind !== 'excerpt' && !draft.question.trim())) throw new Error('分组问题或回忆类型无效');
  const members = parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ ...draft.book, highlights: draft.members }] })).books[0].highlights;
  const head = members[0];
  if (members.length > 1) {
    let previousStart = -1;
    for (const member of members) {
      const position = wereadHighlightPosition(member);
      if (!position || !member.chapterUid?.trim() || Array.from(member.chapterUid).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('新分组缺少可靠章节或划线位置');
      if (member.chapterUid !== head.chapterUid || member.chapterIdx !== head.chapterIdx) throw new Error('分组只能包含同一书籍章节的划线');
      if (position.start <= previousStart) throw new Error('分组划线必须严格按原文位置排序且不能重复');
      previousStart = position.start;
    }
  }
  const answer = members.map(member => member.markText).join('\n\n');
  if (answer.length > WEREAD_MERGED_MAX_ANSWER) throw new Error('分组答案不能超过 6000 字');
  if (!draft.highlight || draft.highlight.markText !== answer || draft.highlight.bookmarkId !== head.bookmarkId
    || draft.highlight.chapterUid !== head.chapterUid || draft.highlight.chapterIdx !== head.chapterIdx || draft.highlight.range !== head.range
    || draft.highlight.chapterTitle !== head.chapterTitle || draft.highlight.question !== head.question
    || draft.highlight.recallKind !== head.recallKind || draft.highlight.aiSummary !== head.aiSummary) throw new Error('分组原文或首条来源不一致');
  parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ ...draft.book, highlights: [draft.highlight] }] }));
  parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ ...draft.book, highlights: [{ ...draft.highlight, question: draft.question, recallKind: draft.kind, aiSummary: draft.aiSummary }] }] }));
  if (verifyIdentity && draft.id !== (members.length === 1 ? wereadSourceId(draft.book.bookId, head.bookmarkId) : verifiedGroupId(draft.book.bookId, members))) throw new Error('分组来源编号不一致');
}

export async function buildMergedWereadDraft(snapshot: RecallStateSnapshot, book: { bookId: string; title: string; author?: string }, members: WereadHighlight[], question: string): Promise<WereadDraft> {
  if (!Array.isArray(members) || !members.length || members.length > WEREAD_MERGED_MAX_MEMBERS) throw new Error('分组须包含 1-4 条划线');
  const parsed = parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ ...book, highlights: members }] })).books[0];
  const originals = members.map(member => ({ ...member }));
  if (originals.map(member => member.markText).join('\n\n').length > WEREAD_MERGED_MAX_ANSWER) throw new Error('分组答案不能超过 6000 字');
  if (originals.length === 1) {
    const draft = buildWereadDrafts(snapshot, [{ ...parsed, highlights: originals }], [parsed.bookId])[0];
    if (!draft) throw new Error('来源属于已有分组，不能作为单卡重新导入');
    if (!draft.originalUnchanged) { draft.question = question; draft.kind = 'qa'; }
    planWereadImport(snapshot, [draft]);
    return draft;
  }
  const draft: WereadDraft = { id: '', book: { bookId: parsed.bookId, title: parsed.title, author: parsed.author }, members: originals,
    highlight: { ...originals[0], markText: originals.map(member => member.markText).join('\n\n') }, include: true, kind: 'qa', question, originalUnchanged: false };
  validateMergedWereadDraft(draft, false);
  const digest = await crypto.subtle.digest('SHA-256', identityBytes(book.bookId, originals));
  draft.id = `weread-group:${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')}`;
  const old = planWereadImport(snapshot, [draft]).rows[0].existing;
  if (old) {
    draft.existingId = old.id;
    draft.question = old.front;
    draft.kind = old.contentKind === 'excerpt' ? 'excerpt' : old.recallKind === 'task' ? 'task' : 'qa';
    draft.aiSummary = old.aiSummary;
    draft.originalUnchanged = old.back === draft.highlight.markText && JSON.stringify(old.sourceRef?.highlights) === JSON.stringify(originals.map(member => ({ bookmarkId: member.bookmarkId, markText: member.markText, chapterUid: member.chapterUid, chapterIdx: member.chapterIdx, range: member.range })));
  }
  return draft;
}
