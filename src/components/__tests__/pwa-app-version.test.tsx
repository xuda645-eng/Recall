import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWAAppVersion, PWAUpdateProvider } from '../pwa-update-prompt';

const refresh = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock('@/lib/app-build', () => ({ APP_BUILD: { version: '1.0-20261101-0200', builtAt: '2026-10-31T18:00:00.000Z', timezone: 'Asia/Shanghai' } }));
vi.mock('@/services/pwa-refresh', () => ({ refreshMemoryPWA: refresh }));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [false, vi.fn()], updateServiceWorker: update }) }));

describe('drawer build identity and refresh', () => {
  beforeEach(() => { refresh.mockReset(); refresh.mockResolvedValue(undefined); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('shows the running build version and an accessible icon-only refresh button', () => {
    render(<PWAAppVersion />, { wrapper: PWAUpdateProvider });
    expect(screen.getByLabelText('当前版本').textContent).toBe('Recall · V1.0-20261101-0200');
    const button = screen.getByRole('button', { name: '检查更新并刷新' });
    expect(button.textContent).toBe('');
    expect(button.getAttribute('type')).toBe('button');
    expect(refresh).not.toHaveBeenCalled();
  });
  it('locks same-frame repeated refresh clicks without touching local storage', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>(complete => { resolve = complete; });
    refresh.mockReturnValue(pending);
    const clear = vi.spyOn(Storage.prototype, 'clear');
    render(<PWAAppVersion />, { wrapper: PWAUpdateProvider });
    const button = screen.getByRole('button', { name: '检查更新并刷新' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(refresh).toHaveBeenCalledExactlyOnceWith(update, '1.0-20261101-0200', expect.any(Function));
    expect((screen.getByRole('button', { name: '正在检查更新' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolve(); await pending; });
    expect(clear).not.toHaveBeenCalled();
  });
  it('reports an offline check as unverified and allows another attempt', async () => {
    refresh.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<PWAAppVersion />, { wrapper: PWAUpdateProvider });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '检查更新并刷新' })); });
    expect(screen.getByRole('status').textContent).toContain('无法检查更新');
    expect(screen.queryByText('已是最新版本')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '检查更新并刷新' })); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('disables refresh while application changes are being saved', () => {
    render(<PWAAppVersion disabled />, { wrapper: PWAUpdateProvider });
    fireEvent.click(screen.getByRole('button', { name: '检查更新并刷新' }));
    expect(refresh).not.toHaveBeenCalled();
  });
  it('pairs the approved compact icon with the full version and keeps sync failure feedback outside the row', async () => {
    const before = vi.fn().mockRejectedValue(new Error('同步有冲突，本次暂不刷新'));
    const view = render(<PWAAppVersion compact combined beforeRefresh={before}/>, { wrapper: PWAUpdateProvider });
    const version = screen.getByLabelText('当前版本');
    expect(version.textContent).toBe('V1.0-20261101-0200');
    const button = screen.getByRole('button', { name: '同步并检查更新' });
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')?.getAttribute('width')).toBe('18');
    expect(button.parentElement).toBe(version.parentElement);
    await act(async () => { fireEvent.click(button); });
    expect(before).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('本次暂不刷新');
    expect(screen.getByRole('status').parentElement).toBe(view.container);
    expect(screen.getByRole('button', { name: '同步并检查更新' }).hasAttribute('disabled')).toBe(false);
  });
  it('combines sync and update into one labelled action and waits for sync', async () => {
    let complete!: () => void;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const before = vi.fn(() => pending);
    render(<PWAAppVersion combined beforeRefresh={before}/>, { wrapper: PWAUpdateProvider });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const button = screen.getByRole('button', { name: '同步并检查更新' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(before).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '正在同步并检查更新' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { complete(); await pending; });
    expect(refresh).toHaveBeenCalledExactlyOnceWith(update, '1.0-20261101-0200', expect.any(Function));
  });
  it('does not check or reload the app after sync fails and offers a safe retry', async () => {
    const before = vi.fn().mockRejectedValueOnce(new Error('同步有冲突，本次暂不刷新')).mockResolvedValue(undefined);
    const clear = vi.spyOn(Storage.prototype, 'clear');
    render(<PWAAppVersion combined beforeRefresh={before}/>, { wrapper: PWAUpdateProvider });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '同步并检查更新' })); });
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('本次暂不刷新');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '同步并检查更新' })); });
    expect(before).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
  });
});
