import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MiaodaPersonalDrawer } from '@/components/miaoda-personal-sync';
import { synchronizePersonal, usePersonalSync } from '@/services/personal-sync';

vi.mock('@/services/personal-sync', async () => {
  const { create } = await import('zustand');
  return {
    usePersonalSync: create(() => ({ available: true, enabled: true, running: false, phase: 'synced', error: '', lastSyncedAt: '2026-11-13T01:02:00Z' })),
    synchronizePersonal: vi.fn(), enablePersonalSync: vi.fn(), pausePersonalSync: vi.fn(), resolvePersonalConflicts: vi.fn(),
  };
});
beforeEach(() => {
  usePersonalSync.setState({ available: true, enabled: true, running: false, phase: 'synced', error: '', lastSyncedAt: '2026-11-13T01:02:00Z' });
  vi.mocked(synchronizePersonal).mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('pairs compact version and sync time with a working sync/refresh action', async () => {
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  vi.mocked(synchronizePersonal).mockResolvedValue();
  render(<MiaodaPersonalDrawer disabled={false} onManage={vi.fn()}/>);
  expect(screen.getByText('飞书同步 · 已同步')).toBeVisible();
  expect(screen.getByText(/最近同步：/)).toHaveTextContent('11/13');
  expect(screen.getByLabelText('当前版本')).not.toHaveTextContent('测试版');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '同步并刷新' })); });
  expect(synchronizePersonal).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('opens confirmation for an unconnected account without automatically uploading', () => {
  usePersonalSync.setState({ enabled: false });
  const manage = vi.fn();
  render(<MiaodaPersonalDrawer disabled={false} onManage={manage}/>);
  fireEvent.click(screen.getByRole('button', { name: '连接飞书同步' }));
  expect(manage).toHaveBeenCalledTimes(1);
  expect(synchronizePersonal).not.toHaveBeenCalled();
});

it('does not reload or discard local changes after failure', async () => {
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  vi.mocked(synchronizePersonal).mockImplementation(async () => { usePersonalSync.setState({ phase: 'error', error: '合成同步失败，本机数据保留' }); });
  render(<MiaodaPersonalDrawer disabled={false} onManage={vi.fn()}/>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '同步并刷新' })); });
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByText('合成同步失败，本机数据保留')).toBeVisible();
  expect(screen.getByRole('button', { name: '同步并刷新' })).toBeEnabled();
});

it('blocks repeated taps while synchronizing and routes conflicts to management', () => {
  usePersonalSync.setState({ running: true, phase: 'syncing' });
  const manage = vi.fn();
  const view = render(<MiaodaPersonalDrawer disabled={false} onManage={manage}/>);
  expect(screen.getByRole('button', { name: '正在同步' })).toBeDisabled();
  act(() => { usePersonalSync.setState({ running: false, phase: 'conflict' }); });
  view.rerender(<MiaodaPersonalDrawer disabled={false} onManage={manage}/>);
  fireEvent.click(screen.getByRole('button', { name: '处理同步冲突' }));
  expect(manage).toHaveBeenCalledTimes(1);
  expect(synchronizePersonal).not.toHaveBeenCalled();
});
