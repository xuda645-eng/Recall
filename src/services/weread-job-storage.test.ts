import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWereadBudget } from './weread-job-storage';

afterEach(() => { vi.unstubAllGlobals(); });

describe('WeRead daily budget validation', () => {
  it.each([1, 100, 101, 299, 300])('accepts remaining budget %i up to the owner-approved 300', async remaining => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ remaining }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    await expect(checkWereadBudget(1, signal)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith('/api/weread/budget', expect.objectContaining({ body: '{}', credentials: 'same-origin', signal }));
  });
  it.each([-1, 0.5, '300', 301, null])('rejects invalid or out-of-range budget %j', async remaining => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ remaining })));
    await expect(checkWereadBudget(1, new AbortController().signal)).rejects.toThrow('AI 额度响应无效');
  });
  it('retains the budget gate when the requested scope exceeds the remainder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ remaining: 0 })));
    await expect(checkWereadBudget(1, new AbortController().signal)).rejects.toThrow('今日最多还可尝试 0');
  });
  it.each([21, 101, 300])('accepts a %i-question scope when daily budget is sufficient', async count => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ remaining: 300 })));
    await expect(checkWereadBudget(count, new AbortController().signal)).resolves.toBeUndefined();
  });
  it('rejects a large scope exceeding the remaining daily budget before sending originals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ remaining: 100 })));
    await expect(checkWereadBudget(101, new AbortController().signal)).rejects.toThrow('今日最多还可尝试 100');
  });
  it('does not request a budget when no model attempts are needed', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await checkWereadBudget(0, new AbortController().signal);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
