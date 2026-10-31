// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOnlineBooks, loadOnlineProgress } from './weread-online';

const book = { bookId: 'book-1', title: 'Synthetic book', author: 'Synthetic author', highlightCount: 2 };
const signal = new AbortController().signal;
const unknownMetadata = { cover: null, markedFinished: null, thoughtsCount: null, bookmarkCount: null,
  totalNoteCount: null, lastNoteAt: null, readingProgress: null };

function reply(value: unknown) {
  const fetcher = vi.fn().mockResolvedValue(Response.json(value));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('online WeRead book selection metadata', () => {
  it('accepts validated metadata, distinguishes counts and only projects public selection fields', async () => {
    const metadata = { cover: 'https://covers.test/book.jpg', markedFinished: false, thoughtsCount: 40,
      bookmarkCount: 3, totalNoteCount: 45, lastNoteAt: '2025-05-30', readingProgress: null };
    const fetcher = reply({ books: [{ ...book, ...metadata, vid: 'synthetic-private', gateway: { raw: 'synthetic-private' } }], cursor: 1748563200 });
    expect(await loadOnlineBooks(null, signal)).toEqual({ books: [{ ...book, ...metadata }], cursor: 1748563200 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/weread/books', expect.objectContaining({ body: '{}', signal, credentials: 'same-origin' }));
  });
  it('accepts legacy responses without optional fields and never substitutes zeros or false', async () => {
    reply({ books: [book], cursor: null });
    expect(await loadOnlineBooks(null, signal)).toEqual({ books: [{ ...book, ...unknownMetadata }], cursor: null });
  });
  it('preserves real zero counts and an explicit false finish marker', async () => {
    reply({ books: [{ ...book, highlightCount: 0, ...unknownMetadata, thoughtsCount: 0, bookmarkCount: 0, totalNoteCount: 0, markedFinished: false }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0]).toMatchObject({ highlightCount: 0, thoughtsCount: 0, bookmarkCount: 0, totalNoteCount: 0, markedFinished: false });
  });
  it.each([null, -1, 0.5, '1', true, {}, Number.MAX_SAFE_INTEGER + 1])('degrades malformed optional counts %j without dropping the book', async count => {
    reply({ books: [{ ...book, thoughtsCount: count, bookmarkCount: count, totalNoteCount: count }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0]).toEqual({ ...book, ...unknownMetadata });
  });
  it.each([
    { thoughtsCount: 40, totalNoteCount: 42 },
    { thoughtsCount: 40, bookmarkCount: 3 },
    { thoughtsCount: 40, bookmarkCount: 3, totalNoteCount: 2 },
    { thoughtsCount: 40, bookmarkCount: 3, totalNoteCount: '45' },
    { thoughtsCount: Number.MAX_SAFE_INTEGER, bookmarkCount: 1, totalNoteCount: Number.MAX_SAFE_INTEGER },
  ])('requires a supplied complete, consistent safe total: %j', async counts => {
    reply({ books: [{ ...book, ...counts }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0].totalNoteCount).toBeNull();
  });
  it.each([null, '', 42, {}, 'http://covers.test/book.jpg', '//covers.test/book.jpg', 'https: covers.test/book.jpg',
    'javascript:alert(1)', 'data:image/png;base64,aGVsbG8=', 'https://user:password@covers.test/book.jpg',
    'https://user%40name@covers.test/book.jpg', 'https://covers.test/\nbook.jpg', 'https://covers.test/\\book.jpg',
    'https://covers.test/<script>', 'https://[invalid', `https://covers.test/${'a'.repeat(2048)}`,
  ])('drops unsafe or unbounded cover URL %j', async cover => {
    reply({ books: [{ ...book, cover }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0].cover).toBeNull();
  });
  it.each([1, 0, 'false', {}, null])('does not coerce finish marker %j into a boolean', async markedFinished => {
    reply({ books: [{ ...book, markedFinished }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0].markedFinished).toBeNull();
  });
  it.each(['2025-05-30', '2024-02-29', '1970-01-01', '9999-12-31'])('accepts a real ISO date %s', async lastNoteAt => {
    reply({ books: [{ ...book, lastNoteAt }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0].lastNoteAt).toBe(lastNoteAt);
  });
  it.each([null, 1748563200, '2025-02-29', '2025-02-30', '2025-04-31', '2025-13-01', '2025-01-00',
    '2025-5-30', '2025-05-30T00:00:00Z', 'not-a-date', {},
  ])('degrades invalid or non-date-only lastNoteAt %j', async lastNoteAt => {
    reply({ books: [{ ...book, lastNoteAt }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0].lastNoteAt).toBeNull();
  });
  it.each([0, 1, 45, 100, 0.5, '45'])('never interprets unverified notebook readingProgress %j as a percentage', async readingProgress => {
    const fetcher = reply({ books: [{ ...book, readingProgress }], cursor: null });
    expect((await loadOnlineBooks(null, signal)).books[0].readingProgress).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('forwards the numeric cursor unchanged and accepts an empty final page', async () => {
    const fetcher = reply({ books: [book], cursor: 0 });
    expect((await loadOnlineBooks(1748563200, signal)).cursor).toBe(0);
    expect(fetcher).toHaveBeenCalledWith('/api/weread/books', expect.objectContaining({ body: '{"cursor":1748563200}', signal }));
    fetcher.mockResolvedValue(Response.json({ books: [], cursor: null }));
    expect(await loadOnlineBooks(0, signal)).toEqual({ books: [], cursor: null });
  });
  it.each([undefined, -1, 0.5, '0', true, Number.MAX_SAFE_INTEGER + 1])('rejects malformed cursor %j', async cursor => {
    reply({ books: [book], cursor });
    await expect(loadOnlineBooks(null, signal)).rejects.toThrow('在线书籍列表无效');
  });
  it.each([null, [], {}, { books: [null], cursor: null }, { books: [false], cursor: null }, { books: Array(201).fill(book), cursor: null }])('still rejects malformed required response structure', async value => {
    reply(value);
    await expect(loadOnlineBooks(null, signal)).rejects.toThrow();
  });
  it.each([undefined, null, -1, 0.5, '2', true, Number.MAX_SAFE_INTEGER + 1])('still rejects invalid required highlight count %j', async highlightCount => {
    reply({ books: [{ ...book, highlightCount }], cursor: null });
    await expect(loadOnlineBooks(null, signal)).rejects.toThrow('在线划线数量无效');
  });
  it.each([{ title: '<script>execute</script>' }, { bookId: '' }, { author: { raw: 'not-an-author' } }])('retains existing required book text validation', async invalid => {
    reply({ books: [{ ...book, ...invalid }], cursor: null });
    await expect(loadOnlineBooks(null, signal)).rejects.toThrow();
  });
});

describe('authoritative online WeRead progress', () => {
  it.each([0, 1, 45, 99, 100])('returns integer percentage %i without rescaling', async readingProgress => {
    const fetcher = reply({ bookId: book.bookId, readingProgress, vid: 'synthetic-private' });
    expect(await loadOnlineProgress(book.bookId, signal)).toBe(readingProgress);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/weread/progress', expect.objectContaining({ body: '{"bookId":"book-1"}', signal, credentials: 'same-origin' }));
  });
  it.each([undefined, null, '1', true, -1, 101, 0.5, {}, Number.MAX_SAFE_INTEGER + 1])('keeps malformed or missing authoritative progress %j unknown', async readingProgress => {
    reply({ bookId: book.bookId, readingProgress });
    expect(await loadOnlineProgress(book.bookId, signal)).toBeNull();
  });
  it.each([null, {}, { bookId: 'book-2', readingProgress: 100 }])('rejects responses without matching book identity', async value => {
    reply(value);
    await expect(loadOnlineProgress(book.bookId, signal)).rejects.toThrow('在线阅读进度来源不一致');
  });
});
