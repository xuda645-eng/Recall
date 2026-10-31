import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { default_w } from 'ts-fsrs';
import { createSeedSnapshot } from '@/data/seed';
import { MemoryReviewPlanEditor } from '@/components/memory-review-plan';
import { commitMemory } from '@/services/memory-actions';
import { buildExportPayload, mergeImportPayload, parseImportPayload } from '@/services/import-export';
import { getRecallRepository } from '@/services/repository';
import { applyReview, getCustomWeights, setCustomWeights } from '@/services/fsrs-engine';
import * as fsrsEngine from '@/services/fsrs-engine';
import { DEFAULT_FIXED_INTERVALS, normalizeMemoryReviewPlan, previewMemoryReview, reviewFingerprint } from '@/services/memory-review';
import type { Card, RecallSettings, RecallStateSnapshot, ReviewRating } from '@/types';

let editorSnapshot: RecallStateSnapshot;
vi.mock('@/stores/recall-store', () => ({
  useRecallStore: (selector: (state: RecallStateSnapshot) => unknown) => selector(editorSnapshot),
}));
vi.mock('@/services/memory-actions', () => ({ commitMemory: vi.fn() }));
vi.mock('@/db/client', () => ({ getTauriSqlExecutor: async () => null, isTauriRuntime: () => false }));

const MINUTE = 60_000;
const DAY = 86_400_000;
const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
const at = new Date('2026-10-31T04:00:00.000Z');

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'review-card', deckId: 'deck-1', front: '问题', back: '正文', hint: '', source: '',
    tags: ['history'], cardType: 'basic', state: 'review',
    lastReviewDate: '2026-10-26T04:00:00.000Z', nextReviewDate: at.toISOString(),
    stability: 5, difficulty: 4, elapsedDays: 5, scheduledDays: 5,
    reps: 10, lapses: 2, learningSteps: 0,
    createdAt: '2026-09-01T04:00:00.000Z', updatedAt: '2026-10-26T04:00:00.000Z',
    ...overrides,
  };
}

function makeSettings(overrides: Partial<RecallSettings> = {}): RecallSettings {
  return { ...createSeedSnapshot(at).settings, ...overrides };
}

function expectedSmartChoice(card: Card, rating: ReviewRating, settings: RecallSettings, reviewedAt = at): Card {
  const reviewed = applyReview(card, rating, reviewedAt, settings.desiredRetention);
  if ((rating === 'good' || rating === 'easy')
    && Date.parse(reviewed.nextReviewDate) < reviewedAt.getTime() + DAY) {
    return { ...reviewed, nextReviewDate: new Date(reviewedAt.getTime() + DAY).toISOString(), scheduledDays: 1 };
  }
  return reviewed;
}

beforeEach(() => { setCustomWeights(null); });
afterEach(() => { setCustomWeights(null); cleanup(); vi.clearAllMocks(); });

describe('normalizeMemoryReviewPlan', () => {
  it.each([undefined, null, [], true, 'fixed', 1, {}, { mode: 'unknown' }])('defaults safely for %j', plan => {
    expect(normalizeMemoryReviewPlan(plan)).toEqual({ mode: 'smart', intervals: DEFAULT_FIXED_INTERVALS });
  });

  it('uses the 1 minute / 1 day / 30 day / 180 day preset', () => {
    expect(DEFAULT_FIXED_INTERVALS).toEqual({ again: MINUTE, hard: DAY, good: 30 * DAY, easy: 180 * DAY });
  });

  it('accepts strictly increasing integer milliseconds including both bounds', () => {
    const intervals = { again: MINUTE, hard: MINUTE + 1, good: DAY, easy: 365 * DAY };
    const normalized = normalizeMemoryReviewPlan({ mode: 'fixed', intervals, ignored: true });
    expect(normalized).toEqual({ mode: 'fixed', intervals });
    expect(normalized.intervals).not.toBe(intervals);
  });

  it.each([
    { again: MINUTE - 1 }, { again: 0 }, { again: -MINUTE }, { again: '60000' },
    { again: MINUTE + 0.5 }, { again: NaN }, { easy: Infinity }, { easy: 365 * DAY + 1 },
    { hard: MINUTE }, { good: MINUTE }, { easy: 30 * DAY }, { hard: undefined },
  ])('rejects the entire invalid interval set %j', invalid => {
    const plan = { mode: 'fixed', intervals: { ...DEFAULT_FIXED_INTERVALS, ...invalid } };
    expect(normalizeMemoryReviewPlan(plan)).toEqual({ mode: 'fixed', intervals: DEFAULT_FIXED_INTERVALS });
  });

  it.each([null, [], {}, 'intervals'])('falls back when the interval record is invalid: %j', intervals => {
    expect(normalizeMemoryReviewPlan({ mode: 'fixed', intervals })).toEqual({ mode: 'fixed', intervals: DEFAULT_FIXED_INTERVALS });
  });

  it.each(['smart', 'fixed'] as const)('rejects strictly ordered sub-day Good/Easy intervals in %s mode', mode => {
    for (const intervals of [
      { again: MINUTE, hard: 2 * MINUTE, good: 3 * MINUTE, easy: 4 * MINUTE },
      { again: MINUTE, hard: 2 * MINUTE, good: DAY - 1, easy: DAY + 1 },
    ]) {
      expect(normalizeMemoryReviewPlan({ mode, intervals })).toEqual({ mode, intervals: DEFAULT_FIXED_INTERVALS });
    }
  });

  it('returns independent defaults and preserves valid smart-mode interval drafts', () => {
    const normalized = normalizeMemoryReviewPlan(undefined);
    normalized.intervals.again = 2 * MINUTE;
    expect(normalizeMemoryReviewPlan(undefined).intervals.again).toBe(MINUTE);
    const intervals = { ...DEFAULT_FIXED_INTERVALS, again: 2 * MINUTE };
    expect(normalizeMemoryReviewPlan({ mode: 'smart', intervals })).toEqual({ mode: 'smart', intervals });
  });
});

describe('previewMemoryReview', () => {
  it.each(['new', 'learning', 'review', 'relearning'] as const)('uses real applyReview choices in %s state', state => {
    const card = makeCard({ state, learningSteps: state === 'learning' ? 1 : 0 });
    const settings = makeSettings({ desiredRetention: 0.95 });
    const original = structuredClone({ card, settings });
    const preview = previewMemoryReview(card, settings, at);
    expect(preview.cardId).toBe(card.id);
    expect(preview.reviewedAt).toBe(at.toISOString());
    expect(preview.fingerprint).toBe(reviewFingerprint(card, settings));
    for (const rating of RATINGS) {
      expect(preview.choices[rating].card).toEqual(expectedSmartChoice(card, rating, settings));
      expect(preview.choices[rating].label).toMatch(/分钟|小时|天|立即复习/);
    }
    expect({ card, settings }).toEqual(original);
  });

  it('uses supplied retention rather than the default', () => {
    const card = makeCard();
    const normal = previewMemoryReview(card, makeSettings({ desiredRetention: 0.7 }), at);
    const higher = previewMemoryReview(card, makeSettings({ desiredRetention: 0.99 }), at);
    expect(higher.choices.good.card.scheduledDays).toBeLessThan(normal.choices.good.card.scheduledDays);
  });

  it('uses settings weights even if global weights are stale, then restores them', () => {
    const customWeights = [...default_w];
    customWeights[2] *= 1.5;
    const settings = makeSettings({ fsrsWeights: customWeights });
    const card = makeCard({ state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0 });
    setCustomWeights(customWeights);
    const expected = expectedSmartChoice(card, 'good', settings);
    const previous = [...default_w];
    previous[2] *= 0.8;
    setCustomWeights(previous);
    const preview = previewMemoryReview(card, settings, at);
    expect(preview.choices.good.card).toEqual(expected);
    expect(getCustomWeights()).toBe(previous);
    expect(preview.choices.good.card.stability).not.toBe(applyReview(card, 'good', at).stability);
  });

  it('uses default weights when settings specify null and restores weights on failure', () => {
    const card = makeCard();
    const expected = applyReview(card, 'good', at);
    const previous = [...default_w];
    previous[2] *= 1.5;
    setCustomWeights(previous);
    expect(previewMemoryReview(card, makeSettings(), at).choices.good.card).toEqual(expected);
    expect(getCustomWeights()).toBe(previous);
    const scheduler = vi.spyOn(fsrsEngine, 'applyReview').mockImplementationOnce(() => { throw new Error('scheduler failed'); });
    try {
      expect(() => previewMemoryReview(card, makeSettings(), at)).toThrow('scheduler failed');
      expect(getCustomWeights()).toBe(previous);
    } finally {
      scheduler.mockRestore();
    }
  });

  it('overrides only due date and scheduled days for fixed choices without resetting history', () => {
    const card = makeCard();
    const settings = makeSettings({ reviewPlan: { mode: 'fixed', intervals: { ...DEFAULT_FIXED_INTERVALS } } });
    const preview = previewMemoryReview(card, settings, at);
    const labels = { again: '1 分钟', hard: '1 天', good: '30 天', easy: '180 天' };
    for (const rating of RATINGS) {
      const interval = DEFAULT_FIXED_INTERVALS[rating];
      const next = preview.choices[rating].card;
      expect(next).toEqual({
        ...applyReview(card, rating, at, settings.desiredRetention),
        nextReviewDate: new Date(at.getTime() + interval).toISOString(), scheduledDays: interval / DAY,
      });
      expect(next.reps).toBe(card.reps + 1);
      expect(next.lapses).toBe(card.lapses + (rating === 'again' ? 1 : 0));
      expect(next.stability).toBeGreaterThan(0);
      expect(next.createdAt).toBe(card.createdAt);
      expect(preview.choices[rating].label).toBe(labels[rating]);
    }
    expect(preview.choices.again.card.state).toBe('relearning');
    expect(card.reps).toBe(10);
  });

  it('keeps learning steps and allows fixed sub-day intervals', () => {
    const card = makeCard({ state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0 });
    const intervals = { again: MINUTE, hard: 90 * MINUTE, good: DAY, easy: 365 * DAY };
    const preview = previewMemoryReview(card, makeSettings({ reviewPlan: { mode: 'fixed', intervals } }), at);
    expect(preview.choices.good.card.learningSteps).toBe(applyReview(card, 'good', at).learningSteps);
    expect(preview.choices.hard.card.scheduledDays).toBe(90 * MINUTE / DAY);
    expect(preview.choices.hard.label).toBe('1.5 小时');
  });

  it.each([
    '2026-11-01T00:30:00.123-04:00',
    '2026-03-08T01:30:00.123-05:00',
  ])('floors Good/Easy at an exact elapsed 24 hours from %s without resetting FSRS learning', timestamp => {
    const reviewedAt = new Date(timestamp);
    const card = makeCard({
      state: 'new', lastReviewDate: null, nextReviewDate: reviewedAt.toISOString(),
      stability: 0, difficulty: 0, reps: 0, lapses: 0,
    });
    const original = structuredClone(card);
    const settings = makeSettings();
    const preview = previewMemoryReview(card, settings, reviewedAt);
    const fsrsGood = applyReview(card, 'good', reviewedAt);
    expect(Date.parse(fsrsGood.nextReviewDate) - reviewedAt.getTime()).toBeLessThan(DAY);
    expect(preview.choices.good.card).toEqual({
      ...fsrsGood, nextReviewDate: new Date(reviewedAt.getTime() + DAY).toISOString(), scheduledDays: 1,
    });
    expect(preview.choices.good.card.state).toBe('learning');
    expect(preview.choices.good.label).toBe('1 天');
    for (const rating of ['good', 'easy'] as const) {
      expect(Date.parse(preview.choices[rating].card.nextReviewDate)).toBeGreaterThanOrEqual(reviewedAt.getTime() + DAY);
    }
    for (const rating of ['again', 'hard'] as const) {
      expect(preview.choices[rating].card).toEqual(applyReview(card, rating, reviewedAt));
    }
    expect(card).toEqual(original);
  });

  it('preserves longer FSRS month-scale intervals rather than replacing them with one day', () => {
    const card = makeCard({ stability: 180 });
    const settings = makeSettings();
    const preview = previewMemoryReview(card, settings, at);
    for (const rating of ['good', 'easy'] as const) {
      const expected = applyReview(card, rating, at, settings.desiredRetention);
      expect(Date.parse(expected.nextReviewDate) - at.getTime()).toBeGreaterThan(30 * DAY);
      expect(preview.choices[rating].card).toEqual(expected);
    }
  });

  it('keeps fixed Good at exactly one day and Easy at months while leaving Again/Hard sub-day', () => {
    const card = makeCard({ state: 'new', reps: 0, lastReviewDate: null, stability: 0, difficulty: 0, lapses: 0 });
    const intervals = { again: MINUTE, hard: 2 * MINUTE, good: DAY, easy: 180 * DAY };
    const settings = makeSettings({ reviewPlan: { mode: 'fixed', intervals } });
    const preview = previewMemoryReview(card, settings, at);
    for (const rating of RATINGS) {
      expect(preview.choices[rating].card).toEqual({
        ...applyReview(card, rating, at),
        nextReviewDate: new Date(at.getTime() + intervals[rating]).toISOString(),
        scheduledDays: intervals[rating] / DAY,
      });
    }
  });
});

describe('reviewFingerprint', () => {
  const changes: Partial<Card>[] = [
    { id: 'other' }, { state: 'learning' }, { lastReviewDate: null }, { nextReviewDate: '2026-11-01T04:00:00Z' },
    { stability: 6 }, { difficulty: 5 }, { elapsedDays: 6 }, { scheduledDays: 6 },
    { reps: 11 }, { lapses: 3 }, { learningSteps: 1 }, { updatedAt: at.toISOString() },
  ];
  it.each(changes)('invalidates for scheduling/card revision change %j', change => {
    const card = makeCard(), settings = makeSettings();
    expect(reviewFingerprint({ ...card, ...change }, settings)).not.toBe(reviewFingerprint(card, settings));
  });

  it('includes normalized mode/intervals, retention, and weights, but ignores unrelated settings', () => {
    const card = makeCard(), settings = makeSettings();
    const fingerprint = reviewFingerprint(card, settings);
    expect(reviewFingerprint(card, makeSettings({ reviewPlan: normalizeMemoryReviewPlan(undefined) }))).toBe(fingerprint);
    expect(reviewFingerprint(card, { ...settings, theme: 'dark', dailyGoal: 42 })).toBe(fingerprint);
    for (const change of [
      { reviewPlan: { mode: 'fixed' as const, intervals: { ...DEFAULT_FIXED_INTERVALS } } },
      { reviewPlan: { mode: 'smart' as const, intervals: { ...DEFAULT_FIXED_INTERVALS, again: 2 * MINUTE } } },
      { desiredRetention: 0.95 }, { fsrsWeights: [...default_w] },
    ]) expect(reviewFingerprint(card, { ...settings, ...change })).not.toBe(fingerprint);
    const weights = [...default_w];
    const before = reviewFingerprint(card, { ...settings, fsrsWeights: weights });
    weights[0] += 0.1;
    expect(reviewFingerprint(card, { ...settings, fsrsWeights: weights })).not.toBe(before);
  });

  it('is stable across object/interval property insertion order', () => {
    const card = makeCard();
    const first = makeSettings({ reviewPlan: { mode: 'fixed', intervals: { ...DEFAULT_FIXED_INTERVALS } } });
    const second = makeSettings({ reviewPlan: { mode: 'fixed', intervals: {
      easy: 180 * DAY, good: 30 * DAY, hard: DAY, again: MINUTE,
    } } });
    expect(reviewFingerprint({ ...card }, second)).toBe(reviewFingerprint(card, first));
  });
});

describe('MemoryReviewPlanEditor', () => {
  beforeEach(() => {
    editorSnapshot = createSeedSnapshot(at);
    editorSnapshot.cards = [makeCard()];
    editorSnapshot.reviewLogs = [{
      id: 'history-1', cardId: 'review-card', rating: 'good', reviewDate: makeCard().lastReviewDate!,
      stability: 5, difficulty: 4, elapsedDays: 5, scheduledDays: 5,
    }];
    vi.mocked(commitMemory).mockReset();
    vi.mocked(commitMemory).mockImplementation(async change => { editorSnapshot = change(editorSnapshot); });
  });

  it('starts smart; serially merges plan, retention and study preferences into the latest state', async () => {
    const onClose = vi.fn(), onBusy = vi.fn();
    render(createElement(MemoryReviewPlanEditor, { onClose, onBusy }));
    expect(onBusy).not.toHaveBeenCalled();
    expect((screen.getByRole('radio', { name: '智能计划（FSRS）' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    fireEvent.change(screen.getByLabelText('目标保留率（%）'), { target: { value: '95' } });
    editorSnapshot.settings = { ...editorSnapshot.settings, theme: 'dark', dailyGoal: 45 };
    editorSnapshot.cards = [makeCard({ reps: 11, nextReviewDate: '2027-01-01T04:00:00.000Z' })];
    const before = structuredClone(editorSnapshot);
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
    expect(onBusy.mock.calls).toEqual([[true]]);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(commitMemory).toHaveBeenCalledOnce();
    expect(editorSnapshot).toEqual({ ...before, settings: {
      ...before.settings, desiredRetention: 0.95, reviewPlan: { mode: 'fixed', intervals: DEFAULT_FIXED_INTERVALS },
      studyPreferences: { newCardRatio: 0.3, batchSize: 10, sessionMinutes: 30 },
    } });
    expect(editorSnapshot.cards).toEqual(before.cards);
    expect(editorSnapshot.reviewLogs).toEqual(before.reviewLogs);
  });

  it.each(['0', '1.5', '366'])('blocks invalid intervals (%s) and restores the preset', invalid => {
    render(createElement(MemoryReviewPlanEditor, { onClose: vi.fn() }));
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    fireEvent.change(screen.getByLabelText('记住了'), { target: { value: invalid } });
    expect((screen.getByRole('button', { name: '保存计划' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('严格递增');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认间隔' }));
    expect((screen.getByLabelText('记住了') as HTMLInputElement).value).toBe('30');
    expect((screen.getByRole('button', { name: '保存计划' }) as HTMLButtonElement).disabled).toBe(false);
    expect(commitMemory).not.toHaveBeenCalled();
  });

  it('validates ordering, interval units, and retention without writing drafts', async () => {
    const onClose = vi.fn();
    render(createElement(MemoryReviewPlanEditor, { onClose }));
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    fireEvent.change(screen.getByLabelText('有点难的间隔单位'), { target: { value: 'minute' } });
    expect(screen.getByRole('alert').textContent).toContain('严格递增');
    fireEvent.change(screen.getByLabelText('有点难'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('有点难的间隔单位'), { target: { value: 'hour' } });
    fireEvent.change(screen.getByLabelText('目标保留率（%）'), { target: { value: '100' } });
    expect(screen.getByRole('alert').textContent).toContain('70% 到 99%');
    expect(commitMemory).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('目标保留率（%）'), { target: { value: '90.5' } });
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(editorSnapshot.settings.reviewPlan?.intervals.hard).toBe(90 * 3_600_000);
    expect(editorSnapshot.settings.desiredRetention).toBe(0.905);
  });

  it('disables every control during save, rejects duplicate submits, and stays open on failure', async () => {
    let rejectSave!: (error: Error) => void;
    vi.mocked(commitMemory).mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const onClose = vi.fn(), onBusy = vi.fn();
    const { container } = render(createElement(MemoryReviewPlanEditor, { onClose, onBusy }));
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
    for (const control of container.querySelectorAll('button, input, select')) expect(control.matches(':disabled')).toBe(true);
    fireEvent.submit(container.querySelector('form')!);
    expect(commitMemory).toHaveBeenCalledOnce();
    expect(onBusy.mock.calls).toEqual([[true]]);
    rejectSave(new Error('磁盘写入失败'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('磁盘写入失败'));
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '保存计划' }) as HTMLButtonElement).disabled).toBe(false);
    vi.mocked(commitMemory).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onBusy.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it.each(['resolve', 'reject'])('clears busy on unmount and ignores a late save %s', outcome => {
    let finishSave!: () => void;
    const work = new Promise<void>((resolve, reject) => {
      finishSave = outcome === 'resolve' ? resolve : () => reject(new Error('late save failure'));
    });
    vi.mocked(commitMemory).mockReturnValueOnce(work);
    const onClose = vi.fn(), onBusy = vi.fn();
    const { unmount } = render(createElement(MemoryReviewPlanEditor, { onClose, onBusy }));
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
    expect(onBusy.mock.calls).toEqual([[true]]);
    unmount();
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    return act(async () => {
      finishSave();
      await work.catch(() => {});
      expect(onClose).not.toHaveBeenCalled();
      expect(onBusy.mock.calls).toEqual([[true], [false]]);
    });
  });

  it('keeps busy set when the callback identity changes, and cleans up the latest callback', async () => {
    let finishSave!: () => void;
    const work = new Promise<void>(resolve => { finishSave = resolve; });
    vi.mocked(commitMemory).mockReturnValueOnce(work);
    const onClose = vi.fn(), originalBusy = vi.fn(), latestBusy = vi.fn();
    const { rerender, unmount } = render(createElement(MemoryReviewPlanEditor, { onClose, onBusy: originalBusy }));
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }));
    rerender(createElement(MemoryReviewPlanEditor, { onClose, onBusy: latestBusy }));
    expect(originalBusy.mock.calls).toEqual([[true]]);
    expect(latestBusy).not.toHaveBeenCalled();
    unmount();
    expect(latestBusy.mock.calls).toEqual([[false]]);
    await act(async () => { finishSave(); await work; });
    expect(onClose).not.toHaveBeenCalled();
    expect(latestBusy).toHaveBeenCalledOnce();
  });

  it('clears busy on an idle unmount without starting a save', () => {
    const onBusy = vi.fn();
    const { unmount } = render(createElement(MemoryReviewPlanEditor, { onClose: vi.fn(), onBusy }));
    unmount();
    expect(onBusy.mock.calls).toEqual([[false]]);
    expect(commitMemory).not.toHaveBeenCalled();
  });

  it('cancels without writing', () => {
    const onClose = vi.fn();
    render(createElement(MemoryReviewPlanEditor, { onClose }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(commitMemory).not.toHaveBeenCalled();
  });
});

describe('reviewPlan browser persistence and backup round-trip', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it.each(['smart', 'fixed'] as const)('preserves %s plan through save, reload, JSON export, and replacement restore', async mode => {
    const repository = await getRecallRepository();
    const snapshot = createSeedSnapshot(at);
    const reviewPlan = { mode, intervals: { ...DEFAULT_FIXED_INTERVALS, hard: 90 * MINUTE } };
    snapshot.settings = { ...snapshot.settings, reviewPlan, desiredRetention: 0.95 };
    await repository.saveSettings(snapshot.settings, snapshot);
    const disk = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
    expect(disk.settings.reviewPlan).toEqual(reviewPlan);
    const reloaded = await repository.loadAppData();
    expect(reloaded.settings.reviewPlan).toEqual(reviewPlan);
    expect(reloaded.settings.desiredRetention).toBe(0.95);
    const backup = parseImportPayload(JSON.stringify(buildExportPayload(reloaded, at)));
    expect(backup.settings.reviewPlan).toEqual(reviewPlan);
    const restored = await repository.replaceDataFromImport(backup);
    expect(restored.settings.reviewPlan).toEqual(reviewPlan);
    expect(restored.cards).toEqual(reloaded.cards);
    expect(restored.reviewLogs).toEqual(reloaded.reviewLogs);
    expect((await repository.loadAppData()).settings.reviewPlan).toEqual(reviewPlan);
  });

  it('keeps legacy backups without a review plan readable with the smart default', async () => {
    const repository = await getRecallRepository();
    const backup = parseImportPayload(JSON.stringify(buildExportPayload(createSeedSnapshot(at), at)));
    const restored = await repository.replaceDataFromImport(backup);
    expect(restored.settings.reviewPlan).toBeUndefined();
    expect(normalizeMemoryReviewPlan(restored.settings.reviewPlan).mode).toBe('smart');
  });

  it('intentionally keeps the local plan when merging a backup', () => {
    const local = createSeedSnapshot(at), incoming = createSeedSnapshot(at);
    local.settings.reviewPlan = normalizeMemoryReviewPlan({ mode: 'smart', intervals: DEFAULT_FIXED_INTERVALS });
    incoming.settings.reviewPlan = normalizeMemoryReviewPlan({ mode: 'fixed', intervals: DEFAULT_FIXED_INTERVALS });
    const merged = mergeImportPayload(local, buildExportPayload(incoming, at));
    expect(merged.settings).toBe(local.settings);
    expect(merged.settings.reviewPlan?.mode).toBe('smart');
  });
});
