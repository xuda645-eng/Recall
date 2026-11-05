import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryImportFooter } from '../memory-import-footer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('measures the fixed footer, updates its content reserve and cleans up on exit', () => {
  let height = 88;
  let measure = () => {};
  const disconnect = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { measure = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const { container, rerender } = render(<div className="memory-content"><MemoryImportFooter busy={false} onCancel={vi.fn()} onConfirm={vi.fn()}/></div>);
  const content = container.querySelector<HTMLElement>('.memory-content')!;
  expect(content.style.getPropertyValue('--import-dock-height')).toBe('88px');
  height = 120;
  measure();
  expect(content.style.getPropertyValue('--import-dock-height')).toBe('120px');
  rerender(<div className="memory-content"/>);
  expect(content.style.getPropertyValue('--import-dock-height')).toBe('');
  expect(disconnect).toHaveBeenCalledOnce();
});

it('keeps confirm and cancel independent and blocks both while saving', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const actions = { onCancel: vi.fn(), onConfirm: vi.fn() };
  const { rerender } = render(<div className="memory-content"><MemoryImportFooter busy={false} {...actions}/></div>);
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
  expect(actions.onCancel).toHaveBeenCalledOnce();
  expect(actions.onConfirm).toHaveBeenCalledOnce();
  rerender(<div className="memory-content"><MemoryImportFooter busy {...actions}/></div>);
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled();
});
