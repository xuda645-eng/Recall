import { createElement, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { MemoryReader } from '@/components/memory-reader';
import { useRecallStore } from '@/stores/recall-store';
import { commitMemory } from '@/services/memory-actions';
import type { RecallStateSnapshot } from '@/types';

vi.mock('@/components/RichCard', () => ({ RichCard: ({ content }: { content: string }) => createElement('div', null, content) }));
vi.mock('@/stores/recall-store', async () => {
  const { create } = await import('zustand');
  const { createSeedSnapshot } = await import('@/data/seed');
  return { useRecallStore: create(() => createSeedSnapshot()) };
});
vi.mock('@/services/memory-actions', () => ({ commitMemory: vi.fn() }));

const seed = createSeedSnapshot(new Date('2026-11-04T04:00:00Z'));
const cards = Array.from({ length: 4 }, (_, index) => ({ ...seed.cards[0], id: `reader-${index}`, cardType: 'basic' as const, contentKind: 'qa' as const, front: `Question ${index}`, back: `Answer ${index}`, state: 'new' as const, stability: 0, difficulty: 0, reps: 0, lapses: 0, learningSteps: 0, scheduledDays: 0, elapsedDays: 0, lastReviewDate: null }));
type Props = ComponentProps<typeof MemoryReader>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  useRecallStore.setState({ ...seed, cards, reviewLogs: [], studySessions: [] });
  vi.mocked(commitMemory).mockReset().mockImplementation(async change => {
    useRecallStore.setState(change(useRecallStore.getState() as RecallStateSnapshot));
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function reader(overrides: Partial<Props> = {}) {
  const props: Props = { ids: cards.map(card => card.id), initialIndex: 0, reviewMode: true, onEdit: vi.fn(), onOptions: vi.fn(), onArchive: vi.fn(async () => {}), restoreRequest: null, archiveNotice: null, fontSize: 18, onIndex: vi.fn(), onExit: vi.fn(), onBusy: vi.fn(), ...overrides };
  const result = render(createElement(MemoryReader, props));
  const active = () => result.container.querySelector<HTMLElement>('.m-reading[data-active=true]')!;
  const move = (direction: '上一张' | '下一张') => {
    fireEvent.click(screen.getByRole('button', { name: direction }));
    act(() => { vi.advanceTimersByTime(300); });
  };
  return { ...result, props, active, move };
}

function watchScroll(panel: HTMLElement, initial = 500) {
  let position = initial;
  const writes = vi.fn();
  Object.defineProperty(panel, 'scrollTop', { configurable: true, get: () => position, set: value => { position = value; writes(value); } });
  return writes;
}

describe('MemoryReader reading position', () => {
  it('only resets when the answer is revealed for the first time', () => {
    const { active } = reader();
    active().scrollTop = 250;
    fireEvent.scroll(active());
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(active().scrollTop).toBe(0);
    const answer = active();
    const writes = watchScroll(answer);
    fireEvent.scroll(answer);
    fireEvent.keyDown(document.body, { code: 'Space' });
    fireEvent.keyDown(document.body, { code: 'Space' });
    expect(active()).toBe(answer);
    expect(active().scrollTop).toBe(500);
    expect(writes).not.toHaveBeenCalled();
    expect(commitMemory).not.toHaveBeenCalled();
  });

  it('never repeats reveal for an excerpt that already displays its body', () => {
    useRecallStore.setState({ cards: cards.map(card => ({ ...card, contentKind: 'excerpt' })) });
    const { active } = reader();
    const writes = watchScroll(active());
    fireEvent.keyDown(document.body, { code: 'Space' });
    expect(active().scrollTop).toBe(500);
    expect(writes).not.toHaveBeenCalled();
  });

  it('does not write scroll or interrupt the rail on an identical snapshot refresh, even before a scroll event', () => {
    const { active, container } = reader();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    const answer = active();
    const writes = watchScroll(answer);
    const rail = container.querySelector<HTMLElement>('.m-card-rail')!;
    rail.style.transform = 'translate3d(-120%,0,0)';
    act(() => { useRecallStore.setState({ cards: cards.map(card => ({ ...card })) }); });
    expect(active()).toBe(answer);
    expect(answer.scrollTop).toBe(500);
    expect(writes).not.toHaveBeenCalled();
    expect(rail.style.transform).toBe('translate3d(-120%,0,0)');
  });

  it('preserves an in-flight card transition across an identical snapshot refresh', () => {
    const { active, container } = reader();
    fireEvent.click(screen.getByRole('button', { name: '下一张' }));
    const rail = container.querySelector<HTMLElement>('.m-card-rail')!;
    expect(rail.style.transform).toBe('translate3d(-200%,0,0)');
    act(() => { useRecallStore.setState({ cards: cards.map(card => ({ ...card })) }); });
    expect(rail.style.transform).toBe('translate3d(-200%,0,0)');
    act(() => { vi.advanceTimersByTime(300); });
    expect(active()).toHaveAttribute('data-card-id', cards[1].id);
    expect(rail.style.transform).toBe('translate3d(-100%,0,0)');
  });

  it('retains scroll through equivalent queue props, callback changes and font changes', () => {
    const { active, props, rerender } = reader();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    const writes = watchScroll(active());
    rerender(createElement(MemoryReader, { ...props, ids: [...props.ids], onIndex: vi.fn(), fontSize: 22 }));
    expect(active().scrollTop).toBe(500);
    expect(active()).toHaveStyle({ fontSize: '22px' });
    expect(writes).not.toHaveBeenCalled();
  });

  it('records scroll events for a removed card and restores its revealed body only when it mounts again', () => {
    const { active, props, rerender } = reader();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    active().scrollTop = 500;
    fireEvent.scroll(active());
    rerender(createElement(MemoryReader, { ...props, ids: [cards[1].id] }));
    expect(active()).toHaveAttribute('data-card-id', cards[1].id);
    rerender(createElement(MemoryReader, { ...props, restoreRequest: { id: cards[0].id, token: 'restore' } }));
    expect(active()).toHaveAttribute('data-card-id', cards[0].id);
    expect(active()).toHaveAttribute('aria-label', '卡片正文');
    expect(active().scrollTop).toBe(500);
  });

  it('restores each card independently after navigating beyond the mounted neighbor panels', () => {
    const { active, move } = reader();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    active().scrollTop = 500;
    fireEvent.scroll(active());
    move('下一张');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    active().scrollTop = 300;
    fireEvent.scroll(active());
    move('下一张');
    move('下一张');
    move('上一张');
    move('上一张');
    expect(active().scrollTop).toBe(300);
    move('上一张');
    expect(active().scrollTop).toBe(500);
    expect(active()).toHaveAttribute('aria-label', '卡片正文');
  });

  it('keeps reading position when a failed rating updates the error revision', async () => {
    const { active } = reader();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    const writes = watchScroll(active());
    vi.mocked(commitMemory).mockRejectedValueOnce(new Error('Synthetic save failure'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '记住了' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Synthetic save failure');
    expect(active().scrollTop).toBe(500);
    expect(writes).not.toHaveBeenCalled();
  });
});
