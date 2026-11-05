import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { MemoryPaperHome, MemoryPaperHomeDock } from '@/components/memory-paper-home';
import { newMemoryCard } from '@/lib/memory-folders';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('paper home', () => {
  it('uses real active due and new counts, excluding archived and future cards', () => {
    const timestamp = new Date().toISOString();
    const deck = { id: 'paper-deck', name: '真实卡组', description: '', color: 'slate' as const, parentId: null, createdAt: timestamp, updatedAt: timestamp };
    const base = newMemoryCard({ deckId: deck.id, front: '问题', back: '答案' }, timestamp);
    const cards = [base, { ...base, id: 'due', state: 'review' as const, reps: 2, nextReviewDate: '2020-01-01T00:00:00Z' }, { ...base, id: 'future', state: 'review' as const, reps: 2, nextReviewDate: '2099-01-01T00:00:00Z' }, { ...base, id: 'archive', archivedAt: timestamp }];
    const onFolder = vi.fn();
    render(<MemoryPaperHome decks={[deck]} allDecks={[deck]} roots={[deck]} cards={cards} recent={[]} recentReviewed={false} today={3} longTerm={2} variant={0} onFolder={onFolder} onManage={vi.fn()} onCreate={vi.fn()} onRead={vi.fn()} onImport={vi.fn()} onStats={vi.fn()}/>);
    const tasks = screen.getByLabelText('当前学习任务');
    expect(tasks.querySelectorAll('strong')[0]).toHaveTextContent('1');
    expect(tasks.querySelectorAll('strong')[1]).toHaveTextContent('1');
    expect(screen.getByText('全部在学卡片').previousElementSibling).toHaveTextContent('3');
    fireEvent.click(screen.getByRole('button', { name: /^真实卡组/ }));
    expect(onFolder).toHaveBeenCalledWith(deck.id);
  });

  it('reserves the measured dock height, responds to resize and cleans up on navigation', () => {
    let measure = () => {};
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { measure = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120);
    const onStart = vi.fn();
    const view = render(<div className="memory-content"><MemoryPaperHomeDock busy={false} onStart={onStart}/></div>);
    const content = view.container.querySelector<HTMLElement>('.memory-content')!;
    expect(observe).toHaveBeenCalledWith(view.container.querySelector('.m-paper-home-dock'), { box: 'border-box' });
    expect(content.style.getPropertyValue('--home-dock-height')).toBe('120px');
    height.mockReturnValue(160); measure();
    expect(content.style.getPropertyValue('--home-dock-height')).toBe('160px');
    fireEvent.click(screen.getByRole('button', { name: '开始复习' }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('复习计划')).not.toBeInTheDocument();
    expect(onStart).toHaveBeenCalledOnce();
    view.rerender(<div className="memory-content"><MemoryPaperHomeDock busy onStart={onStart}/></div>);
    expect(screen.getByRole('button', { name: '开始复习' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '开始复习' }));
    expect(onStart).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(content.style.getPropertyValue('--home-dock-height')).toBe('');
  });
});
