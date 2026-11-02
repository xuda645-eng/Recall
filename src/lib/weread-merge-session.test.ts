import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { buildWereadDrafts } from './memory-weread';
import { acceptMergeBatch, createMergeDemo, createMergeSession, nextMergeBatch, remainingMergeAttempts, validateMergeSession } from './weread-merge-session';

const snapshot = () => ({ ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [], studySessions: [] });
function sources(count = 5) {
  return buildWereadDrafts(snapshot(), [{ bookId: 'synthetic-book', title: '合成书', highlights: Array.from({ length: count }, (_, index) => ({
    bookmarkId: `mark-${index}`, markText: `  原文 ${index}。\r\n\t 保持空白。  `, chapterUid: '1', chapterIdx: 1, range: `${index * 100}-20`,
  })) }], ['synthetic-book']);
}
const question = '这几段划线共同说明了什么具体条件？';

describe('ordered merge sessions', () => {
  it('provides a explicitly synthetic, prewritten no-AI preview', async () => {
    const demo = await createMergeDemo(snapshot());
    expect(demo.demo).toBe(true);
    expect(demo.cards).toHaveLength(2);
    expect(demo.sources).toHaveLength(4);
    await expect(validateMergeSession(demo)).resolves.toEqual(demo);
  });
  it('sorts original positions rather than input order, preserving original strings', () => {
    const input = sources().reverse();
    const session = createMergeSession(snapshot(), input);
    expect(session.sources.map(source => source.highlight.bookmarkId)).toEqual(['mark-0', 'mark-1', 'mark-2', 'mark-3', 'mark-4']);
    expect(nextMergeBatch(session)?.highlights[0].markText).toBe(input[4].highlight.markText);
    expect(remainingMergeAttempts(session)).toBe(1);
  });
  it('stores only validated groups and roundtrips a completed draft', async () => {
    const session = createMergeSession(snapshot(), sources());
    const accepted = await acceptMergeBatch(snapshot(), session, [
      { highlightIds: ['mark-0', 'mark-1', 'mark-2'], question }, { highlightIds: ['mark-3', 'mark-4'], question },
    ]);
    expect(accepted.cursor).toBe(5);
    expect(accepted.status).toBe('review');
    expect(accepted.cards).toHaveLength(2);
    await expect(validateMergeSession(structuredClone(accepted))).resolves.toEqual(accepted);
  });
  it('keeps the boundary group for the next batch and never duplicates committed originals', async () => {
    const session = createMergeSession(snapshot(), sources(15));
    expect(nextMergeBatch(session)?.highlights).toHaveLength(12);
    const accepted = await acceptMergeBatch(snapshot(), session, [0, 4, 8].map(start => ({
      highlightIds: Array.from({ length: 4 }, (_, index) => `mark-${start + index}`), question,
    })));
    expect(accepted.cursor).toBe(8);
    expect(accepted.cards).toHaveLength(2);
    expect(nextMergeBatch(accepted)?.highlights.map(item => item.id)).toEqual(Array.from({ length: 7 }, (_, index) => `mark-${index + 8}`));
    await expect(validateMergeSession(accepted)).resolves.toEqual(accepted);
  });
  it('rejects invalid positions and empty selections before sending any originals', () => {
    const input = sources();
    delete input[0].highlight.range;
    expect(() => createMergeSession(snapshot(), input)).toThrow();
    expect(() => createMergeSession(snapshot(), [])).toThrow('没有');
  });
  it('rejects omitted/reordered/unknown IDs and corrupted stored originals', async () => {
    const session = createMergeSession(snapshot(), sources(2));
    for (const ids of [['mark-0'], ['mark-1', 'mark-0'], ['mark-0', 'unknown']]) {
      await expect(acceptMergeBatch(snapshot(), session, [{ highlightIds: ids, question }])).rejects.toThrow();
    }
    const accepted = await acceptMergeBatch(snapshot(), session, [{ highlightIds: ['mark-0', 'mark-1'], question }]);
    const corrupted = structuredClone(accepted);
    corrupted.cards[0].highlight.markText = '改写原文';
    await expect(validateMergeSession(corrupted)).rejects.toThrow();
    const wrongCursor = { ...accepted, cursor: 1 };
    await expect(validateMergeSession(wrongCursor)).rejects.toThrow();
  });
});
