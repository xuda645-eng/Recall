import type { RecallStateSnapshot } from '@/types';
import { parseWereadExport, planWereadImport, type WereadDraft, type WereadImportPlan } from './memory-weread';

export type WereadJobStatus = 'ready' | 'generating' | 'paused' | 'generation-failed' | 'importing' | 'import-failed' | 'done';
export interface WereadJob {
  id: 'active';
  version: 1;
  createdAt: string;
  expiresAt: number;
  status: WereadJobStatus;
  drafts: WereadDraft[];
  generated: string[];
  updates: string[];
  consent: Record<string, string | null>;
  error: string;
  receipt?: { added: number; updated: number; skipped: number; deckIds: string[] };
}
function contentIdentity(card: RecallStateSnapshot['cards'][number]): string {
  return JSON.stringify([card.id, card.deckId, card.front, card.back, card.contentKind, card.recallKind, card.bookTitle, card.chapter, card.sourceRef, card.aiSummary, card.source]);
}
export function needsQuestion(draft: WereadDraft): boolean {
  return draft.include && !draft.protectedSource && !draft.members && draft.kind !== 'excerpt' && !draft.originalUnchanged && !draft.highlight.question?.trim();
}
export function pendingQuestions(job: WereadJob): WereadDraft[] {
  return job.drafts.filter(draft => needsQuestion(draft) && !job.generated.includes(draft.id) && (!draft.existingId || job.updates.includes(draft.id)));
}
export function createWereadJob(snapshot: RecallStateSnapshot, drafts: WereadDraft[], updates: ReadonlySet<string>): WereadJob {
  const plan = planWereadImport(snapshot, drafts);
  if ([...updates].some(id => !plan.rows.some(row => row.draft.id === id && row.status === 'change'))) throw new Error('更新选择与预览不一致');
  const now = Date.now();
  const job: WereadJob = { id: 'active', version: 1, createdAt: new Date(now).toISOString(), expiresAt: now + 7 * 86400000,
    status: 'ready', drafts: plan.rows.map(row => ({ ...row.draft, existingId: row.existingId, originalUnchanged: row.status === 'duplicate' || row.draft.originalUnchanged, ...(row.protectedSource ? { protectedSource: true } : {}) })), generated: [], updates: [...updates],
    consent: Object.fromEntries(plan.rows.map(row => [row.draft.id, row.existing ? contentIdentity(row.existing) : null])), error: '' };
  if (pendingQuestions(job).some(draft => draft.highlight.markText.length > 6000)) throw new Error('部分划线超过 AI 的 6000 字限制，请取消选择或改为手动整理');
  return job;
}
export function safeJobPlan(snapshot: RecallStateSnapshot, job: WereadJob): WereadImportPlan {
  const plan = planWereadImport(snapshot, job.drafts);
  for (const row of plan.rows) {
    if (row.protectedSource && !row.draft.protectedSource) throw new Error('来源已属于分组，请重新检查并确认；不会为旧单条任务生成问题');
    const accepted = job.consent[row.draft.id];
    if (typeof accepted === 'string' && row.existing && JSON.parse(accepted)[1] !== row.existing.deckId) throw new Error('卡片位置已变化，请重新检查并确认；问题草稿已保留');
    if (accepted === undefined || (accepted === null && row.existing && row.status !== 'duplicate')
      || (accepted !== null && row.status !== 'duplicate' && (!row.existing || contentIdentity(row.existing) !== accepted))) {
      throw new Error('卡片内容或位置已变化，请重新检查并确认；问题草稿已保留');
    }
  }
  return plan;
}
export function jobUpdates(plan: WereadImportPlan, job: WereadJob): Set<string> {
  return new Set(job.updates.filter(id => plan.rows.some(row => row.draft.id === id && row.status === 'change')));
}
export function validateWereadJob(value: unknown): WereadJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('任务草稿无法读取，未自动执行');
  const job = value as WereadJob;
  if (Object.keys(job).some(key => !['id', 'version', 'createdAt', 'expiresAt', 'status', 'drafts', 'generated', 'updates', 'consent', 'error', 'receipt'].includes(key))) throw new Error('任务含有不支持的字段');
  if (job.id !== 'active' || job.version !== 1 || !Number.isFinite(job.expiresAt) || typeof job.createdAt !== 'string'
    || !['ready', 'generating', 'paused', 'generation-failed', 'importing', 'import-failed', 'done'].includes(job.status)
    || !Array.isArray(job.drafts) || !job.drafts.length || job.drafts.length > 1000 || !Array.isArray(job.generated)
    || !Array.isArray(job.updates) || !job.consent || typeof job.consent !== 'object' || Array.isArray(job.consent) || typeof job.error !== 'string'
    || !Number.isFinite(Date.parse(job.createdAt))) throw new Error('任务草稿格式无效，未自动执行');
  const grouped = new Map<string, { bookId: string; title: string; author?: string; highlights: object[] }>();
  for (const draft of job.drafts) {
    if (!draft || !draft.book || !draft.highlight || typeof draft.include !== 'boolean' || typeof draft.originalUnchanged !== 'boolean' || typeof draft.question !== 'string') throw new Error('任务草稿格式无效');
    if (Object.keys(draft).some(key => !['id', 'book', 'highlight', 'members', 'include', 'kind', 'question', 'aiSummary', 'existingId', 'originalUnchanged', 'protectedSource'].includes(key))
      || typeof draft.id !== 'string' || (draft.existingId !== undefined && typeof draft.existingId !== 'string')
      || (draft.protectedSource !== undefined && typeof draft.protectedSource !== 'boolean')) throw new Error('任务草稿字段无效');
    if (draft.members !== undefined && !Array.isArray(draft.members)) throw new Error('任务分组原文格式无效');
    if (!grouped.has(draft.book.bookId)) grouped.set(draft.book.bookId, { ...draft.book, highlights: [] });
    else if (grouped.get(draft.book.bookId)!.title !== draft.book.title || grouped.get(draft.book.bookId)!.author !== draft.book.author) throw new Error('任务书籍元数据不一致');
    if (Object.keys(draft.book).some(key => !['bookId', 'title', 'author'].includes(key))) throw new Error('任务书籍含有不支持的字段');
    grouped.get(draft.book.bookId)!.highlights.push(...(draft.members ?? [draft.highlight]));
  }
  parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [...grouped.values()] }));
  const empty = { cards: [], decks: [], reviewLogs: [], studySessions: [] } as unknown as RecallStateSnapshot;
  const identities = new Set(planWereadImport(empty, job.drafts.map(draft => ({ ...draft, include: true }))).rows.map(row => row.draft.id));
  if (job.drafts.some(draft => !identities.has(draft.id)) || [...job.generated, ...job.updates].some(id => !identities.has(id))
    || new Set(job.drafts.map(draft => draft.id)).size !== job.drafts.length || new Set(job.generated).size !== job.generated.length || new Set(job.updates).size !== job.updates.length
    || job.drafts.some(draft => !Object.hasOwn(job.consent, draft.id))
    || Object.keys(job.consent).some(id => !identities.has(id)) || Object.values(job.consent).some(value => value !== null && typeof value !== 'string')) throw new Error('任务来源编号无效');
  for (const identity of Object.values(job.consent)) {
    if (identity === null) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(identity); } catch { throw new Error('任务确认记录无效'); }
    if (!Array.isArray(parsed) || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') throw new Error('任务确认记录无效');
  }
  if (job.generated.some(id => !job.drafts.some(draft => draft.id === id && draft.kind === 'qa' && draft.question.trim()))) throw new Error('任务问题范围无效');
  if (job.receipt && (Object.keys(job.receipt).some(key => !['added', 'updated', 'skipped', 'deckIds'].includes(key)) || !['added', 'updated', 'skipped'].every(key => Number.isSafeInteger(job.receipt![key as 'added']) && job.receipt![key as 'added'] >= 0)
    || !Array.isArray(job.receipt.deckIds) || job.receipt.deckIds.some(id => typeof id !== 'string'))) throw new Error('任务完成记录无效');
  return job;
}
