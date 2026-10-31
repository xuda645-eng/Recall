import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStatusEdge } from '../memory-status-edge';

describe('Memory status edge', () => {
  const savedStandalone = Object.getOwnPropertyDescriptor(navigator, 'standalone');
  let mode: EventTarget & { matches: boolean };

  beforeEach(() => {
    mode = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', vi.fn(() => mode));
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (savedStandalone) Object.defineProperty(navigator, 'standalone', savedStandalone);
    else Reflect.deleteProperty(navigator, 'standalone');
  });

  it('portals outside transformed app ancestors and stays inactive in normal tabs', () => {
    const { container } = render(<div className="memory-shell"><MemoryStatusEdge/></div>);
    const edge = document.querySelector('.m-status-edge')!;
    expect(edge.parentElement).toBe(document.body);
    expect(container.contains(edge)).toBe(false);
    expect(edge.getAttribute('data-standalone')).toBe('false');
    expect(edge.getAttribute('aria-hidden')).toBe('true');
    expect(edge.children).toHaveLength(0);
  });

  it('recognizes the standalone display mode', () => {
    mode.matches = true;
    render(<MemoryStatusEdge/>);
    expect(document.querySelector('.m-status-edge')!.getAttribute('data-standalone')).toBe('true');
  });

  it('recognizes the Safari standalone flag', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    render(<MemoryStatusEdge/>);
    expect(document.querySelector('.m-status-edge')!.getAttribute('data-standalone')).toBe('true');
  });

  it('updates on display-mode changes and releases its listener on unmount', () => {
    const removeListener = vi.spyOn(mode, 'removeEventListener');
    const { unmount } = render(<MemoryStatusEdge/>);
    act(() => { mode.matches = true; mode.dispatchEvent(new Event('change')); });
    expect(document.querySelector('.m-status-edge')!.getAttribute('data-standalone')).toBe('true');
    act(() => { mode.matches = false; mode.dispatchEvent(new Event('change')); });
    expect(document.querySelector('.m-status-edge')!.getAttribute('data-standalone')).toBe('false');
    unmount();
    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(document.querySelector('.m-status-edge')).toBeNull();
  });
});
