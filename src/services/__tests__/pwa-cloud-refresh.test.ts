import { beforeEach, describe, expect, it, vi } from 'vitest';

const sync = vi.hoisted(() => vi.fn());
const local = vi.hoisted(() => vi.fn());
vi.mock('@/lib/local-preview', () => ({ isLocalPreview: local }));
vi.mock('@/services/cloud-sync', async () => {
  const { create } = await import('zustand');
  return { synchronizeCloud: sync, useCloudSync: create(() => ({ phase: 'checking', session: null, pending: 0, conflicts: 0, error: '' })) };
});

import { useCloudSync } from '@/services/cloud-sync';
import { synchronizeBeforePWARefresh } from '../pwa-cloud-refresh';

const session = { spaceId: 'synthetic-space', device: { id: 'synthetic-device', label: '合成设备' } };

describe('synchronize before the combined PWA update', () => {
  beforeEach(() => {
    local.mockReset(); local.mockReturnValue(false);
    sync.mockReset();
    useCloudSync.setState({ phase: 'synced', session, pending: 0, conflicts: 0, error: '' });
    sync.mockResolvedValue(undefined);
  });
  it('never connects a local preview even with an authorized cached state', async () => {
    local.mockReturnValue(true);
    await synchronizeBeforePWARefresh();
    expect(sync).not.toHaveBeenCalled();
  });
  it.each(['checking', 'local', 'unauthorized'] as const)('keeps app updates available without a session in %s', async phase => {
    useCloudSync.setState({ phase, session: null });
    await synchronizeBeforePWARefresh();
    expect(sync).not.toHaveBeenCalled();
  });
  it.each(['local', 'unauthorized'] as const)('does not upload a stale session in %s', async phase => {
    useCloudSync.setState({ phase });
    await synchronizeBeforePWARefresh();
    expect(sync).not.toHaveBeenCalled();
  });
  it('waits for session checking rather than sending content', async () => {
    useCloudSync.setState({ phase: 'checking' });
    await expect(synchronizeBeforePWARefresh()).rejects.toThrow('正在检查设备授权');
    expect(sync).not.toHaveBeenCalled();
  });
  it.each(['conflict', 'synced'] as const)('does not synchronize existing conflicts in %s', async phase => {
    useCloudSync.setState({ phase, conflicts: 1 });
    await expect(synchronizeBeforePWARefresh()).rejects.toThrow('有同步冲突');
    expect(sync).not.toHaveBeenCalled();
  });
  it('waits for the actual sync and rechecks the durable queue', async () => {
    useCloudSync.setState({ phase: 'pending', pending: 3 });
    sync.mockImplementation(async () => { useCloudSync.setState({ phase: 'synced', pending: 0 }); });
    await synchronizeBeforePWARefresh();
    expect(sync).toHaveBeenCalledOnce();
  });
  it.each(['offline', 'error', 'conflict', 'unauthorized', 'pending'] as const)('blocks refresh after sync ends in %s', async phase => {
    sync.mockImplementation(async () => { useCloudSync.setState({ phase, error: '合成同步未完成' }); });
    await expect(synchronizeBeforePWARefresh()).rejects.toThrow('本次暂不刷新');
    expect(sync).toHaveBeenCalledOnce();
  });
  it.each([{ pending: 2, conflicts: 0 }, { pending: 0, conflicts: 1 }])('blocks refresh despite a stale synced label: %o', async counts => {
    sync.mockImplementation(async () => { useCloudSync.setState(counts); });
    await expect(synchronizeBeforePWARefresh()).rejects.toThrow('本机数据保留');
  });
});
