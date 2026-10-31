import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { MemoryReviewPlanEditor } from '@/components/memory-review-plan';
import { commitMemory } from '@/services/memory-actions';
import { DEFAULT_FIXED_INTERVALS } from '@/services/memory-review';
import { normalizeMemoryStudyPreferences } from '@/services/memory-study';
import type { RecallStateSnapshot } from '@/types';

let editorSnapshot: RecallStateSnapshot;

vi.mock('@/stores/recall-store', () => ({
  useRecallStore: (selector: (state: RecallStateSnapshot) => unknown) => selector(editorSnapshot),
}));
vi.mock('@/services/memory-actions', () => ({ commitMemory: vi.fn() }));

const at = new Date('2026-11-01T04:00:00.000Z');
const DAY = 86_400_000;

function openEditor(onClose = vi.fn(), onBusy = vi.fn()) {
  return { ...render(createElement(MemoryReviewPlanEditor, { onClose, onBusy })), onClose, onBusy };
}

function changeNumber(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '保存计划' });
}

beforeEach(() => {
  editorSnapshot = createSeedSnapshot(at);
  delete editorSnapshot.settings.reviewPlan;
  delete editorSnapshot.settings.studyPreferences;
  editorSnapshot.cards = [{
    id: 'editor-card', deckId: 'editor-deck', front: '问题', back: '答案', hint: '', source: '',
    tags: [], cardType: 'basic', state: 'review', lastReviewDate: '2026-10-31T04:00:00.000Z',
    nextReviewDate: at.toISOString(), stability: 5, difficulty: 4, elapsedDays: 1,
    scheduledDays: 1, reps: 3, lapses: 0, learningSteps: 0,
    createdAt: '2026-10-01T04:00:00.000Z', updatedAt: '2026-10-31T04:00:00.000Z',
  }];
  editorSnapshot.reviewLogs = [{
    id: 'editor-log', cardId: 'editor-card', rating: 'good', reviewDate: '2026-10-31T04:00:00.000Z',
    stability: 5, difficulty: 4, elapsedDays: 1, scheduledDays: 1,
  }];
  editorSnapshot.studySessions = [{
    id: 'editor-session', deckId: 'editor-deck', startedAt: '2026-10-31T04:00:00.000Z',
    endedAt: '2026-10-31T04:10:00.000Z', cardsStudied: 3,
  }];
  vi.mocked(commitMemory).mockReset();
  vi.mocked(commitMemory).mockImplementation(async change => { editorSnapshot = change(editorSnapshot); });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MemoryReviewPlanEditor mobile study preferences', () => {
  it('defaults legacy settings to smart, 30% new cards, 10 cards and 30 minutes without a second title', () => {
    openEditor();
    expect(screen.queryByRole('heading', { name: '复习计划' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '智能计划（FSRS）' })).toBeChecked();
    expect(screen.queryByRole('group', { name: '评分后的复习间隔' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('记住了')).not.toBeInTheDocument();
    const selection = screen.getByRole('group', { name: '本轮选卡' });
    const slider = within(selection).getByRole('slider', { name: '新卡占比' });
    expect(slider).toHaveValue('0.3');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '1');
    expect(slider).toHaveAttribute('step', '0.05');
    expect(slider).toHaveAttribute('aria-valuetext', '旧卡 70%，新卡 30%');
    expect(screen.getByLabelText('每轮卡片数')).toHaveValue(10);
    expect(screen.getByLabelText('每次时长目标（分钟）')).toHaveValue(30);
    expect(screen.getByText(/可从数天到数月/)).toHaveTextContent('完整 24 小时');
    expect(screen.getByText(/占比按卡片张数分配/)).toHaveTextContent('不是用时比例');
    expect(screen.getByText(/占比按卡片张数分配/)).toHaveTextContent('某类不足时由另一类补足');
    expect(screen.getByText(/占比按卡片张数分配/)).toHaveTextContent('不提前复习未到期卡');
    expect(screen.getByText(/只用于规划一次学习/)).toHaveTextContent('不是严格截止时间');
    expect(screen.getByText(/只用于规划一次学习/)).toHaveTextContent('也不保证能在目标时间内完成');
    expect(screen.getByText(/只用于规划一次学习/)).toHaveTextContent('不要求每天打卡');
    expect(saveButton()).toBeEnabled();
    expect(commitMemory).not.toHaveBeenCalled();
  });

  it.each([
    undefined, null, [], 'legacy', {}, { batchSize: 24 },
    { newCardRatio: NaN, batchSize: 0, sessionMinutes: 2 },
  ])('delegates legacy or malformed preferences to the shared normalizer: %j', value => {
    Object.assign(editorSnapshot.settings, { studyPreferences: value });
    const normalized = normalizeMemoryStudyPreferences(value);
    openEditor();
    expect(screen.getByRole('slider', { name: '新卡占比' })).toHaveValue(String(normalized.newCardRatio));
    expect(screen.getByLabelText('每轮卡片数')).toHaveValue(normalized.batchSize);
    expect(screen.getByLabelText('每次时长目标（分钟）')).toHaveValue(normalized.sessionMinutes);
    expect(saveButton()).toBeEnabled();
  });

  it('loads and preserves existing valid preferences instead of resetting them to defaults', async () => {
    const preferences = { newCardRatio: 0.45, batchSize: 25, sessionMinutes: 60 };
    editorSnapshot.settings.studyPreferences = preferences;
    const { onClose } = openEditor();
    expect(screen.getByRole('slider', { name: '新卡占比' })).toHaveValue('0.45');
    expect(screen.getByLabelText('每轮卡片数')).toHaveValue(25);
    expect(screen.getByLabelText('每次时长目标（分钟）')).toHaveValue(60);
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(editorSnapshot.settings.studyPreferences).toEqual(preferences);
  });

  it('saves normalized defaults for legacy settings without changing daily goals, limits or progress', async () => {
    editorSnapshot.settings = { ...editorSnapshot.settings, dailyGoal: 42, dailyNewCardLimit: 7, xp: 123 };
    const before = structuredClone(editorSnapshot);
    const { onClose } = openEditor();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(editorSnapshot).toEqual({
      ...before,
      settings: {
        ...before.settings,
        desiredRetention: before.settings.desiredRetention,
        reviewPlan: { mode: 'smart', intervals: DEFAULT_FIXED_INTERVALS },
        studyPreferences: { newCardRatio: 0.3, batchSize: 10, sessionMinutes: 30 },
      },
    });
  });

  it.each([0, 0.5, 1])('updates the live old/new percentages and explains endpoint targets at ratio %s', ratio => {
    const { container } = openEditor();
    const slider = screen.getByRole('slider', { name: '新卡占比' });
    fireEvent.change(slider, { target: { value: ratio } });
    const newPercent = Math.round(ratio * 100);
    const text = `旧卡 ${100 - newPercent}%，新卡 ${newPercent}%`;
    expect(slider).toHaveAttribute('aria-valuetext', text);
    const output = container.querySelector('output');
    expect(output).toHaveAttribute('aria-live', 'polite');
    expect(output).toHaveTextContent(text);
    expect(screen.getByText(/占比按卡片张数分配/)).toHaveTextContent('0% 是全旧卡目标，100% 是全新卡目标');
    expect(saveButton()).toBeEnabled();
  });

  it('warns politely above 50% new cards without blocking save, and clears the warning at 50%', async () => {
    const { onClose } = openEditor();
    const slider = screen.getByRole('slider', { name: '新卡占比' });
    fireEvent.change(slider, { target: { value: '0.55' } });
    expect(screen.getByText(/新卡占比较高/)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(screen.queryByText(/新卡占比较高/)).not.toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '1' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(editorSnapshot.settings.studyPreferences?.newCardRatio).toBe(1);
  });

  it.each(['', '0', '-1', '1.5', '101', '1e2'])('rejects an invalid batch size %j and does not commit even on form submit', value => {
    const { container } = openEditor();
    changeNumber('每轮卡片数', value);
    expect(screen.getByLabelText('每轮卡片数')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('每轮卡片数必须是 1 到 100 的整数');
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(commitMemory).not.toHaveBeenCalled();
    changeNumber('每轮卡片数', '10');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it.each(['', '0', '4', '30.5', '121', '1e2'])('rejects an invalid duration %j without saving', value => {
    openEditor();
    changeNumber('每次时长目标（分钟）', value);
    expect(screen.getByLabelText('每次时长目标（分钟）')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('每次时长目标必须是 5 到 120 分钟的整数');
    expect(saveButton()).toBeDisabled();
    expect(commitMemory).not.toHaveBeenCalled();
  });

  it.each([
    { newCardRatio: 0, batchSize: 1, sessionMinutes: 5 },
    { newCardRatio: 1, batchSize: 100, sessionMinutes: 120 },
  ])('accepts and saves inclusive study preference limits: %j', async preferences => {
    const { onClose } = openEditor();
    fireEvent.change(screen.getByRole('slider', { name: '新卡占比' }), { target: { value: preferences.newCardRatio } });
    changeNumber('每轮卡片数', String(preferences.batchSize));
    changeNumber('每次时长目标（分钟）', String(preferences.sessionMinutes));
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(editorSnapshot.settings.studyPreferences).toEqual(preferences);
  });

  it.each(['记住了', '很熟悉'])('rejects %s below an exact 24 hours', label => {
    const { container } = openEditor();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    changeNumber(`${label}的间隔单位`, 'hour');
    changeNumber(label, '23');
    expect(screen.getByLabelText(label)).toHaveAttribute('min', '24');
    expect(screen.getByRole('alert')).toHaveTextContent('完整 24 小时');
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(commitMemory).not.toHaveBeenCalled();
  });

  it('accepts exactly 24 hours for good and retains increasing integer intervals in every unit', async () => {
    const { onClose } = openEditor();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    changeNumber('有点难的间隔单位', 'hour');
    changeNumber('记住了的间隔单位', 'minute');
    changeNumber('记住了', '1440');
    changeNumber('很熟悉的间隔单位', 'hour');
    changeNumber('很熟悉', '25');
    expect(screen.getByLabelText('记住了')).toHaveAttribute('min', '1440');
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(editorSnapshot.settings.reviewPlan).toEqual({
      mode: 'fixed', intervals: { again: 60_000, hard: 3_600_000, good: DAY, easy: 25 * 3_600_000 },
    });
  });

  it.each(['0', '1.5', '366'])('retains the existing fixed integer, order and upper-bound validation for %j', value => {
    openEditor();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    changeNumber('记住了', value);
    expect(screen.getByRole('alert')).toHaveTextContent('严格递增');
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '恢复默认间隔' }));
    expect(saveButton()).toBeEnabled();
  });

  it('only renders fixed controls in fixed mode and keeps their draft across mode changes', () => {
    openEditor();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    changeNumber('记住了', '366');
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '智能计划（FSRS）' }));
    expect(screen.queryByRole('group', { name: '评分后的复习间隔' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('记住了')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '恢复默认间隔' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    expect(screen.getByLabelText('记住了')).toHaveValue(366);
    expect(saveButton()).toBeDisabled();
  });

  it('atomically merges only the three edited settings into the state current when the queued save runs', async () => {
    let publish!: () => void;
    vi.mocked(commitMemory).mockImplementation(change => new Promise<void>(resolve => {
      publish = () => { editorSnapshot = change(editorSnapshot); resolve(); };
    }));
    const { onClose, onBusy } = openEditor();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    changeNumber('目标保留率（%）', '90.5');
    fireEvent.change(screen.getByRole('slider', { name: '新卡占比' }), { target: { value: '0.45' } });
    changeNumber('每轮卡片数', '24');
    changeNumber('每次时长目标（分钟）', '55');
    fireEvent.click(saveButton());
    editorSnapshot.settings = {
      ...editorSnapshot.settings, theme: 'dark', dailyGoal: 45, dailyNewCardLimit: 12,
      syncEnabled: true, syncCode: 'synthetic-editor-secret', syncRelayUrl: 'https://synthetic.invalid',
      soundVolume: 17, ttsSpeed: 1.5, fsrsWeights: [1, 2, 3],
    };
    editorSnapshot.cards = [{ ...editorSnapshot.cards[0], reps: 4, nextReviewDate: '2027-01-01T04:00:00.000Z' }];
    editorSnapshot.reviewLogs = [...editorSnapshot.reviewLogs, { ...editorSnapshot.reviewLogs[0], id: 'concurrent-log' }];
    const current = editorSnapshot;
    const before = structuredClone(current);
    await act(async () => { publish(); });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(commitMemory).toHaveBeenCalledOnce();
    expect(editorSnapshot).toEqual({
      ...before,
      settings: {
        ...before.settings, desiredRetention: 0.905,
        reviewPlan: { mode: 'fixed', intervals: DEFAULT_FIXED_INTERVALS },
        studyPreferences: { newCardRatio: 0.45, batchSize: 24, sessionMinutes: 55 },
      },
    });
    expect(editorSnapshot.cards).toBe(current.cards);
    expect(editorSnapshot.reviewLogs).toBe(current.reviewLogs);
    expect(editorSnapshot.studySessions).toBe(current.studySessions);
    expect(editorSnapshot.decks).toBe(current.decks);
  });

  it('disables touch and keyboard controls while saving, prevents duplicate submits, and retains drafts on retry', async () => {
    let failSave!: (error: Error) => void;
    vi.mocked(commitMemory).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { failSave = reject; }));
    const { container, onClose, onBusy } = openEditor();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    changeNumber('每轮卡片数', '22');
    fireEvent.click(saveButton());
    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
    for (const control of container.querySelectorAll('input, select, button')) expect(control).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(commitMemory).toHaveBeenCalledOnce();
    await act(async () => { failSave(new Error('磁盘写入失败')); });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('磁盘写入失败');
    expect(screen.getByLabelText('每轮卡片数')).toHaveValue(22);
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(editorSnapshot.settings.studyPreferences?.batchSize).toBe(22);
    expect(onBusy.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('keeps native, labelled focus targets and reserves a 44px touch area for every control', () => {
    const { container } = openEditor();
    fireEvent.click(screen.getByRole('radio', { name: '固定间隔' }));
    const slider = screen.getByRole('slider', { name: '新卡占比' });
    slider.focus();
    expect(slider).toHaveFocus();
    screen.getByLabelText('每轮卡片数').focus();
    expect(screen.getByLabelText('每轮卡片数')).toHaveFocus();
    for (const control of container.querySelectorAll<HTMLElement>('input:not([type="radio"]), select, button')) {
      expect(control).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
    }
    for (const radio of screen.getAllByRole('radio')) expect(radio.closest('label')).toHaveStyle({ minHeight: '44px' });
    expect(container.querySelector('form')).not.toHaveStyle({ overflowY: 'hidden' });
  });

  it('scrolls a focused setting above the sticky save actions instead of leaving it covered', () => {
    const { container } = render(createElement('div', { className: 'm-sheet' }, createElement(MemoryReviewPlanEditor, { onClose: vi.fn() })));
    const sheet = container.querySelector<HTMLElement>('.m-sheet')!;
    const control = screen.getByLabelText('每次时长目标（分钟）');
    const actions = container.querySelector<HTMLElement>('.m-actions')!;
    const controlBounds = vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({ ...control.getBoundingClientRect(), bottom: 840 } as DOMRect);
    const actionBounds = vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue({ ...actions.getBoundingClientRect(), top: 760 } as DOMRect);
    const animation = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
    try {
      fireEvent.focus(control);
      expect(sheet.scrollTop).toBe(96);
      expect(commitMemory).not.toHaveBeenCalled();
    } finally {
      animation.mockRestore(); controlBounds.mockRestore(); actionBounds.mockRestore();
    }
  });
});
