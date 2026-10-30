import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { useSwipeGesture } from './use-swipe-gesture';

function event(element: HTMLElement, x: number, y: number): ReactTouchEvent {
  return { target: element, currentTarget: element, touches: [{ clientX: x, clientY: y }] } as unknown as ReactTouchEvent;
}
function swipe(element: HTMLElement, dx: number, dy: number) {
  const onSwipe = vi.fn();
  const hook = renderHook(() => useSwipeGesture({ onSwipe }));
  act(() => hook.result.current.touchHandlers.onTouchStart(event(element, 0, 0)));
  act(() => hook.result.current.touchHandlers.onTouchMove(event(element, dx, dy)));
  act(() => hook.result.current.touchHandlers.onTouchEnd());
  hook.unmount();
  return onSwipe;
}
function card(scrollable = false) {
  const el = document.createElement('div');
  el.style.overflowY = 'auto';
  document.body.appendChild(el);
  Object.defineProperty(el, 'clientHeight', { value: 300 });
  Object.defineProperty(el, 'scrollHeight', { value: scrollable ? 1200 : 300 });
  return el;
}
describe('reading-safe touch gestures', () => {
  it.each(['up', 'down'] as const)('does not rate a scrollable card when reading %s', direction => {
    expect(swipe(card(true), 0, direction === 'up' ? -200 : 200)).not.toHaveBeenCalled();
  });
  it('preserves horizontal scoring on a long card', () => {
    expect(swipe(card(true), 180, 5)).toHaveBeenCalledWith('right');
  });
  it('preserves vertical scoring on short cards', () => {
    expect(swipe(card(), 5, -200)).toHaveBeenCalledWith('up');
  });
  it('cancels interrupted gestures without writing a review', () => {
    const onSwipe = vi.fn();
    const hook = renderHook(() => useSwipeGesture({ onSwipe }));
    const el = card();
    act(() => hook.result.current.touchHandlers.onTouchStart(event(el, 0, 0)));
    act(() => hook.result.current.touchHandlers.onTouchMove(event(el, 180, 0)));
    act(() => hook.result.current.touchHandlers.onTouchCancel());
    act(() => hook.result.current.touchHandlers.onTouchEnd());
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
