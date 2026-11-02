// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MergeBatch } from '../../shared/weread-merge';
import { generateWereadMerge, loadOnlineBook } from './weread-online';

const signal = new AbortController().signal;
const question = 'Which observations support the stated conclusion?';
const batch: MergeBatch = { bookId: 'book-1', chapterUid: 'chapter-1', chapterIdx: 0, chapterTitle: 'Synthetic chapter', highlights: [
  { id: 'mark-1', markText: '  Original first observation.\nUnchanged.  ', range: '2-100' },
  { id: 'mark-2', markText: 'Original second observation.', range: '10-4' },
  { id: 'mark-3', markText: 'Original third observation.', range: '20-0' },
] };
const cards = [{ highlightIds: ['mark-1', 'mark-2'], question }, { highlightIds: ['mark-3'], question }];

function reply(value: unknown) {
  const fetcher = vi.fn().mockResolvedValue(Response.json(value));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('bounded WeRead merge transport', () => {
  it.each([true, false, undefined])('validates the full partition and only sends same-origin nonsecret batch data (cached=%j)', async cached => {
    const fetcher = reply({ cards, ...(cached === undefined ? {} : { cached }) });
    const input = structuredClone(batch);
    expect(await generateWereadMerge(input, signal)).toEqual(cards);
    expect(input).toEqual(batch);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/weread/merge', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch), signal });
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
  it.each([null, {}, { ...batch, token: 'synthetic-only' }, { ...batch, chapterIdx: -1 },
    { ...batch, highlights: [] }, { ...batch, highlights: [...batch.highlights].reverse() },
    { ...batch, highlights: [batch.highlights[0], { ...batch.highlights[1], range: '02-1' }] },
    { ...batch, highlights: [{ ...batch.highlights[0], id: 'x'.repeat(201) }] },
    { ...batch, highlights: [{ ...batch.highlights[0], markText: 'x'.repeat(6001) }] },
    { ...batch, highlights: [{ ...batch.highlights[0], markText: '<script>run</script>' }] },
    { ...batch, highlights: [{ ...batch.highlights[0], cookie: 'synthetic-only' }] },
    { ...batch, highlights: Array.from({ length: 13 }, (_, index) => ({ id: `mark-${index}`, markText: 'original', range: `${index}-0` })) },
  ])('rejects invalid or credential-bearing input before fetch: %j', async input => {
    const fetcher = reply({ cards });
    await expect(generateWereadMerge(input as MergeBatch, signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { cards: [] }, { cards, cached: 'true' }, { cards, token: 'synthetic-only' },
    { cards, answer: 'not allowed' }, { cards: [{ highlightIds: ['unknown'], question }] },
    { cards: [{ highlightIds: ['mark-1', 'mark-1'], question }, { highlightIds: ['mark-2', 'mark-3'], question }] },
    { cards: [{ highlightIds: ['mark-2', 'mark-1', 'mark-3'], question }] },
    { cards: [{ highlightIds: ['mark-1', 'mark-3'], question }, { highlightIds: ['mark-2'], question }] },
    { cards: [{ highlightIds: ['mark-1', 'mark-2'], question }] },
    { cards: [{ highlightIds: [], question }, ...cards] },
    { cards: cards.map(card => ({ ...card, summary: null })) },
    { cards: cards.map(card => ({ ...card, question: 'short' })) },
    { cards: cards.map(card => ({ ...card, question: '<script>unsafe question</script>' })) },
  ])('rejects malformed, unsafe, unknown, duplicate, reordered or incomplete response: %j', async value => {
    reply(value);
    await expect(generateWereadMerge(batch, signal)).rejects.toThrow();
  });
  it('rejects five members even when all IDs occur in input order', async () => {
    const input = { ...batch, highlights: Array.from({ length: 5 }, (_, index) => ({ id: `mark-${index}`, markText: 'original', range: `${index}-0` })) };
    reply({ cards: [{ highlightIds: input.highlights.map(highlight => highlight.id), question }] });
    await expect(generateWereadMerge(input, signal)).rejects.toThrow();
  });
  it('snapshots input before the async request so caller changes cannot alter response validation', async () => {
    const input = structuredClone(batch);
    const fetcher = vi.fn().mockImplementation(() => {
      input.highlights[0].id = 'changed-after-send';
      return Promise.resolve(Response.json({ cards }));
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await generateWereadMerge(input, signal)).toEqual(cards);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(batch);
  });
  it.each([401, 429, 503, 502])('uses safe existing transport errors without returning upstream details: %i', async status => {
    const response = new Response('synthetic-private-upstream-detail', { status });
    const cancel = vi.spyOn(response.body!, 'cancel');
    const fetcher = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetcher);
    await expect(generateWereadMerge(batch, signal)).rejects.not.toThrow('synthetic-private-upstream-detail');
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('forwards cancellation with no retries or background writes', async () => {
    const aborter = new AbortController();
    aborter.abort();
    const fetcher = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetcher);
    await expect(generateWereadMerge(batch, aborter.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].signal).toBe(aborter.signal);
  });
});

describe('online highlight metadata compatibility', () => {
  const highlight = { bookmarkId: 'mark-1', markText: batch.highlights[0].markText, chapterUid: 'chapter-1', chapterTitle: 'Synthetic chapter' };
  const exported = (highlights: unknown[]) => ({ format: 'recall-weread-export-v1', books: [{ bookId: 'book-1', title: 'Synthetic book', highlights }] });
  it('preserves exact optional metadata and original highlight order without parsing range as end/length', async () => {
    reply(exported([{ ...highlight, chapterIdx: 0, range: '0020-4' }, { ...highlight, bookmarkId: 'mark-2', chapterIdx: 0, range: '2-100' }]));
    const book = await loadOnlineBook('book-1', signal);
    expect(book.highlights).toEqual([{ ...highlight, question: undefined, recallKind: undefined, aiSummary: undefined, chapterIdx: 0, range: '0020-4' },
      { ...highlight, bookmarkId: 'mark-2', question: undefined, recallKind: undefined, aiSummary: undefined, chapterIdx: 0, range: '2-100' }]);
  });
  it.each([{ chapterIdx: undefined, range: undefined }, { chapterIdx: -1, range: 'invalid' },
    { chapterIdx: '0', range: 20 }, { chapterIdx: 0.5, range: '1.5-2' }, { chapterIdx: null, range: '1-2\n' },
  ])('omits missing or malformed optional metadata without breaking single-highlight loading: %j', async metadata => {
    reply(exported([{ ...highlight, ...metadata }]));
    const book = await loadOnlineBook('book-1', signal);
    expect(book.highlights[0]).toMatchObject(highlight);
    expect(book.highlights[0]).not.toHaveProperty('chapterIdx');
    expect(book.highlights[0]).not.toHaveProperty('range');
  });
  it('does not drop unrelated credential fields to make a hostile export pass validation', async () => {
    reply(exported([{ ...highlight, chapterIdx: 0, range: '2-4', cookie: 'synthetic-only' }]));
    await expect(loadOnlineBook('book-1', signal)).rejects.toThrow();
  });
});
