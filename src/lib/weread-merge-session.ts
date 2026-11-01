import type { RecallStateSnapshot } from '@/types';
import { buildWereadDrafts, parseWereadExport, planWereadImport, wereadSourceId, type WereadDraft } from './memory-weread';
import { buildMergedWereadDraft, orderedWereadDrafts } from './memory-weread-merge';
import { MERGE_MAX_CHARS, MERGE_MAX_HIGHLIGHTS, MERGE_MAX_MEMBERS, validateMergeBatch, validateMergeGroups, type MergeBatch, type MergeGroup } from '../../shared/weread-merge';
import { validateQuestion } from '../../shared/weread-ai';

export interface WereadMergeSession {
  id: 'active';
  version: 1;
  revision: number;
  createdAt: string;
  expiresAt: number;
  sources: WereadDraft[];
  cursor: number;
  cards: WereadDraft[];
  status: 'ready' | 'generating' | 'paused' | 'review' | 'importing' | 'done';
  error: string;
  demo?: boolean;
  receipt?: { added: number; updated: number; skipped: number; deckIds: string[] };
}

export function nextMergeBatch(session: Pick<WereadMergeSession, 'sources' | 'cursor'>): MergeBatch | null {
  const first = session.sources[session.cursor];
  if (!first) return null;
  const candidates: WereadDraft[] = [];
  let characters = 0;
  for (const draft of session.sources.slice(session.cursor)) {
    if (draft.book.bookId !== first.book.bookId || draft.highlight.chapterUid !== first.highlight.chapterUid
      || draft.highlight.chapterIdx !== first.highlight.chapterIdx || candidates.length === MERGE_MAX_HIGHLIGHTS
      || characters + draft.highlight.markText.length + (candidates.length ? 2 : 0) > MERGE_MAX_CHARS) break;
    candidates.push(draft);
    characters += draft.highlight.markText.length + (candidates.length > 1 ? 2 : 0);
  }
  return validateMergeBatch({ bookId: first.book.bookId, chapterUid: first.highlight.chapterUid, chapterIdx: first.highlight.chapterIdx,
    ...(first.highlight.chapterTitle ? { chapterTitle: first.highlight.chapterTitle } : {}),
    highlights: candidates.map(draft => ({ id: draft.highlight.bookmarkId, markText: draft.highlight.markText, range: draft.highlight.range })) });
}

export function remainingMergeAttempts(session: Pick<WereadMergeSession, 'sources' | 'cursor'>): number {
  let cursor = session.cursor;
  let count = 0;
  while (cursor < session.sources.length) {
    const batch = nextMergeBatch({ sources: session.sources, cursor });
    if (!batch) break;
    const following = session.sources[cursor + batch.highlights.length];
    const overlap = batch.highlights.length > MERGE_MAX_MEMBERS && following?.book.bookId === batch.bookId
      && following.highlight.chapterUid === batch.chapterUid && following.highlight.chapterIdx === batch.chapterIdx;
    cursor += overlap ? batch.highlights.length - MERGE_MAX_MEMBERS : batch.highlights.length;
    count++;
  }
  return count;
}

export function createMergeSession(snapshot: RecallStateSnapshot, drafts: WereadDraft[]): WereadMergeSession {
  const selected = drafts.filter(draft => draft.include && !draft.existingId);
  if (!selected.length) throw new Error('没有可合并的新划线；已有卡片不会自动重组');
  if (planWereadImport(snapshot, selected).rows.some(row => row.status !== 'new')) throw new Error('部分划线已导入，请重新选择；已有卡片不会自动重组');
  const sources = orderedWereadDrafts(selected);
  if (sources.some(draft => draft.highlight.markText.length > MERGE_MAX_CHARS)) throw new Error('部分划线超过 6000 字，请取消选择或手动整理');
  const now = Date.now();
  const session: WereadMergeSession = { id: 'active', version: 1, revision: 0, createdAt: new Date(now).toISOString(), expiresAt: now + 7 * 86400000,
    sources, cursor: 0, cards: [], status: 'ready', error: '' };
  nextMergeBatch(session);
  return session;
}

export async function createMergeDemo(snapshot: RecallStateSnapshot): Promise<WereadMergeSession> {
  const book = { bookId: 'recall-synthetic-merge-demo', title: '原创合并示例', highlights: [
    { bookmarkId: 'demo-1', markText: '  校验结论前，先区分观察到的事实与自己的判断。\n保留原文空格。  ', chapterUid: '1', chapterIdx: 1, range: '10-80', chapterTitle: '检查理解' },
    { bookmarkId: 'demo-2', markText: '说明判断的依据，再回到材料检查遗漏。', chapterUid: '1', chapterIdx: 1, range: '100-130', chapterTitle: '检查理解' },
    { bookmarkId: 'demo-3', markText: '练习一种方法时，先拆出最小步骤。', chapterUid: '2', chapterIdx: 2, range: '10-30', chapterTitle: '练习方法' },
    { bookmarkId: 'demo-4', markText: '完成一个步骤后检查结果，再进入下一步。', chapterUid: '2', chapterIdx: 2, range: '100-140', chapterTitle: '练习方法' },
  ] };
  const drafts = buildWereadDrafts(snapshot, [book], [book.bookId]);
  let session = createMergeSession(snapshot, drafts);
  session = await acceptMergeBatch(snapshot, session, [{ highlightIds: ['demo-1', 'demo-2'], question: '校验结论时，如何区分事实与判断并检查依据？' }]);
  session = await acceptMergeBatch(snapshot, session, [{ highlightIds: ['demo-3', 'demo-4'], question: '练习一种方法时，应如何安排步骤并检查结果？' }]);
  return { ...session, demo: true };
}

export async function acceptMergeBatch(snapshot: RecallStateSnapshot, session: WereadMergeSession, response: MergeGroup[]): Promise<WereadMergeSession> {
  const batch = nextMergeBatch(session);
  if (!batch) throw new Error('分组批次不存在');
  const groups = validateMergeGroups({ cards: response }, batch);
  const following = session.sources[session.cursor + batch.highlights.length];
  const overlap = batch.highlights.length > MERGE_MAX_MEMBERS && following?.book.bookId === batch.bookId
    && following.highlight.chapterUid === batch.chapterUid && following.highlight.chapterIdx === batch.chapterIdx;
  const committed = overlap ? groups.slice(0, -1) : groups;
  const cards: WereadDraft[] = [];
  let consumed = 0;
  for (const group of committed) {
    const members = session.sources.slice(session.cursor + consumed, session.cursor + consumed + group.highlightIds.length);
    cards.push(await buildMergedWereadDraft(snapshot, members[0].book, members.map(draft => draft.highlight), group.question));
    consumed += members.length;
  }
  if (!consumed) throw new Error('分组没有前进，未保存或导入');
  const cursor = session.cursor + consumed;
  return { ...session, cards: [...session.cards, ...cards], cursor, status: cursor === session.sources.length ? 'review' : 'generating', error: '' };
}

export async function validateMergeSession(value: unknown): Promise<WereadMergeSession> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('合并草稿格式无效');
  const session = value as WereadMergeSession;
  if (Object.keys(session).some(key => !['id', 'version', 'revision', 'createdAt', 'expiresAt', 'sources', 'cursor', 'cards', 'status', 'error', 'receipt', 'demo'].includes(key))
    || (session.demo !== undefined && typeof session.demo !== 'boolean')) throw new Error('合并草稿含不支持的字段');
  if (session.id !== 'active' || session.version !== 1 || !Number.isSafeInteger(session.revision) || session.revision < 0 || typeof session.createdAt !== 'string' || !Number.isFinite(Date.parse(session.createdAt))
    || !Number.isSafeInteger(session.expiresAt) || !['ready', 'generating', 'paused', 'review', 'importing', 'done'].includes(session.status)
    || !Array.isArray(session.sources) || !session.sources.length || session.sources.length > 1000 || !Array.isArray(session.cards)
    || !Number.isSafeInteger(session.cursor) || session.cursor < 0 || session.cursor > session.sources.length || typeof session.error !== 'string'
    || session.expiresAt <= Date.parse(session.createdAt) || session.expiresAt > Date.parse(session.createdAt) + 7 * 86400000) throw new Error('合并草稿格式无效');
  const books = new Map<string, { bookId: string; title: string; author?: string; highlights: object[] }>();
  for (const source of session.sources) {
    if (!source?.book || !source.highlight || source.members?.length || source.existingId || source.include !== true
      || source.id !== wereadSourceId(source.book.bookId, source.highlight.bookmarkId)) throw new Error('合并来源无效');
    if (Object.keys(source).some(key => !['id', 'book', 'highlight', 'include', 'kind', 'question', 'aiSummary', 'originalUnchanged', 'protectedSource', 'existingId'].includes(key))) throw new Error('合并来源字段无效');
    if (!books.has(source.book.bookId)) books.set(source.book.bookId, { ...source.book, highlights: [] });
    else if (books.get(source.book.bookId)!.title !== source.book.title || books.get(source.book.bookId)!.author !== source.book.author) throw new Error('合并书籍信息不一致');
    books.get(source.book.bookId)!.highlights.push(source.highlight);
  }
  parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [...books.values()] }));
  if (JSON.stringify(orderedWereadDrafts(session.sources)) !== JSON.stringify(session.sources)) throw new Error('合并来源顺序无效');
  if (session.sources.some(source => source.highlight.markText.length > MERGE_MAX_CHARS)) throw new Error('合并来源过长');
  const empty = { cards: [], decks: [], reviewLogs: [], studySessions: [], settings: {} } as unknown as RecallStateSnapshot;
  let cursor = 0;
  for (const card of session.cards) {
    const members = card.members || [card.highlight];
    if (!members.length || members.length > MERGE_MAX_MEMBERS || card.include !== true || card.existingId) throw new Error('合并卡片范围无效');
    if (Object.keys(card).some(key => !['id', 'book', 'highlight', 'members', 'include', 'kind', 'question', 'aiSummary', 'originalUnchanged', 'protectedSource', 'existingId'].includes(key))) throw new Error('合并卡片字段无效');
    try { validateQuestion({ question: card.question, summary: null }, false); }
    catch { throw new Error('问题需为 8-160 字的具体回忆提示，不能包含可执行内容'); }
    const expected = session.sources.slice(cursor, cursor + members.length);
    if (expected.length !== members.length || expected.some((source, index) => source.book.bookId !== card.book.bookId
      || source.book.title !== card.book.title || source.book.author !== card.book.author
      || JSON.stringify(source.highlight) !== JSON.stringify(members[index]))) throw new Error('合并划线遗漏、重复或顺序无效');
    const recreated = await buildMergedWereadDraft(empty, expected[0].book, members, card.question);
    if (recreated.id !== card.id || recreated.highlight.markText !== card.highlight.markText
      || !['qa', 'task'].includes(card.kind)) throw new Error('合并卡片内容无效');
    cursor += members.length;
  }
  if (cursor !== session.cursor || (['review', 'importing', 'done'].includes(session.status) && cursor !== session.sources.length)) throw new Error('合并草稿进度无效');
  if (session.receipt && (!['added', 'updated', 'skipped'].every(key => Number.isSafeInteger(session.receipt![key as 'added']) && session.receipt![key as 'added'] >= 0)
    || !Array.isArray(session.receipt.deckIds) || session.receipt.deckIds.some(id => typeof id !== 'string'))) throw new Error('合并完成记录无效');
  return session;
}
