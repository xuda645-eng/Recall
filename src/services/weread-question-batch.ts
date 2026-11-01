import { generateWereadQuestion } from './weread-online';

export const WEREAD_AI_CONCURRENCY = 4;
type QuestionResult = Awaited<ReturnType<typeof generateWereadQuestion>>;

export async function generateWereadQuestions<Candidate extends { highlight: { markText: string } }>(
  candidates: readonly Candidate[], summary: boolean, signal: AbortSignal,
  onResult: (candidate: Candidate, result: QuestionResult) => void | Promise<void>,
  onError?: (candidate: Candidate, error: unknown) => void,
): Promise<void> {
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  let saves = Promise.resolve();
  async function worker(): Promise<void> {
    while (!failed && !signal.aborted && cursor < candidates.length) {
      const candidate = candidates[cursor++];
      try {
        const result = await generateWereadQuestion(candidate.highlight.markText, summary, signal);
        if (signal.aborted) return;
        saves = saves.catch(() => undefined).then(async () => {
          if (!signal.aborted) await onResult(candidate, result);
        });
        await saves;
      } catch (error) {
        if (!failed) { failed = true; failure = error; }
        if (!signal.aborted) onError?.(candidate, error);
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(WEREAD_AI_CONCURRENCY, candidates.length) }, worker));
  if (failed) throw failure;
}
