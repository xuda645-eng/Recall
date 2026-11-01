import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryDisplayDiagnostics } from '../memory-display-diagnostics';
import { readDisplayDiagnostics } from '@/lib/display-diagnostics';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('samples only on request without reading or changing cards, storage or network', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem');
  const set = vi.spyOn(Storage.prototype, 'setItem');
  const clear = vi.spyOn(Storage.prototype, 'clear');
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  render(<><p>private-card-sentinel</p><MemoryDisplayDiagnostics/></>);
  expect(screen.queryByLabelText('显示诊断结果')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '显示运行信息' }));
  const report = screen.getByLabelText('显示诊断结果').textContent!;
  expect(JSON.parse(report)).toHaveProperty('safeArea');
  expect(report).not.toContain('private-card-sentinel');
  expect(report).not.toContain('recall.snapshot');
  expect(get).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
});

it('links within the same app scope without exporting diagnostics in the URL', () => {
  render(<MemoryDisplayDiagnostics/>);
  const link = screen.getByRole('link', { name: '打开原安装内对照页' });
  expect(link.getAttribute('href')).toBe(`${import.meta.env.BASE_URL}status-diagnostics/`);
  expect(link.hasAttribute('target')).toBe(false);
});

it('records standalone detection and element geometry without copying page text or attributes', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  render(<div className="memory-app"><div className="m-status-edge" data-standalone="true" data-private="secret"/></div>);
  const report = readDisplayDiagnostics();
  expect(report.standalone.displayMode).toBe(true);
  expect(report.elements.find(element => element.selector === '.m-status-edge')).toMatchObject({ present: true, standalone: 'true' });
  expect(JSON.stringify(report)).not.toContain('secret');
  expect(report.elements.find(element => element.selector === '.memory-bar')).toMatchObject({ present: false });
});
