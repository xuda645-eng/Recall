import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { MemoryReviewDeckPicker } from '@/components/memory-review-deck-picker';
import type { Card } from '@/types';

afterEach(cleanup);
const seed = createSeedSnapshot();
const past = '2026-10-01T00:00:00Z';
const decks = ['root', 'child', 'new', 'future', 'empty'].map(id => ({ ...seed.decks[0], id, name: id, parentId: id === 'child' ? 'root' : null }));
const cards: Card[] = [
  ...Array.from({ length: 9 }, (_, index) => ({ ...seed.cards[0], id: `old-${index}`, deckId: 'child', archivedAt: undefined, reps: 2, lastReviewDate: past, nextReviewDate: past })),
  { ...seed.cards[0], id: 'fresh', deckId: 'new', archivedAt: undefined, reps: 0, lastReviewDate: null },
  { ...seed.cards[0], id: 'future', deckId: 'future', archivedAt: undefined, reps: 2, lastReviewDate: past, nextReviewDate: '2099-01-01T00:00:00Z' },
];
function picker(lastDeck = 'child', scope = cards) {
  const onStart = vi.fn();
  const props = { decks, cards: scope, lastDeck, settings: seed.settings, preferences: { batchSize: 4, newCardRatio: 0.3, sessionMinutes: 20 }, onStart };
  return { ...render(createElement(MemoryReviewDeckPicker, props)), onStart, props };
}
describe('review deck picker', () => {
  it('opens the remembered child, selects without starting and uses the actual batch settings', () => {
    const { onStart } = picker();
    expect(screen.getByRole('button', { name: '选择卡组：child' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '收起root的子卡组' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('本轮 4 张 · 旧卡 4 张 · 新卡 0 张');
    fireEvent.click(screen.getByRole('button', { name: '选择卡组：root' }));
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认开始复习' }));
    expect(onStart).toHaveBeenCalledWith(cards.slice(0, 9), true, 'root');
  });
  it('supports new-only learning, ungraded browsing and disabled empty decks', () => {
    const { onStart } = picker();
    fireEvent.click(screen.getByRole('button', { name: '选择卡组：new' }));
    fireEvent.click(screen.getByRole('button', { name: '开始学习新卡' }));
    expect(onStart).toHaveBeenLastCalledWith([cards[9]], true, 'new');
    fireEvent.click(screen.getByRole('button', { name: '选择卡组：future' }));
    fireEvent.click(screen.getByRole('button', { name: '自由浏览（不评分）' }));
    expect(onStart).toHaveBeenLastCalledWith([cards[10]], false, 'future');
    fireEvent.click(screen.getByRole('button', { name: '选择卡组：empty' }));
    expect(screen.getByRole('button', { name: '暂无卡片' })).toBeDisabled();
  });
  it('does not silently fall back to mixed mode when a remembered deck disappears', () => {
    picker('missing');
    expect(screen.getByRole('button', { name: '选择卡组：child' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('其他复习方式').closest('details')).not.toHaveAttribute('open');
  });
  it('disables confirmation when sync archives the selected deck instead of changing the scope', () => {
    const { rerender, props, onStart } = picker();
    rerender(createElement(MemoryReviewDeckPicker, { ...props, cards: cards.map(card => card.deckId === 'child' ? { ...card, archivedAt: past } : card) }));
    expect(screen.getByRole('button', { name: '暂无卡片' })).toBeDisabled();
    expect(onStart).not.toHaveBeenCalled();
  });
  it('mixed mode counts each active card once and retains an explicit entry', () => {
    const { container } = picker('__all');
    const mixed = screen.getByRole('button', { name: /混合全部卡组/ });
    expect(mixed).toHaveAttribute('aria-pressed', 'true');
    expect(within(mixed).getByText('11')).toBeInTheDocument();
    expect(container.querySelector('.m-picker-other')).toHaveAttribute('open');
  });
});
