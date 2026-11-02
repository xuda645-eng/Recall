import type { Card, Deck, RecallStateSnapshot } from '@/types';
import { newMemoryCard, validateTree } from '@/lib/memory-folders';
import { snapshotFingerprint } from '@/lib/memory-markdown';
import { normalizeName } from '@/lib/utils';
import { validateMergedWereadDraft } from './memory-weread-merge';

export const WEREAD_MAX_BYTES = 5 * 1024 * 1024;
export type WereadKind = 'qa' | 'task' | 'excerpt';
export interface WereadHighlight {
  bookmarkId: string;
  markText: string;
  chapterUid?: string;
  chapterIdx?: number;
  range?: string;
  chapterTitle?: string;
  question?: string;
  recallKind?: WereadKind;
  aiSummary?: string;
}
export interface WereadBook {
  bookId: string;
  title: string;
  author?: string;
  highlights: WereadHighlight[];
}
export interface WereadExport {
  format: 'recall-weread-export-v1';
  books: WereadBook[];
}
export interface WereadDraft {
  id: string;
  book: Pick<WereadBook, 'bookId' | 'title' | 'author'>;
  highlight: WereadHighlight;
  members?: WereadHighlight[];
  include: boolean;
  kind: WereadKind;
  question: string;
  aiSummary?: string;
  existingId?: string;
  originalUnchanged: boolean;
  protectedSource?: boolean;
}
type WereadContent = Pick<Card, 'front' | 'back' | 'contentKind' | 'recallKind' | 'bookTitle' | 'chapter' | 'source' | 'sourceRef' | 'aiSummary'>;
export interface WereadImportRow {
  draft: WereadDraft;
  status: 'new' | 'change' | 'duplicate';
  existingId?: string;
  existing?: Card;
  content: WereadContent;
  protectedSource?: boolean;
}
export interface WereadImportPlan {
  fingerprint: string;
  rows: WereadImportRow[];
}
export interface WereadImportResult {
  snapshot: RecallStateSnapshot;
  added: number;
  updated: number;
  skipped: number;
  deckIds: string[];
}

function rejectCredentials(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      const name = key.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
      if (/apikey|accesskey|secret|token|authorization|cookie|password|passwd|credential|sessionid|sessionkey|bearer|privatekey|synccode|密钥|令牌|密码|凭证/.test(name)) {
        throw new Error('文件含有凭证字段，请使用不含密钥的本地 Skill 导出文件');
      }
      if (child && typeof child === 'object') pending.push(child);
    }
  }
}
function record(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}须为对象`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) throw new Error(`${label}含有不支持的字段`);
  return result;
}
function safeText(value: unknown, max: number, label: string, nonempty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) throw new Error(`${label}为空、类型错误或内容过长`);
  const compact = Array.from(value).filter(character => character.charCodeAt(0) > 32).join('');
  if (/<\/?[a-z][^>]*(?:>|$)|<!--|<!doctype|<\?/i.test(value) || /(?:javascript|vbscript):|data:(?:text\/html|application\/(?:xhtml\+xml|javascript)|image\/svg\+xml)/i.test(compact)) {
    throw new Error(`${label}不能包含 HTML 或可执行内容`);
  }
  return value;
}
function optionalText(value: Record<string, unknown>, key: string, max: number): string | undefined {
  return Object.hasOwn(value, key) ? safeText(value[key], max, key) : undefined;
}
function sourceIdentifier(value: unknown, label: string): string {
  const id = safeText(value, 200, label, true);
  if (Array.from(id).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error(`${label}格式无效`);
  try { encodeURIComponent(id); } catch { throw new Error(`${label}格式无效`); }
  return id;
}
export function wereadHighlightPosition(highlight: Pick<WereadHighlight, 'chapterIdx' | 'range'>): { chapterIdx: number; start: number } | undefined {
  if (highlight.chapterIdx === undefined || highlight.range === undefined) return undefined;
  const match = /^(\d+)-(\d+)$/.exec(highlight.range);
  if (!Number.isSafeInteger(highlight.chapterIdx) || highlight.chapterIdx < 0 || !match || match[0] !== highlight.range) return undefined;
  const start = Number(match[1]), second = Number(match[2]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(second) ? { chapterIdx: highlight.chapterIdx, start } : undefined;
}
export function wereadSourceId(bookId: string, bookmarkId: string): string {
  return `weread:${encodeURIComponent(bookId)}:${encodeURIComponent(bookmarkId)}`;
}
function validateExport(value: unknown): WereadExport {
  rejectCredentials(value);
  const root = record(value, ['format', 'books'], '导出文件');
  if (root.format !== 'recall-weread-export-v1' || !Array.isArray(root.books) || !root.books.length || root.books.length > 200) {
    throw new Error('请选择有效的本地 Skill 导出文件，每次支持 1-200 本书');
  }
  const bookIds = new Set<string>(), sourceIds = new Set<string>();
  let count = 0;
  const books = root.books.map(value => {
    const book = record(value, ['bookId', 'title', 'author', 'highlights'], '书籍');
    const bookId = sourceIdentifier(book.bookId, '书籍编号');
    if (bookIds.has(bookId)) throw new Error('文件内存在重复书籍编号');
    bookIds.add(bookId);
    const title = normalizeName(safeText(book.title, 80, '书名', true));
    const author = optionalText(book, 'author', 200);
    if (!Array.isArray(book.highlights)) throw new Error('划线列表须为数组');
    const highlights = book.highlights.map(value => {
      if (++count > 1000) throw new Error('单次最多导入 1000 条划线，请拆分文件');
      const highlight = record(value, ['bookmarkId', 'markText', 'chapterUid', 'chapterIdx', 'range', 'chapterTitle', 'question', 'recallKind', 'aiSummary'], '划线');
      const bookmarkId = sourceIdentifier(highlight.bookmarkId, '划线编号');
      const identity = wereadSourceId(bookId, bookmarkId);
      if (sourceIds.has(identity)) throw new Error('文件内存在重复划线编号');
      sourceIds.add(identity);
      const markText = safeText(highlight.markText, 20000, '划线原文', true);
      const chapterUid = optionalText(highlight, 'chapterUid', 200);
      const chapterIdx = Object.hasOwn(highlight, 'chapterIdx') ? highlight.chapterIdx as number : undefined;
      if (Object.hasOwn(highlight, 'chapterIdx') && (!Number.isSafeInteger(chapterIdx) || chapterIdx! < 0)) throw new Error('章节位置无效');
      const range = optionalText(highlight, 'range', 200);
      if (range !== undefined && !wereadHighlightPosition({ chapterIdx: chapterIdx ?? 0, range })) throw new Error('划线位置无效');
      const chapterTitle = optionalText(highlight, 'chapterTitle', 200);
      const question = optionalText(highlight, 'question', 10000);
      const aiSummary = optionalText(highlight, 'aiSummary', 2000);
      if (Object.hasOwn(highlight, 'recallKind') && !['qa', 'task', 'excerpt'].includes(highlight.recallKind as string)) throw new Error('回忆类型仅支持 qa、task 或 excerpt');
      return { bookmarkId, markText, chapterUid, chapterIdx, range, chapterTitle, question, aiSummary, recallKind: highlight.recallKind as WereadKind | undefined };
    });
    return { bookId, title, author, highlights };
  });
  return { format: 'recall-weread-export-v1', books };
}
export function parseWereadExport(text: string): WereadExport {
  if (typeof text !== 'string') throw new Error('导出文件须为 JSON 文本');
  if (text.length > WEREAD_MAX_BYTES || new TextEncoder().encode(text).length > WEREAD_MAX_BYTES) throw new Error('文件不能超过 5 MB');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('文件不是有效 JSON'); }
  return validateExport(value);
}
function sourceCards(snapshot: RecallStateSnapshot): Map<string, Card> {
  const cards = new Map<string, Card>(), ids = new Set<string>();
  for (const card of snapshot.cards) {
    if (ids.has(card.id)) throw new Error('现有数据含有重复卡片编号');
    ids.add(card.id);
    if (card.sourceRef?.provider !== 'weread') continue;
    const source = card.sourceRef;
    sourceIdentifier(source.bookId, '书籍编号');
    sourceIdentifier(source.bookmarkId, '划线编号');
    if (source.highlights !== undefined) {
      const members = source.highlights;
      if (!Array.isArray(members) || members.length < 2 || source.bookmarkId !== members[0]?.bookmarkId || source.chapterUid !== members[0]?.chapterUid) throw new Error('现有分组来源无效');
      if (card.back !== members.map(member => member.markText).join('\n\n')) throw new Error('现有分组原文与来源不一致，请先修复后导入');
      validateMergedWereadDraft({ id: card.id, book: { bookId: source.bookId, title: card.bookTitle || 'WeRead' }, highlight: { ...members[0], markText: members.map(member => member.markText).join('\n\n') }, members, include: true, kind: 'qa', question: 'Validate source', originalUnchanged: true }, false);
    }
    for (const member of source.highlights ?? [source]) {
      sourceIdentifier(member.bookmarkId, '划线编号');
      const identity = wereadSourceId(source.bookId, member.bookmarkId);
      if (cards.has(identity)) throw new Error('现有数据中多张卡片对应同一划线，请先处理来源冲突');
      cards.set(identity, card);
    }
  }
  return cards;
}
export function isWereadHighlightImported(snapshot: RecallStateSnapshot, bookId: string, bookmarkId: string): boolean {
  return sourceCards(snapshot).has(wereadSourceId(bookId, bookmarkId));
}
export function orderedWereadDrafts(drafts: WereadDraft[]): WereadDraft[] {
  const books = new Map<string, number>();
  const chapters = new Map<string, string>(), positions = new Map<string, Set<number>>(), sources = new Set<string>();
  for (const draft of drafts) {
    if (!books.has(draft.book.bookId)) books.set(draft.book.bookId, books.size);
    const head = draft.members?.[0] ?? draft.highlight, position = wereadHighlightPosition(head);
    if (!position || !head.chapterUid?.trim()) throw new Error('缺少可靠章节或划线位置，不能排序分组');
    const chapter = JSON.stringify([draft.book.bookId, position.chapterIdx]), previousChapter = chapters.get(chapter);
    if (previousChapter !== undefined && previousChapter !== head.chapterUid) throw new Error('章节位置存在歧义');
    chapters.set(chapter, head.chapterUid);
    const previous = positions.get(chapter) ?? new Set<number>(), identity = wereadSourceId(draft.book.bookId, head.bookmarkId);
    if (sources.has(identity) || previous.has(position.start)) throw new Error('划线位置重复或存在歧义');
    sources.add(identity);
    previous.add(position.start);
    positions.set(chapter, previous);
  }
  return [...drafts].sort((first, second) => {
    const bookOrder = books.get(first.book.bookId)! - books.get(second.book.bookId)!;
    if (bookOrder) return bookOrder;
    const firstPosition = wereadHighlightPosition(first.members?.[0] ?? first.highlight), secondPosition = wereadHighlightPosition(second.members?.[0] ?? second.highlight);
    return firstPosition!.chapterIdx - secondPosition!.chapterIdx || firstPosition!.start - secondPosition!.start;
  });
}
export function buildWereadDrafts(snapshot: RecallStateSnapshot, books: WereadBook[], selection: ReadonlySet<string> | readonly string[]): WereadDraft[] {
  const selected = new Set(selection), known = new Set(books.map(book => book.bookId));
  if ([...selected].some(id => !known.has(id))) throw new Error('选择的书籍不存在');
  const existing = sourceCards(snapshot);
  return books.filter(book => selected.has(book.bookId)).flatMap(book => book.highlights.flatMap(highlight => {
    const id = wereadSourceId(book.bookId, highlight.bookmarkId), old = existing.get(id);
    if (old?.sourceRef?.highlights) return [];
    const originalUnchanged = !!old && old.back === highlight.markText;
    const kind: WereadKind = originalUnchanged ? old.contentKind === 'excerpt' ? 'excerpt' : old.recallKind === 'task' ? 'task' : 'qa'
      : highlight.recallKind === 'excerpt' ? 'excerpt' : highlight.question?.trim() ? highlight.recallKind === 'task' ? 'task' : 'qa' : 'task';
    return [{ id, book: { bookId: book.bookId, title: book.title, author: book.author }, highlight, include: true, kind, question: originalUnchanged ? old!.front : kind === 'excerpt' ? '' : highlight.question?.trim() ? highlight.question : '回忆这段划线的核心观点。', aiSummary: originalUnchanged ? old!.aiSummary : highlight.aiSummary, existingId: old?.id, originalUnchanged }];
  }));
}
function draftContent(draft: WereadDraft): WereadContent {
  const { book, highlight } = draft;
  sourceIdentifier(book.bookId, '书籍编号');
  sourceIdentifier(highlight.bookmarkId, '划线编号');
  if (draft.members !== undefined) validateMergedWereadDraft(draft);
  else {
    parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ ...book, highlights: [highlight] }] }));
    if (draft.id !== wereadSourceId(book.bookId, highlight.bookmarkId)) throw new Error('划线来源编号不一致');
  }
  if (!['qa', 'task', 'excerpt'].includes(draft.kind)) throw new Error('回忆类型无效');
  const front = safeText(draft.question, 10000, '问题或回忆任务', draft.kind !== 'excerpt');
  const back = safeText(highlight.markText, 20000, '划线原文', true);
  const bookTitle = normalizeName(safeText(book.title, 80, '书名', true));
  const chapter = highlight.chapterTitle === undefined ? '' : safeText(highlight.chapterTitle, 200, '章节');
  const chapterUid = highlight.chapterUid === undefined ? undefined : safeText(highlight.chapterUid, 200, '章节编号');
  const aiSummary = draft.aiSummary === undefined ? undefined : safeText(draft.aiSummary, 2000, '辅助摘要');
  const position = wereadHighlightPosition(highlight);
  return { front, back, bookTitle, chapter, source: `微信读书 · ${bookTitle}${chapter ? ` · ${chapter}` : ''}`, sourceRef: { provider: 'weread', bookId: book.bookId, bookmarkId: highlight.bookmarkId, ...(chapterUid === undefined ? {} : { chapterUid }), ...(position ? { chapterIdx: position.chapterIdx, range: highlight.range } : {}), ...(draft.members && draft.members.length > 1 ? { highlights: draft.members.map(member => ({ bookmarkId: member.bookmarkId, markText: member.markText, chapterUid: member.chapterUid!, chapterIdx: member.chapterIdx!, range: member.range! })) } : {}) }, contentKind: draft.kind === 'excerpt' ? 'excerpt' : 'qa', recallKind: draft.kind === 'excerpt' ? undefined : draft.kind === 'task' ? 'task' : 'question', aiSummary };
}
function sameContent(card: Card, content: WereadContent): boolean {
  return card.front === content.front && card.back === content.back && (card.contentKind ?? 'qa') === content.contentKind
    && (card.contentKind === 'excerpt' ? undefined : card.recallKind ?? 'question') === content.recallKind
    && (card.bookTitle ?? '') === content.bookTitle && (card.chapter ?? '') === content.chapter
    && card.source === content.source && (card.aiSummary ?? '') === (content.aiSummary ?? '')
    && card.sourceRef?.provider === content.sourceRef?.provider && card.sourceRef?.bookId === content.sourceRef?.bookId
    && card.sourceRef?.bookmarkId === content.sourceRef?.bookmarkId && card.sourceRef?.chapterUid === content.sourceRef?.chapterUid
    && JSON.stringify(card.sourceRef?.highlights) === JSON.stringify(content.sourceRef?.highlights);
}
function bookDeck(snapshot: RecallStateSnapshot, book: WereadDraft['book']): Deck | undefined {
  const id = `weread-book:${encodeURIComponent(book.bookId)}`, deck = snapshot.decks.find(deck => deck.id === id);
  if (deck) {
    const owned = deck.description === id || snapshot.cards.some(card => card.deckId === id && card.sourceRef?.provider === 'weread' && card.sourceRef.bookId === book.bookId);
    if (deck.parentId || !owned) throw new Error('书籍卡组编号与已有卡组冲突');
    return deck;
  }
  const roots = snapshot.decks.filter(deck => !deck.parentId && snapshot.cards.some(card => card.deckId === deck.id && card.sourceRef?.provider === 'weread' && card.sourceRef.bookId === book.bookId)
    && snapshot.cards.filter(card => card.deckId === deck.id).every(card => card.sourceRef?.provider === 'weread' && card.sourceRef.bookId === book.bookId));
  return roots.length === 1 ? roots[0] : undefined;
}
export function planWereadImport(snapshot: RecallStateSnapshot, drafts: WereadDraft[]): WereadImportPlan {
  const selected = drafts.filter(draft => draft.include);
  if (!selected.length || selected.length > 1000) throw new Error('请选择 1-1000 条划线');
  const existing = sourceCards(snapshot), seen = new Set<string>();
  const positions = new Map<string, { start: number; grouped: boolean }[]>();
  const rows = selected.map(draft => {
    const content = draftContent(draft);
    const members = draft.members ?? [draft.highlight];
    for (const member of members) {
      const identity = wereadSourceId(draft.book.bookId, member.bookmarkId);
      if (seen.has(identity)) throw new Error('待导入内容存在重复划线编号或分组来源复用');
      seen.add(identity);
      const position = wereadHighlightPosition(member);
      if (position) {
        const key = JSON.stringify([draft.book.bookId, member.chapterUid, position.chapterIdx]), prior = positions.get(key) ?? [];
        if (prior.some(range => (draft.members || range.grouped) && position.start === range.start)) throw new Error('待导入分组划线位置重复');
        prior.push({ ...position, grouped: !!draft.members });
        positions.set(key, prior);
      }
    }
    const old = existing.get(wereadSourceId(draft.book.bookId, draft.highlight.bookmarkId));
    if (draft.members && draft.members.length > 1) {
      const oldMembers = old?.sourceRef?.highlights;
      if (old && (!oldMembers || JSON.stringify(oldMembers.map(member => member.bookmarkId)) !== JSON.stringify(members.map(member => member.bookmarkId)))) throw new Error('来源已导入，不能重组旧单卡或改变已有分组成员');
      if (members.some(member => { const owner = existing.get(wereadSourceId(draft.book.bookId, member.bookmarkId)); return owner && owner !== old; })) throw new Error('分组来源已被其他卡片使用');
      for (const card of new Set(existing.values())) {
        if (card === old || card.sourceRef?.bookId !== draft.book.bookId) continue;
        if (members.some(member => card.sourceRef?.highlights?.some(existingMember => {
          const position = wereadHighlightPosition(member), prior = wereadHighlightPosition(existingMember);
          return position && prior && member.chapterUid === existingMember.chapterUid && position.chapterIdx === prior.chapterIdx && position.start === prior.start;
        }))) throw new Error('分组划线位置与已有分组重叠');
      }
    }
    if (snapshot.cards.some(card => card.id === draft.id && card !== old)) throw new Error('划线卡片编号与无关卡片冲突');
    if (old && !snapshot.decks.some(deck => deck.id === old.deckId)) throw new Error('已有卡片的卡组不存在');
    if (!old) bookDeck(snapshot, draft.book);
    if (old?.sourceRef?.highlights && (!draft.members || draft.members.length < 2)) {
      const protectedContent: WereadContent = { front: old.front, back: old.back, contentKind: old.contentKind, recallKind: old.recallKind, bookTitle: old.bookTitle, chapter: old.chapter, source: old.source, sourceRef: old.sourceRef, aiSummary: old.aiSummary };
      return { draft, content: protectedContent, existingId: old.id, existing: old, status: 'duplicate', protectedSource: true } as WereadImportRow;
    }
    return { draft, content, existingId: old?.id, existing: old, status: old ? sameContent(old, content) ? 'duplicate' : 'change' : 'new' } as WereadImportRow;
  });
  return { fingerprint: snapshotFingerprint(snapshot), rows };
}
function uniqueBookName(decks: Deck[], title: string): string {
  const used = new Set(decks.filter(deck => !deck.parentId).map(deck => normalizeName(deck.name).toLowerCase()));
  const base = normalizeName(title);
  if (!used.has(base.toLowerCase())) return base;
  for (let index = 1; ; index++) {
    const suffix = ` (微信读书 ${index})`, name = base.slice(0, 80 - suffix.length).trimEnd() + suffix;
    if (!used.has(name.toLowerCase())) return name;
  }
}
export function applyWereadImport(snapshot: RecallStateSnapshot, plan: WereadImportPlan, updates: Set<string>): WereadImportResult {
  if (snapshotFingerprint(snapshot) !== plan.fingerprint) throw new Error('数据已变化，请重新检查导入变化');
  const verified = planWereadImport(snapshot, plan.rows.map(row => row.draft));
  if (JSON.stringify(verified.rows) !== JSON.stringify(plan.rows)) throw new Error('导入预览已变化，请重新检查');
  if ([...updates].some(id => !plan.rows.some(row => row.draft.id === id && row.status === 'change'))) throw new Error('更新选择与预览不一致');
  const next = { ...snapshot, decks: [...snapshot.decks], cards: [...snapshot.cards] }, deckIds = new Set<string>();
  let added = 0, updated = 0, skipped = 0;
  const at = new Date().toISOString();
  for (const row of verified.rows) {
    const old = row.existingId ? next.cards.find(card => card.id === row.existingId) : undefined;
    if (old) {
      deckIds.add(old.deckId);
      if (row.status === 'change' && updates.has(row.draft.id)) {
        next.cards = next.cards.map(card => card.id === old.id ? { ...card, ...row.content } : card);
        updated++;
      } else skipped++;
      continue;
    }
    let deck = bookDeck(next, row.draft.book);
    if (!deck) {
      const id = `weread-book:${encodeURIComponent(row.draft.book.bookId)}`;
      deck = { id, name: uniqueBookName(next.decks, row.content.bookTitle!), description: id, parentId: null, color: 'slate', createdAt: at, updatedAt: at, importedAt: at };
      next.decks.push(deck);
    }
    next.cards.push(newMemoryCard({ ...row.content, id: row.draft.id, deckId: deck.id, lastImportedAt: at }, at));
    deckIds.add(deck.id);
    added++;
  }
  validateTree(next.decks);
  return { snapshot: next, added, updated, skipped, deckIds: [...deckIds] };
}
