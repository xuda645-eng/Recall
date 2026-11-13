import { describe, expect, it, vi } from 'vitest';
import { WereadEngine, type WereadRepository } from '../server/weread';

const credentials = { WEREAD_API_KEY: 'synthetic-weread', ARK_API_KEY: 'synthetic-ark',
  ARK_ENDPOINT_ID: 'ep-synthetic', ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3' };
const now = Date.UTC(2026, 10, 13);
function fixture() {
  const usage = new Map<string, number>(), cache = new Map<string, { value: string; expires: number }>();
  const repository: WereadRepository = {
    async connected(owner) { return ['123', '456'].includes(owner); },
    async take(owner, bucket, window, maximum) {
      const key = `${owner}:${bucket}:${window}`, attempts = usage.get(key) || 0;
      if (attempts >= maximum) return false;
      usage.set(key, attempts + 1); return true;
    },
    async attempts(owner, bucket, window) { return usage.get(`${owner}:${bucket}:${window}`) || 0; },
    async cached(owner, hash, timestamp) { const stored = cache.get(`${owner}:${hash}`); return stored && stored.expires > timestamp ? stored.value : null; },
    async cache(owner, hash, value, expires) { cache.set(`${owner}:${hash}`, { value, expires }); },
  };
  const transport = vi.fn<typeof fetch>(async () => Response.json({ status: 'completed', output: [
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ question: '核对结论时，先区分什么？', summary: null }) }] },
  ] }));
  return { usage, cache, repository, transport, engine: new WereadEngine(repository, () => credentials, transport, () => now) };
}
describe('Miaoda owner-scoped WeRead backend', () => {
  it('does not equate platform login with ownership of the shared credential', async () => {
    const { engine, transport } = fixture();
    expect(await engine.status('999')).toEqual({ available: false, aiAvailable: false });
    await expect(engine.call('999', 'books', {})).rejects.toMatchObject({ status: 403 });
    await expect(engine.call('invalid', 'books', {})).rejects.toMatchObject({ status: 401 });
    expect(transport).not.toHaveBeenCalled();
  });
  it('reports missing model settings without disabling text reads', async () => {
    const { repository, transport } = fixture();
    const engine = new WereadEngine(repository, () => ({ WEREAD_API_KEY: 'synthetic' }), transport);
    expect(await engine.status('123')).toEqual({ available: true, aiAvailable: false });
    await expect(engine.call('123', 'question', { markText: '合成原文', summary: false })).rejects.toMatchObject({ status: 503 });
    expect(transport).not.toHaveBeenCalled();
  });
  it('uses fixed native contract, flattened pagination and authentic highlight counts', async () => {
    const { engine, transport } = fixture();
    transport.mockResolvedValueOnce(Response.json({ errcode: 0, hasMore: 1, books: [
      { bookId: 'sample', book: { title: '合成书', author: '测试作者' }, noteCount: 2, reviewCount: 3, bookmarkCount: 4, sort: 100 },
    ] }));
    const value = await engine.call('123', 'books', { cursor: 200 });
    expect(value).toMatchObject({ books: [{ highlightCount: 2, totalNoteCount: 9 }], cursor: 100 });
    expect(transport.mock.calls[0][0]).toBe('https://i.weread.qq.com/api/agent/gateway');
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ api_name: '/user/notebooks', skill_version: '1.0.5', count: 20, lastSort: 200 });
    await expect(engine.call('123', 'books', { params: {} })).rejects.toMatchObject({ status: 400 });
  });
  it('preserves original highlight whitespace and stable locations', async () => {
    const { engine, transport } = fixture();
    transport.mockResolvedValueOnce(Response.json({ book: { title: '合成书' }, chapters: [{ chapterUid: 1, chapterIdx: 2, title: '合成章' }], updated: [
      { bookId: 'sample', bookmarkId: 'mark', type: 1, markText: '  合成原文\n不改写。  ', chapterUid: 1, range: '10-20' },
    ] }));
    expect(await engine.call('123', 'book', { bookId: 'sample' })).toMatchObject({ books: [{ highlights: [
      { bookmarkId: 'mark', markText: '  合成原文\n不改写。  ', chapterIdx: 2, range: '10-20' },
    ] }] });
  });
  it('pauses on gateway upgrades and never discloses upstream details', async () => {
    const { engine, transport } = fixture();
    transport.mockResolvedValueOnce(Response.json({ upgrade_info: { message: 'private-detail' } }));
    await expect(engine.call('123', 'books', {})).rejects.toMatchObject({ status: 503 });
    transport.mockResolvedValueOnce(new Response('synthetic-secret-detail', { status: 401 }));
    await expect(engine.call('123', 'books', {})).rejects.toThrow('上游服务暂不可用');
  });
  it('shares successful question cache only within one owner and counts failed attempts', async () => {
    const { engine, transport } = fixture();
    const input = { markText: '合成文字，不是私人划线。', summary: false };
    expect(await engine.call('123', 'question', input)).toMatchObject({ cached: false });
    expect(await engine.call('123', 'question', input)).toMatchObject({ cached: true });
    expect(await engine.call('456', 'question', input)).toMatchObject({ cached: false });
    expect(transport).toHaveBeenCalledTimes(2);
    transport.mockResolvedValueOnce(Response.json({ status: 'completed', output: [] }));
    await expect(engine.call('123', 'question', { ...input, markText: '另一段合成文字。' })).rejects.toMatchObject({ status: 502 });
    expect(await engine.call('123', 'budget', {})).toEqual({ remaining: 298 });
  });
  it('does not cross an hourly boundary under concurrent calls', async () => {
    const { engine, usage, transport } = fixture();
    transport.mockImplementation(async () => Response.json({ books: [], hasMore: 0 }));
    const results = await Promise.allSettled(Array.from({ length: 150 }, () => engine.call('123', 'books', {})));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(120);
    expect(transport).toHaveBeenCalledTimes(120);
    expect(usage.get(`123:weread:${now}`)).toBe(120);
  });
  it('validates and reuses merge cache without rewriting or losing highlight identifiers', async () => {
    const { engine, transport } = fixture();
    const batch = { bookId: 'synthetic-book', chapterUid: 'chapter', chapterIdx: 1, highlights: [
      { id: 'original-a', markText: '合成定义。', range: '10-20' },
      { id: 'original-b', markText: '合成解释。', range: '30-40' },
    ] };
    transport.mockResolvedValueOnce(Response.json({ status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ cards: [
        { highlightIds: ['H001', 'H002'], question: '合成定义与解释共同描述什么？' },
      ] }) }] },
    ] }));
    const result = await engine.call('123', 'merge', batch);
    expect(result).toEqual({ cached: false, cards: [{ highlightIds: ['original-a', 'original-b'], question: '合成定义与解释共同描述什么？' }] });
    expect(await engine.call('123', 'merge', batch)).toEqual({ ...result as object, cached: true });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await engine.call('123', 'budget', {})).toEqual({ remaining: 299 });
    transport.mockResolvedValueOnce(Response.json({ status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ cards: [
        { highlightIds: ['H002', 'H001'], question: '合成定义与解释共同描述什么？' },
      ] }) }] },
    ] }));
    await expect(engine.call('456', 'merge', batch)).rejects.toMatchObject({ status: 502 });
    expect(await engine.call('456', 'budget', {})).toEqual({ remaining: 299 });
    expect(await engine.call('123', 'budget', {})).toEqual({ remaining: 299 });
  });
  it('requires a configured owned connection even for AI-only operations', async () => {
    const { repository, transport } = fixture();
    const engine = new WereadEngine(repository, () => ({ ...credentials, WEREAD_API_KEY: undefined }), transport);
    expect(await engine.status('123')).toEqual({ available: false, aiAvailable: false });
    await expect(engine.call('123', 'budget', {})).rejects.toMatchObject({ status: 503 });
    expect(transport).not.toHaveBeenCalled();
  });
  it('does not confuse invalid model credentials with revoked Feishu account ownership', async () => {
    const { engine, transport } = fixture();
    transport.mockResolvedValueOnce(new Response('synthetic-private-detail', { status: 401 }));
    await expect(engine.call('123', 'question', { markText: '合成原文。', summary: false })).rejects.toMatchObject({ status: 503 });
    expect(await engine.call('123', 'budget', {})).toEqual({ remaining: 299 });
    transport.mockResolvedValueOnce(Response.json({ books: [], hasMore: 0 }));
    expect(await engine.call('123', 'books', {})).toEqual({ books: [], cursor: null });
  });
  it('rejects exhausted model budget before contacting the model', async () => {
    const { engine, usage, transport } = fixture();
    usage.set(`123:ai-model:${now}`, 300);
    await expect(engine.call('123', 'question', { markText: '合成原文。', summary: false })).rejects.toMatchObject({ status: 429 });
    expect(transport).not.toHaveBeenCalled();
    expect(await engine.call('123', 'budget', {})).toEqual({ remaining: 0 });
  });
});
