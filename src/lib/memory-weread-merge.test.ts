import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import type { RecallStateSnapshot } from '@/types';
import { newMemoryCard } from './memory-folders';
import { applyWereadImport, buildWereadDrafts, isWereadHighlightImported, orderedWereadDrafts, parseWereadExport, planWereadImport, wereadSourceId, type WereadHighlight } from './memory-weread';
import { buildMergedWereadDraft, validateMergedWereadDraft } from './memory-weread-merge';
import { applyMemoryImport, parseMemoryMarkdown, planMemoryImport } from './memory-markdown';

const at = '2026-11-02T00:00:00.000Z';
const book = { bookId: 'book:one', title: 'Original source', author: 'Test author' };
function emptySnapshot(): RecallStateSnapshot {
  return { ...createSeedSnapshot(new Date(at)), cards: [], decks: [], reviewLogs: [], studySessions: [] };
}
function highlights(count = 2): WereadHighlight[] {
  return Array.from({ length: count }, (_, index) => ({ bookmarkId: `mark:${index}`, markText: `  Original ${index}.\r\n\tNext line.  `,
    chapterUid: 'chapter-one', chapterIdx: 2, chapterTitle: 'Chapter one', range: `${index * 100}-${index * 100 + 50}` }));
}
function singles(snapshot = emptySnapshot(), members = highlights()) {
  return buildWereadDrafts(snapshot, [{ ...book, highlights: members }], [book.bookId]);
}
function importDrafts(snapshot: ReturnType<typeof emptySnapshot>, drafts: ReturnType<typeof singles>) {
  return applyWereadImport(snapshot, planWereadImport(snapshot, drafts), new Set());
}

describe('position-aware WeRead source import', () => {
  it('blocks Markdown answer replacement on grouped cards instead of corrupting provenance', async () => {
    const draft = await buildMergedWereadDraft(emptySnapshot(), book, highlights(), 'What supports this conclusion?');
    const snapshot = importDrafts(emptySnapshot(), [draft]).snapshot;
    const document = parseMemoryMarkdown(`# ${book.title}\n\n<!-- recall:card ${JSON.stringify({ id: draft.id })} -->\n问题：A new question?\n\nA rewritten answer.\n<!-- recall:end -->`);
    const plan = planMemoryImport(snapshot, document, null);
    expect(() => applyMemoryImport(snapshot, plan, new Set([draft.id]))).toThrow('合并划线原文');
    expect(snapshot.cards[0].back).toBe(draft.highlight.markText);
  });
  it('validates optional positions without normalizing any original bytes', () => {
    const members = highlights();
    const parsed = parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ ...book, highlights: members }] }));
    expect(parsed.books[0].highlights).toMatchObject(members);
    expect(new TextEncoder().encode(parsed.books[0].highlights[0].markText)).toEqual(new TextEncoder().encode(members[0].markText));
    expect(singles(emptySnapshot(), [{ bookmarkId: 'legacy', markText: 'Legacy original.' }])).toHaveLength(1);
  });
  it.each([{ chapterIdx: null }, { chapterIdx: '1' }, { chapterIdx: -1 }, { chapterIdx: 0.1 }, { chapterIdx: Number.MAX_SAFE_INTEGER + 1 },
    { range: null }, { range: 1 }, { range: '' }, { range: '1' }, { range: '-1-4' }, { range: '1.5-2' }, { range: '1-2\n' }, { range: '0-9007199254740992' }])('rejects invalid optional positions: %j', fields => {
    expect(() => parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ ...book, highlights: [{ ...highlights()[0], ...fields }] }] }))).toThrow();
  });
  it('orders reliably by chapter index and range start without mutating input or using timestamps', () => {
    const members = highlights(3);
    members[2].chapterIdx = 1; members[2].chapterUid = 'earlier-chapter';
    const drafts = singles(emptySnapshot(), members).reverse(), before = [...drafts];
    expect(orderedWereadDrafts(drafts).map(draft => draft.highlight.bookmarkId)).toEqual(['mark:2', 'mark:0', 'mark:1']);
    expect(drafts).toEqual(before);
  });
  it('keeps book order and rejects missing, duplicate and ambiguous positions', () => {
    const snapshot = emptySnapshot(), drafts = singles();
    const other = buildWereadDrafts(snapshot, [{ ...book, bookId: 'other', highlights: highlights() }], ['other']);
    expect(orderedWereadDrafts([other[1], drafts[1], other[0], drafts[0]]).map(draft => draft.book.bookId)).toEqual(['other', 'other', book.bookId, book.bookId]);
    expect(() => orderedWereadDrafts(singles(snapshot, [{ bookmarkId: 'legacy', markText: 'Original' }]))).toThrow();
    expect(() => orderedWereadDrafts([drafts[0], drafts[0]])).toThrow();
    const overlap = singles(); overlap[1].highlight.range = '00-90';
    expect(() => orderedWereadDrafts(overlap)).toThrow();
    const ambiguous = singles(); ambiguous[1].highlight.chapterUid = 'different';
    expect(() => orderedWereadDrafts(ambiguous)).toThrow();
  });
});

describe('immutable grouped WeRead source identities', () => {
  it('uses compact SHA256 identity from book and ordered IDs, exact answers, and a real head bookmark', async () => {
    const members = highlights(), draft = await buildMergedWereadDraft(emptySnapshot(), book, members, 'What links these originals?');
    expect(JSON.stringify(draft.members)).toBe(JSON.stringify(members));
    expect(draft.members).not.toBe(members);
    const expected = createHash('sha256').update(JSON.stringify([book.bookId, members.map(member => member.bookmarkId)])).digest('hex');
    expect(draft.id).toBe(`weread-group:${expected}`);
    expect(() => validateMergedWereadDraft(draft)).not.toThrow();
    expect(draft.highlight.markText).toBe(members.map(member => member.markText).join('\n\n'));
    expect(draft.highlight.bookmarkId).toBe(members[0].bookmarkId);
    const result = importDrafts(emptySnapshot(), [draft]);
    expect(result.snapshot.cards[0].sourceRef).toEqual({ provider: 'weread', bookId: book.bookId, bookmarkId: members[0].bookmarkId, chapterUid: members[0].chapterUid, chapterIdx: members[0].chapterIdx, range: members[0].range,
      highlights: members.map(member => ({ bookmarkId: member.bookmarkId, markText: member.markText, chapterUid: member.chapterUid, chapterIdx: member.chapterIdx, range: member.range })) });
    expect(result.snapshot.cards[0].back).toBe(draft.highlight.markText);
  });
  it.each([2, 3, 4])('matches native SHA256 validation for %i members and multi-block Unicode IDs', async count => {
    const members = highlights(count).map((member, index) => ({ ...member, bookmarkId: `${'id:'.repeat(40)}\u4e2d-${index}` }));
    const value = { ...book, bookId: 'book'.repeat(40) };
    const draft = await buildMergedWereadDraft(emptySnapshot(), value, members, 'Question?');
    expect(() => validateMergedWereadDraft(JSON.parse(JSON.stringify(draft)))).not.toThrow();
    const changed = structuredClone(draft); changed.id = draft.id.slice(0, -1) + (draft.id.endsWith('0') ? '1' : '0');
    expect(() => validateMergedWereadDraft(changed)).toThrow();
  });
  it('keeps a one-member draft on the normal single ID path, even without positions', async () => {
    const member = { bookmarkId: 'legacy', markText: ' Original.\r\n ' };
    const draft = await buildMergedWereadDraft(emptySnapshot(), book, [member], 'A specific question?');
    expect(draft.id).toBe(wereadSourceId(book.bookId, member.bookmarkId));
    expect(draft.members).toBeUndefined();
    expect(JSON.stringify(draft.highlight)).toBe(JSON.stringify(member));
    expect(draft.question).toBe('A specific question?');
    expect(importDrafts(emptySnapshot(), [draft]).snapshot.cards[0].sourceRef?.highlights).toBeUndefined();
  });
  it.each(['missing-position', 'missing-chapter', 'cross-chapter', 'out-of-order', 'overlap', 'duplicate', 'too-many', 'too-long', 'unsafe', 'unknown', 'cross-book'])(
    'rejects invalid new groups: %s', async scenario => {
      const members = highlights();
      if (scenario === 'missing-position') delete members[1].range;
      if (scenario === 'missing-chapter') delete members[1].chapterUid;
      if (scenario === 'cross-chapter') members[1].chapterIdx = 3;
      if (scenario === 'out-of-order') members.reverse();
      if (scenario === 'overlap') members[1].range = '00-70';
      if (scenario === 'duplicate') members[1].bookmarkId = members[0].bookmarkId;
      if (scenario === 'too-many') members.push(...highlights(5).slice(2));
      if (scenario === 'too-long') members[0].markText = 'a'.repeat(6000);
      if (scenario === 'unsafe') members[1].markText = '<script>alert(1)</script>';
      if (scenario === 'unknown') Object.assign(members[1], { ignored: true });
      if (scenario === 'cross-book') Object.assign(members[1], { bookId: 'other-book' });
      await expect(buildMergedWereadDraft(emptySnapshot(), book, members, 'Question?')).rejects.toThrow();
    },
  );
  it('uses only reliable range starts, preserves the second field and allows the exact answer boundary', async () => {
    const members = highlights(); members[0].range = '2-100'; members[1].range = '10-0';
    members[0].markText = 'a'.repeat(2999); members[1].markText = 'b'.repeat(2999);
    expect((await buildMergedWereadDraft(emptySnapshot(), book, members, 'Question?')).highlight.markText).toHaveLength(6000);
  });
  it('does not trust an aggregate, head source, membership, question, or group ID supplied later', async () => {
    const draft = await buildMergedWereadDraft(emptySnapshot(), book, highlights(), 'Question?');
    for (const tamper of [
      (value: typeof draft) => { value.highlight.markText = 'Rewritten answer'; },
      (value: typeof draft) => { value.highlight.bookmarkId = 'synthetic'; },
      (value: typeof draft) => { value.highlight.chapterTitle = 'Changed head'; },
      (value: typeof draft) => { value.members![1].bookmarkId = 'another'; },
      (value: typeof draft) => { value.members![1].markText += 'extra'; },
      (value: typeof draft) => { value.members!.reverse(); },
      (value: typeof draft) => { value.question = '[run](javascript:alert)'; },
      (value: typeof draft) => { Object.assign(value.highlight, { secret: 'test-only' }); },
      (value: typeof draft) => { value.id = 'weread-group:forged'; },
    ]) {
      const changed = structuredClone(draft); tamper(changed);
      expect(() => validateMergedWereadDraft(changed)).toThrow();
      expect(() => planWereadImport(emptySnapshot(), [changed])).toThrow();
    }
  });
  it('omits every grouped member on the single path and protects stale singleton plans from updates', async () => {
    const snapshot = emptySnapshot(), members = highlights(), oldSingles = singles(snapshot, members);
    const draft = await buildMergedWereadDraft(snapshot, book, members, 'Question?'), imported = importDrafts(snapshot, [draft]).snapshot;
    expect(singles(imported, members)).toEqual([]);
    for (const member of members) expect(isWereadHighlightImported(imported, book.bookId, member.bookmarkId)).toBe(true);
    expect(isWereadHighlightImported(imported, 'other', members[0].bookmarkId)).toBe(false);
    const protectedPlan = planWereadImport(imported, oldSingles);
    expect(protectedPlan.rows.every(row => row.status === 'duplicate' && row.protectedSource && row.existingId === imported.cards[0].id)).toBe(true);
    expect(applyWereadImport(imported, protectedPlan, new Set())).toMatchObject({ added: 0, updated: 0, skipped: 2 });
    expect(() => applyWereadImport(imported, protectedPlan, new Set([oldSingles[1].id]))).toThrow();
    await expect(buildMergedWereadDraft(imported, book, [members[1]], 'Single?')).rejects.toThrow();
  });
  it('never regroups old single cards, steals group sources, or changes existing group membership', async () => {
    const snapshot = emptySnapshot(), members = highlights(4);
    const old = importDrafts(snapshot, singles(snapshot, members)).snapshot, before = structuredClone(old);
    await expect(buildMergedWereadDraft(old, book, members.slice(0, 2), 'Question?')).rejects.toThrow();
    expect(old).toEqual(before);
    const group = await buildMergedWereadDraft(snapshot, book, members.slice(0, 2), 'Question?'), grouped = importDrafts(snapshot, [group]).snapshot;
    await expect(buildMergedWereadDraft(grouped, book, [members[0], members[2]], 'Question?')).rejects.toThrow();
    await expect(buildMergedWereadDraft(grouped, book, [members[1], members[2]], 'Question?')).rejects.toThrow();
  });
  it('reuses existing custom IDs and authored prompts and skips identical repeated imports', async () => {
    const snapshot = emptySnapshot(), members = highlights(), draft = await buildMergedWereadDraft(snapshot, book, members, 'Question?');
    const imported = importDrafts(snapshot, [draft]).snapshot;
    imported.cards[0] = { ...imported.cards[0], id: 'custom-group-card', front: 'My authored prompt', reps: 7, archivedAt: at };
    const repeated = await buildMergedWereadDraft(imported, book, members, 'Do not replace my prompt');
    expect(repeated).toMatchObject({ existingId: 'custom-group-card', question: 'My authored prompt', originalUnchanged: true });
    expect(importDrafts(imported, [repeated])).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    expect(importDrafts(imported, [repeated]).snapshot).toEqual(imported);
  });
  it('updates only explicitly chosen group content and preserves every progress, archive and history field', async () => {
    const snapshot = emptySnapshot(), members = highlights(), draft = await buildMergedWereadDraft(snapshot, book, members, 'Question?');
    const imported = importDrafts(snapshot, [draft]).snapshot;
    const card = { ...imported.cards[0], id: 'custom-group', state: 'review' as const, reps: 8, lapses: 3, stability: 20, difficulty: 4,
      learningSteps: 2, elapsedDays: 4, scheduledDays: 20, nextReviewDate: '2027-01-01T00:00:00Z', lastReviewDate: at,
      createdAt: at, updatedAt: at, importedAt: at, lastImportedAt: at, archivedAt: at, hint: 'Custom hint', tags: ['mine'] };
    const progressed = { ...imported, cards: [card], reviewLogs: [{ id: 'review', cardId: card.id, rating: 'good' as const, reviewDate: at, stability: 20, difficulty: 4, elapsedDays: 4, scheduledDays: 20 }],
      studySessions: [{ id: 'session', deckId: card.deckId, startedAt: at, endedAt: at, cardsStudied: 1 }] };
    const changedMembers = members.map(member => ({ ...member, markText: `${member.markText}\r\n Updated original. ` }));
    const changed = await buildMergedWereadDraft(progressed, book, changedMembers, 'New suggestion');
    expect(changed.id).toBe(draft.id);
    expect(changed.question).toBe(card.front);
    expect(changed.originalUnchanged).toBe(false);
    changed.question = 'Explicit edited question?';
    const plan = planWereadImport(progressed, [changed]);
    expect(plan.rows[0].status).toBe('change');
    expect(applyWereadImport(progressed, plan, new Set()).snapshot.cards[0]).toEqual(card);
    const result = applyWereadImport(progressed, plan, new Set([changed.id]));
    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 0 });
    expect(result.snapshot.cards[0]).toEqual({ ...card, front: changed.question, back: changed.highlight.markText, sourceRef: plan.rows[0].content.sourceRef });
    expect(result.snapshot.reviewLogs).toBe(progressed.reviewLogs);
    expect(result.snapshot.studySessions).toBe(progressed.studySessions);
    expect(result.snapshot.settings).toBe(progressed.settings);
    const retry = await buildMergedWereadDraft(result.snapshot, book, changedMembers, 'Not used');
    expect(importDrafts(result.snapshot, [retry])).toMatchObject({ added: 0, updated: 0, skipped: 1 });
  });
  it('rejects group/single source reuse, group ID collisions, overlaps, and existing-library source collisions', async () => {
    const snapshot = emptySnapshot(), members = highlights(4), group = await buildMergedWereadDraft(snapshot, book, members.slice(0, 2), 'Question?');
    expect(() => planWereadImport(snapshot, [group, singles(snapshot, [members[1]])[0]])).toThrow();
    const collision = { ...snapshot, cards: [newMemoryCard({ id: group.id, deckId: 'unrelated', front: 'Unrelated', back: 'Original' }, at)] };
    expect(() => planWereadImport(collision, [group])).toThrow();
    const overlapMembers = members.slice(2).map((member, index) => ({ ...member, range: `${index * 100}-4` }));
    const overlap = await buildMergedWereadDraft(snapshot, book, overlapMembers, 'Question?');
    expect(() => planWereadImport(snapshot, [group, overlap])).toThrow();
    const imported = importDrafts(snapshot, [group]).snapshot;
    await expect(buildMergedWereadDraft(imported, book, overlapMembers, 'Question?')).rejects.toThrow();
    imported.cards.push(newMemoryCard({ id: 'duplicate-member', deckId: imported.decks[0].id, front: 'Other', back: 'Other', sourceRef: { provider: 'weread', bookId: book.bookId, bookmarkId: members[1].bookmarkId } }, at));
    expect(() => isWereadHighlightImported(imported, book.bookId, members[0].bookmarkId)).toThrow();
  });
  it('revalidates grouping and content during apply rather than trusting a tampered preview', async () => {
    const snapshot = emptySnapshot(), draft = await buildMergedWereadDraft(snapshot, book, highlights(), 'Question?');
    const plan = planWereadImport(snapshot, [draft]);
    plan.rows[0].content.back = 'Untrusted aggregate';
    expect(() => applyWereadImport(snapshot, plan, new Set())).toThrow();
    expect(snapshot.cards).toEqual([]);
  });
});
