import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { applyWereadImport, buildWereadDrafts, planWereadImport, type WereadBook } from './memory-weread';
import { createWereadJob, jobUpdates, pendingQuestions, safeJobPlan, validateWereadJob } from './weread-job';

function fixture(count = 2) {
  const snapshot = { ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [] };
  const books: WereadBook[] = [{ bookId: 'test-book', title: '原创测试书', highlights: Array.from({ length: count }, (_, index) => ({ bookmarkId: `test-${index}`, markText: `  原创测试划线 ${index}。\n保持不变。  ` })) }];
  return { snapshot, books, drafts: buildWereadDrafts(snapshot, books, ['test-book']) };
}
describe('bounded persistent WeRead job', () => {
  it('validates stored drafts and excludes successful questions from retry', () => {
    const { snapshot, drafts } = fixture();
    const job = createWereadJob(snapshot, drafts, new Set());
    expect(validateWereadJob(JSON.parse(JSON.stringify(job)))).toEqual(job);
    expect(pendingQuestions(job)).toHaveLength(2);
    job.generated.push(drafts[0].id);
    job.drafts[0].kind = 'qa';
    job.drafts[0].question = '如何说明这条原创材料的结论？';
    expect(pendingQuestions(job).map(draft => draft.id)).toEqual([drafts[1].id]);
  });
  it('requires a bounded twenty-question consent and keeps overlong excerpts unsent', () => {
    const { snapshot, drafts } = fixture(21);
    expect(() => createWereadJob(snapshot, drafts, new Set())).toThrow('20');
    drafts[20].include = false;
    expect(createWereadJob(snapshot, drafts, new Set()).drafts).toHaveLength(20);
    drafts[0].highlight.markText = '原'.repeat(6001);
    expect(() => createWereadJob(snapshot, drafts, new Set())).toThrow('6000');
    drafts[0].kind = 'excerpt'; drafts[0].question = '';
    expect(pendingQuestions(createWereadJob(snapshot, drafts, new Set()))).toHaveLength(19);
  });
  it('stored originals, kinds and identities are validated before reuse', () => {
    const { snapshot, drafts } = fixture();
    const job = createWereadJob(snapshot, drafts, new Set());
    job.drafts[0].highlight.markText = '<script>alert(1)</script>';
    expect(() => validateWereadJob(job)).toThrow();
    const another = createWereadJob(snapshot, fixture().drafts, new Set());
    another.generated.push('forged-id');
    expect(() => validateWereadJob(another)).toThrow('编号');
  });
  it('does not overwrite a card introduced by another page after consent', () => {
    const { snapshot, drafts } = fixture();
    const job = createWereadJob(snapshot, drafts, new Set());
    const imported = applyWereadImport(snapshot, planWereadImport(snapshot, drafts), new Set()).snapshot;
    imported.cards[0].front = '另一页面写入的内容';
    expect(() => safeJobPlan(imported, job)).toThrow('变化');
  });
  it('retries uncertain completed imports as duplicates rather than duplicating cards', () => {
    const { snapshot, drafts } = fixture();
    const job = createWereadJob(snapshot, drafts, new Set());
    const result = applyWereadImport(snapshot, safeJobPlan(snapshot, job), new Set());
    const retry = applyWereadImport(result.snapshot, safeJobPlan(result.snapshot, job), new Set());
    expect(retry.added).toBe(0); expect(retry.skipped).toBe(2);
  });
  it('review progress changes are compatible, but content/move changes require renewed confirmation', () => {
    const { snapshot, books, drafts } = fixture();
    const existing = applyWereadImport(snapshot, planWereadImport(snapshot, drafts), new Set()).snapshot;
    const changedBooks = books.map(book => ({ ...book, highlights: book.highlights.map(highlight => ({ ...highlight, markText: highlight.markText + '补充条件。' })) }));
    const changes = buildWereadDrafts(existing, changedBooks, ['test-book']);
    const job = createWereadJob(existing, changes, new Set([changes[0].id]));
    expect(pendingQuestions(job)).toHaveLength(1);
    existing.cards[0] = { ...existing.cards[0], reps: 9, archivedAt: '2026-10-31T00:00:00Z' };
    const result = applyWereadImport(existing, safeJobPlan(existing, job), new Set(job.updates));
    expect(result.updated).toBe(1); expect(result.snapshot.cards[0].reps).toBe(9);
    expect(result.snapshot.cards[0].archivedAt).toBe('2026-10-31T00:00:00Z');
    expect(() => safeJobPlan(result.snapshot, job)).not.toThrow();
    existing.cards[0].front = '另一个编辑';
    expect(() => safeJobPlan(existing, job)).toThrow('变化');
  });
  it('refreshes existing identities at consent and never generates for unapproved new conflicts', () => {
    const { snapshot, drafts } = fixture();
    const imported = applyWereadImport(snapshot, planWereadImport(snapshot, drafts), new Set()).snapshot;
    imported.cards[0].front = '其他页面的新问题';
    const job = createWereadJob(imported, drafts, new Set());
    expect(job.drafts[0].existingId).toBe(imported.cards[0].id);
    expect(pendingQuestions(job)).toHaveLength(0);
  });
  it('uncertain update completion retries idempotently without invalid stale update selections', () => {
    const { snapshot, books, drafts } = fixture();
    const imported = applyWereadImport(snapshot, planWereadImport(snapshot, drafts), new Set()).snapshot;
    books[0].highlights[0].markText += '修订内容';
    const changes = buildWereadDrafts(imported, books, ['test-book']);
    const job = createWereadJob(imported, changes, new Set([changes[0].id]));
    const plan = safeJobPlan(imported, job);
    const first = applyWereadImport(imported, plan, jobUpdates(plan, job));
    expect(first.updated).toBe(1);
    const retryPlan = safeJobPlan(first.snapshot, job);
    const retry = applyWereadImport(first.snapshot, retryPlan, jobUpdates(retryPlan, job));
    expect(retry.updated).toBe(0); expect(retry.skipped).toBe(2);
  });
  it('a duplicate moved after consent still requires explicit confirmation', () => {
    const { snapshot, drafts } = fixture();
    const imported = applyWereadImport(snapshot, planWereadImport(snapshot, drafts), new Set()).snapshot;
    const job = createWereadJob(imported, drafts, new Set());
    imported.decks.push({ ...imported.decks[0], id: 'moved', name: '另一个卡组' });
    imported.cards[0].deckId = 'moved';
    expect(() => safeJobPlan(imported, job)).toThrow('位置');
  });
  it('source-description edits after consent are content conflicts, not silent overwrites', () => {
    const { snapshot, books, drafts } = fixture();
    const imported = applyWereadImport(snapshot, planWereadImport(snapshot, drafts), new Set()).snapshot;
    books[0].highlights[0].markText += '修订';
    const changed = buildWereadDrafts(imported, books, ['test-book']);
    const job = createWereadJob(imported, changed, new Set([changed[0].id]));
    imported.cards[0].source = '另一个页面编辑了来源说明';
    expect(() => safeJobPlan(imported, job)).toThrow('变化');
  });
});
