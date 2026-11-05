import { createElement, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFolderSelector } from '@/components/memory-folder-selector';
import type { MemoryFolderSelectorProps } from '@/components/memory-folder-selector';
import { MemoryStats } from '@/components/memory-stats';
import { createSeedSnapshot } from '@/data/seed';
import type { Deck, RecallStateSnapshot } from '@/types';

let statsState: RecallStateSnapshot;
vi.mock('@/stores/recall-store', () => ({
  useRecallStore: (selector: (state: RecallStateSnapshot) => unknown) => selector(statsState),
}));

function deck(id: string, parentId: string | null = null, changes: Partial<Deck> = {}): Deck {
  return { id, name: id, parentId, description: '', color: 'slate', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...changes };
}
const decks = [deck('parent'), deck('child', 'parent'), deck('grandchild', 'child'), deck('sibling')];

function selector(changes: Partial<MemoryFolderSelectorProps> = {}) {
  const onChange = vi.fn();
  const props = { decks, value: '', label: '统计范围', rootLabel: '全部卡片', onChange, ...changes };
  return { ...render(createElement(MemoryFolderSelector, props)), props, onChange };
}
function openSelector(): HTMLButtonElement {
  const button = screen.getByRole<HTMLButtonElement>('button', { name: /^统计范围 / });
  fireEvent.click(button);
  return button;
}
function select(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: `选择目录：${name}` }));
}
function expand(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: `展开${name}的子目录` }));
}

beforeEach(() => { statsState = createSeedSnapshot(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('MemoryFolderSelector', () => {
  it('discloses a nested tree rather than a flattened path list, and collapses each parent independently', () => {
    const { onChange } = selector();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    const trigger = openSelector();
    const tree = screen.getByRole('tree', { name: '统计范围' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '选择目录：child' })).not.toBeInTheDocument();
    expand('parent');
    const parent = screen.getByRole('treeitem', { name: 'parent' });
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    const child = within(within(parent).getByRole('group')).getByRole('treeitem', { name: 'child' });
    expect(child).toHaveAttribute('aria-level', '2');
    expand('child');
    expect(within(child).getByRole('treeitem', { name: 'grandchild' })).toHaveAttribute('aria-level', '3');
    fireEvent.click(screen.getByRole('button', { name: '收起parent的子目录' }));
    expect(screen.queryByRole('treeitem', { name: 'child' })).not.toBeInTheDocument();
    expect(parent).toHaveAttribute('aria-expanded', 'false');
    expand('parent');
    expect(screen.getByRole('treeitem', { name: 'grandchild' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('orders siblings at both levels by import time, creation fallback, creation ties and stable id ties', () => {
    const siblings = [
      { id: 'old-import', importedAt: '2026-10-02T00:00:00Z', createdAt: '2026-11-01T00:00:00Z' },
      { id: 'tie-b', importedAt: '2026-10-04T00:00:00Z' },
      { id: 'new-import', importedAt: '2026-10-06T00:00:00Z' },
      { id: 'creation-fallback', createdAt: '2026-10-05T00:00:00Z' },
      { id: 'tie-a', importedAt: '2026-10-04T00:00:00Z' },
      { id: 'newer-creation-tie', importedAt: '2026-10-04T00:00:00Z', createdAt: '2026-10-03T00:00:00Z' },
      { id: 'invalid-import', importedAt: 'invalid', createdAt: '2026-10-03T00:00:00Z' },
    ];
    const unordered = [deck('parent'), ...siblings.map(item => deck(item.id, null, item)), ...siblings.map(item => deck(`child-${item.id}`, 'parent', { ...item, id: `child-${item.id}`, name: item.id }))];
    const before = JSON.stringify(unordered);
    const { rerender, props } = selector({ decks: unordered });
    openSelector();
    expand('parent');
    const expected = ['new-import', 'creation-fallback', 'newer-creation-tie', 'tie-a', 'tie-b', 'invalid-import', 'old-import'];
    function names(): string[] {
      return screen.getAllByRole('treeitem').map(item => item.getAttribute('aria-labelledby')!)
        .map(nameId => document.getElementById(nameId)!.textContent!);
    }
    expect(names()).toEqual(['全部卡片', ...expected, 'parent', ...expected]);
    expect(JSON.stringify(unordered)).toBe(before);
    rerender(createElement(MemoryFolderSelector, { ...props, decks: [...unordered].reverse() }));
    expect(names()).toEqual(['全部卡片', ...expected, 'parent', ...expected]);
  });

  it('keeps root first, then the selected branch, then recent siblings without moving stored folders', () => {
    const folders = [...decks, deck('recent', null, { importedAt: '2026-11-05T00:00:00Z' }), deck('recent-child', 'parent', { importedAt: '2026-11-05T00:00:00Z' })];
    const before = JSON.stringify(folders);
    selector({ decks: folders, value: 'grandchild', rootLabel: '根目录' });
    openSelector();
    const names = screen.getAllByRole('treeitem').map(item => document.getElementById(item.getAttribute('aria-labelledby')!)!.textContent);
    expect(names).toEqual(['根目录', 'parent', 'child', 'grandchild', 'recent-child', 'recent', 'sibling']);
    expect(JSON.stringify(folders)).toBe(before);
  });

  it('selects a collapsed parent without expanding it or selecting its first child', () => {
    const { onChange } = selector();
    const trigger = openSelector();
    select('parent');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('parent');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    openSelector();
    expect(screen.getByRole('treeitem', { name: 'parent' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('treeitem', { name: '全部卡片' })).toHaveAttribute('aria-selected', 'true');
  });

  it('is controlled, reveals the selected ancestors and shows the full selected path after closing', () => {
    function Controlled(): JSX.Element {
      const [value, setValue] = useState('');
      return createElement(MemoryFolderSelector, { decks, value, onChange: setValue, label: '统计范围', rootLabel: '全部卡片' });
    }
    render(createElement(Controlled));
    openSelector(); expand('parent'); expand('child'); select('grandchild');
    expect(screen.getByRole('button', { name: '统计范围 parent / child / grandchild' })).toBeInTheDocument();
    openSelector();
    expect(screen.getByRole('treeitem', { name: 'grandchild' })).toHaveAttribute('aria-selected', 'true');
    select('全部卡片');
    expect(screen.getByRole('button', { name: '统计范围 全部卡片' })).toHaveFocus();
  });

  it('selects the root with an empty id and accepts a configurable import-target label', () => {
    const { onChange } = selector({ value: 'child', label: '导入位置', rootLabel: '顶层目录' });
    fireEvent.click(screen.getByRole('button', { name: '导入位置 parent / child' }));
    select('顶层目录');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
  });

  it('keeps long names intact in text and accessible names, including the selected breadcrumb', () => {
    const name = '很长的目录名称'.repeat(20) + 'long-unbroken-name'.repeat(10);
    selector({ decks: [deck('long', null, { name }), deck('leaf', 'long', { name: `${name}子目录` })], value: 'leaf' });
    const trigger = screen.getByRole('button', { name: `统计范围 ${name} / ${name}子目录` });
    fireEvent.click(trigger);
    expect(screen.getByRole('treeitem', { name: `${name}子目录` })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: `选择目录：${name}` })).toHaveTextContent(name);
    expect(screen.getByRole('button', { name: `收起${name}的子目录` })).toHaveAccessibleName(`收起${name}的子目录`);
  });

  it('safely falls back for missing selections and empty decks without emitting an unsolicited change', () => {
    const { rerender, props, onChange } = selector({ value: 'missing' });
    openSelector();
    expect(screen.getByRole('treeitem', { name: '全部卡片' })).toHaveAttribute('aria-selected', 'true');
    rerender(createElement(MemoryFolderSelector, { ...props, decks: [], value: 'parent' }));
    expect(screen.getByRole('button', { name: '统计范围 全部卡片' })).toBeInTheDocument();
    expect(screen.getAllByRole('treeitem')).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reveals ancestors when the controlled value changes externally', () => {
    const { rerender, props } = selector();
    openSelector();
    rerender(createElement(MemoryFolderSelector, { ...props, value: 'grandchild' }));
    expect(screen.getByRole('treeitem', { name: 'grandchild' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '收起child的子目录' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('supports roving tree focus, arrows, Home/End, independent keyboard expansion and selection', () => {
    const { onChange } = selector();
    openSelector();
    const root = screen.getByRole('treeitem', { name: '全部卡片' });
    act(() => root.focus());
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    const parent = screen.getByRole('treeitem', { name: 'parent' });
    expect(parent).toHaveFocus();
    fireEvent.keyDown(parent, { key: 'ArrowRight' });
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(parent, { key: 'ArrowRight' });
    const child = screen.getByRole('treeitem', { name: 'child' });
    expect(child).toHaveFocus();
    fireEvent.keyDown(child, { key: 'ArrowLeft' });
    expect(parent).toHaveFocus();
    fireEvent.keyDown(parent, { key: 'ArrowLeft' });
    expect(parent).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(parent, { key: 'End' });
    expect(screen.getByRole('treeitem', { name: 'sibling' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(parent).toHaveFocus();
    fireEvent.keyDown(parent, { key: 'Home' });
    expect(root).toHaveFocus();
    expect(screen.getAllByRole('treeitem').filter(item => item.tabIndex === 0)).toEqual([root]);
    fireEvent.keyDown(root, { key: ' ' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
  });

  it('closes on Escape and restores the trigger, without trapping focus or swallowing an outer Escape while closed', () => {
    const outerEscape = vi.fn();
    render(createElement('div', { onKeyDown: outerEscape }, createElement(MemoryFolderSelector, {
      decks, value: '', onChange: vi.fn(), label: '统计范围', rootLabel: '全部卡片',
    }), createElement('button', {}, '外部按钮')));
    const trigger = openSelector();
    const parent = screen.getByRole('treeitem', { name: 'parent' });
    act(() => parent.focus());
    fireEvent.keyDown(parent, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(outerEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(outerEscape).toHaveBeenCalledOnce();
    openSelector();
    const outside = screen.getByRole('button', { name: '外部按钮' });
    act(() => outside.focus()); fireEvent.click(outside);
    expect(outside).toHaveFocus();
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('disables opening and removes open tree controls immediately when disabled', () => {
    const { rerender, props, onChange } = selector({ disabled: true });
    const trigger = screen.getByRole('button', { name: '统计范围 全部卡片' });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    rerender(createElement(MemoryFolderSelector, { ...props, disabled: false }));
    openSelector();
    rerender(createElement(MemoryFolderSelector, { ...props, disabled: true }));
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('MemoryStats selector integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T12:00:00+08:00'));
    const seed = createSeedSnapshot();
    statsState = { ...seed, decks, cards: [
      { ...seed.cards[0], id: 'parent-card', deckId: 'parent', archivedAt: undefined },
      { ...seed.cards[0], id: 'child-card', deckId: 'child', archivedAt: undefined },
      { ...seed.cards[0], id: 'grandchild-card', deckId: 'grandchild', archivedAt: undefined },
      { ...seed.cards[0], id: 'archived-card', deckId: 'child', archivedAt: '2026-11-01T00:00:00Z' },
      { ...seed.cards[0], id: 'outside-card', deckId: 'sibling', archivedAt: undefined },
    ], reviewLogs: ['parent-card', 'child-card', 'archived-card', 'outside-card'].map((cardId, index) => ({
      id: `log-${index}`, cardId, rating: 'good', reviewDate: new Date().toISOString(), stability: 5, difficulty: 4, elapsedDays: 1, scheduledDays: 1,
    })) };
  });
  function summary(container: HTMLElement): string[] {
    return [...container.querySelectorAll('.m-stats-summary strong')].map(element => element.textContent!);
  }
  it('preserves descendant scope, active-card counts and archived-card review logs, and restores all cards at root', () => {
    const { container } = render(createElement(MemoryStats));
    expect(summary(container)[0]).toBe('4');
    expect(summary(container)[2]).toBe('4');
    openSelector(); select('parent');
    expect(summary(container)[0]).toBe('3');
    expect(summary(container)[2]).toBe('3');
    openSelector(); expand('parent'); select('child');
    expect(summary(container)[0]).toBe('2');
    expect(summary(container)[2]).toBe('2');
    openSelector(); select('全部卡片');
    expect(summary(container)[0]).toBe('4');
    expect(summary(container)[2]).toBe('4');
    expect(screen.getByRole('combobox', { name: '统计天数' })).toHaveValue('7');
  });
  it('uses all-card counts as well as the root label if the selected folder disappears', () => {
    const { container, rerender } = render(createElement(MemoryStats));
    openSelector(); select('sibling');
    expect(summary(container)[0]).toBe('1');
    statsState = { ...statsState, decks: decks.filter(item => item.id !== 'sibling') };
    rerender(createElement(MemoryStats));
    expect(screen.getByRole('button', { name: '统计范围 全部卡片' })).toBeInTheDocument();
    expect(summary(container)[0]).toBe('3');
    expect(summary(container)[2]).toBe('3');
  });
});
