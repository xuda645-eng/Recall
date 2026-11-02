// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWereadQuestion } from './weread-online';
import { generateWereadQuestions } from './weread-question-batch';

vi.mock('./weread-online', () => ({ generateWereadQuestion: vi.fn() }));
const generator = vi.mocked(generateWereadQuestion);
const candidates = Array.from({ length: 9 }, (_, index) => ({ id: `mark-${index}`, highlight: { markText: `Synthetic highlight ${index}` } }));
const result = (text: string): Awaited<ReturnType<typeof generateWereadQuestion>> => ({ question: `Question for ${text}?`, summary: null });
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
afterEach(() => vi.resetAllMocks());

describe('bounded WeRead AI generation', () => {
  it('starts four, refills when saved, serializes out-of-order results and retains candidate identities', async () => {
    const requests = candidates.map(() => deferred<ReturnType<typeof result>>());
    generator.mockImplementation(text => requests[candidates.findIndex(item => item.highlight.markText === text)].promise);
    const save = deferred<void>();
    const accepted: string[] = [];
    const onResult = vi.fn(async (candidate: typeof candidates[number], reply: ReturnType<typeof result>) => {
      expect(reply).toEqual(result(candidate.highlight.markText));
      accepted.push(candidate.id);
      if (candidate.id === 'mark-2') await save.promise;
    });
    const signal = new AbortController().signal;
    const batch = generateWereadQuestions(candidates, true, signal, onResult);
    expect(generator).toHaveBeenCalledTimes(4);
    requests[2].resolve(result(candidates[2].highlight.markText));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    requests[0].resolve(result(candidates[0].highlight.markText));
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(generator).toHaveBeenCalledTimes(4);
    save.resolve();
    await vi.waitFor(() => expect(generator).toHaveBeenCalledTimes(6));
    for (const [index, request] of requests.entries()) request.resolve(result(candidates[index].highlight.markText));
    await batch;
    expect(accepted.slice(0, 2)).toEqual(['mark-2', 'mark-0']);
    expect(new Set(accepted).size).toBe(9);
    expect(generator).toHaveBeenCalledTimes(9);
    expect(generator).toHaveBeenCalledWith(candidates[0].highlight.markText, true, signal);
  });
  it.each(['upstream failure', 'rate limit'])('stops dispatch on %s but drains and saves in-flight successes before rejecting', async reason => {
    const requests = candidates.map(() => deferred<ReturnType<typeof result>>());
    generator.mockImplementation(text => requests[candidates.findIndex(item => item.highlight.markText === text)].promise);
    const accepted: string[] = [];
    const onError = vi.fn();
    const batch = generateWereadQuestions(candidates, false, new AbortController().signal, candidate => { accepted.push(candidate.id); }, onError);
    const failure = new Error(reason);
    const completion = expect(batch).rejects.toBe(failure);
    requests[1].reject(failure);
    await vi.waitFor(() => expect(generator).toHaveBeenCalledTimes(4));
    for (const index of [0, 2, 3]) requests[index].resolve(result(candidates[index].highlight.markText));
    await completion;
    expect(generator).toHaveBeenCalledTimes(4);
    expect(accepted.sort()).toEqual(['mark-0', 'mark-2', 'mark-3']);
    expect(onError).toHaveBeenCalledExactlyOnceWith(candidates[1], failure);
  });
  it('stops dispatch on save failure while merging other in-flight results for recovery', async () => {
    generator.mockImplementation(async text => result(text));
    const accepted: string[] = [];
    const failure = new Error('disk unavailable');
    await expect(generateWereadQuestions(candidates, false, new AbortController().signal, candidate => {
      accepted.push(candidate.id);
      if (candidate.id === 'mark-0') throw failure;
    })).rejects.toBe(failure);
    expect(generator).toHaveBeenCalledTimes(4);
    expect(accepted).toEqual(['mark-0', 'mark-1', 'mark-2', 'mark-3']);
  });
  it('ignores late results on pause, stops dispatch, and retries only pending candidates', async () => {
    const requests = candidates.map(() => deferred<ReturnType<typeof result>>());
    generator.mockImplementation(text => requests[candidates.findIndex(item => item.highlight.markText === text)].promise);
    const controller = new AbortController();
    const accepted: string[] = [];
    const accept = (candidate: typeof candidates[number]) => { accepted.push(candidate.id); };
    const batch = generateWereadQuestions(candidates, false, controller.signal, accept);
    requests[0].resolve(result(candidates[0].highlight.markText));
    await vi.waitFor(() => expect(generator).toHaveBeenCalledTimes(5));
    controller.abort();
    for (const [index, request] of requests.entries()) request.resolve(result(candidates[index].highlight.markText));
    await batch;
    expect(accepted).toEqual(['mark-0']);
    generator.mockClear().mockImplementation(async text => result(text));
    await generateWereadQuestions(candidates.filter(candidate => !accepted.includes(candidate.id)), false, new AbortController().signal, accept);
    expect(generator).toHaveBeenCalledTimes(8);
    expect(generator).not.toHaveBeenCalledWith(candidates[0].highlight.markText, false, expect.anything());
    expect(new Set(accepted).size).toBe(9);
  });
  it('does not apply queued saves after a pause while allowing the active save to finish', async () => {
    generator.mockImplementation(async text => result(text));
    const controller = new AbortController();
    const save = deferred<void>();
    const onResult = vi.fn(() => save.promise);
    const batch = generateWereadQuestions(candidates, false, controller.signal, onResult);
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledOnce());
    controller.abort(); save.resolve();
    await batch;
    expect(onResult).toHaveBeenCalledOnce();
    expect(generator).toHaveBeenCalledTimes(4);
  });
  it('limits short batches and does not call AI for empty or already-aborted batches', async () => {
    generator.mockImplementation(async text => result(text));
    const onResult = vi.fn();
    await generateWereadQuestions(candidates.slice(0, 2), false, new AbortController().signal, onResult);
    expect(generator).toHaveBeenCalledTimes(2);
    const controller = new AbortController(); controller.abort();
    await generateWereadQuestions(candidates, false, controller.signal, onResult);
    await generateWereadQuestions([], false, new AbortController().signal, onResult);
    expect(generator).toHaveBeenCalledTimes(2);
  });
});
