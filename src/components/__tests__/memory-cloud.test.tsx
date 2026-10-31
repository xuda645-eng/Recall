import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, RecallStateSnapshot } from '@/types';
import type { CloudJournal } from '@/services/cloud-cache';
import { snapshotEntities } from '../../../shared/cloud';

const api = vi.hoisted(() => ({
  pair: vi.fn(), sync: vi.fn(), list: vi.fn(), issue: vi.fn(), revoke: vi.fn(),
  logout: vi.fn(), resolve: vi.fn(), download: vi.fn(), journal: vi.fn(),
}));

vi.mock('@/services/cloud-sync', async () => {
  const { create } = await import('zustand');
  return {
    useCloudSync: create(() => ({ phase: 'local', session: null, pending: 0, conflicts: 0, lastSyncedAt: null, error: '' })),
    pairDevice: api.pair, synchronizeCloud: api.sync, listTrustedDevices: api.list,
    issueDeviceCode: api.issue, revokeDevice: api.revoke, logoutDevice: api.logout, resolveCloudConflicts: api.resolve,
  };
});
vi.mock('@/stores/recall-store', async () => {
  const { create } = await import('zustand');
  return { useRecallStore: create(() => ({ decks: [], cards: [], reviewLogs: [], studySessions: [], settings: {} })) };
});
vi.mock('@/stores/store-helpers', () => ({
  dataState: (state: RecallStateSnapshot): RecallStateSnapshot => ({ decks: state.decks, cards: state.cards, reviewLogs: state.reviewLogs, studySessions: state.studySessions, settings: state.settings }),
}));
vi.mock('@/services/cloud-cache', () => ({ readJournal: api.journal }));
vi.mock('@/services/memory-actions', () => ({ downloadMemoryText: api.download }));

import { useCloudSync } from '@/services/cloud-sync';
import { useRecallStore } from '@/stores/recall-store';
import { MemoryCloudSettings, MemoryCloudStatus } from '../memory-cloud';

const currentSession = { spaceId: 'private-space-id', device: { id: 'this-device', label: '我的 iPhone' } };
const trusted = [
  { id: 'this-device', label: '我的 iPhone', createdAt: 1, lastSeenAt: Date.now(), revokedAt: null },
  { id: 'other-device', label: '我的 Mac', createdAt: 2, lastSeenAt: Date.now(), revokedAt: null },
  { id: 'revoked-device', label: '旧设备', createdAt: 3, lastSeenAt: Date.now(), revokedAt: 4 },
];

function fixture(): RecallStateSnapshot {
  return {
    decks: [{ id: 'deck-1', name: '测试卡组', description: '', color: 'slate', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    cards: [{ id: 'card-1', deckId: 'deck-1', front: '本机问题', back: '本机答案', hint: '', source: '', tags: [], cardType: 'basic', state: 'review', stability: 10, difficulty: 5, elapsedDays: 2, scheduledDays: 10, reps: 8, lapses: 0, learningSteps: 0, lastReviewDate: '2026-01-01', nextReviewDate: '2026-01-11', createdAt: '2026-01-01', updatedAt: '2026-01-02' }],
    studySessions: [], reviewLogs: [],
    settings: {
      theme: 'light', accentColor: 'zinc', dyslexiaFont: false, seededAt: '', dailyNewCardLimit: 20,
      leechThreshold: 5, onboardingComplete: true, xp: 0, achievements: [], dailyGoal: 20,
      notificationsEnabled: false, soundVolume: 100, allowHtml: false, desiredRetention: .9,
      backupFolder: null, backupSchedule: 'never', lastBackupAt: null, syncFolder: null,
      syncEnabled: true, syncCode: 'synthetic-device-secret', syncRelayUrl: 'https://synthetic-relay.invalid',
      syncLastAt: null, syncAutoInterval: 0, ttsEnabled: false, ttsAutoRead: false,
      ttsSpeed: 1, fsrsWeights: null, voiceInputEnabled: true, swipeGestures: true,
    },
  };
}

function journalFixture(): CloudJournal {
  const snapshot = fixture();
  const local = snapshotEntities(snapshot).find(entity => entity.kind === 'card')!;
  const remote = { ...local, revision: 4, value: { ...snapshot.cards[0], front: '云端问题', back: '云端答案', reps: 12 } };
  return { version: 1, spaceId: currentSession.spaceId, base: { revision: 4, entities: [remote] }, pending: null, migrating: false, conflicts: [{ key: 'card:card-1', local, remote }] };
}

function authorize(phase: ReturnType<typeof useCloudSync.getState>['phase'] = 'synced'): void {
  useCloudSync.setState({ phase, session: currentSession });
}

async function openConflicts(journal = journalFixture()): Promise<void> {
  authorize('conflict');
  useCloudSync.setState({ conflicts: journal.conflicts.length });
  api.journal.mockReturnValue(journal);
  await act(async () => { render(<MemoryCloudSettings />); });
}

async function backupAndChoose(choice: 'local' | 'remote'): Promise<void> {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导出冲突双方备份' })); });
  fireEvent.click(screen.getByRole('checkbox', { name: '我已保存包含本机和云端双方版本的备份文件' }));
  fireEvent.click(screen.getByRole('radio', { name: choice === 'local' ? '保留本机版本，覆盖云端冲突' : '使用云端版本，覆盖本机冲突' }));
}

describe('mobile cloud components', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useCloudSync.setState({ phase: 'local', session: null, pending: 0, conflicts: 0, lastSyncedAt: null, error: '' });
    useRecallStore.setState(fixture());
    api.journal.mockReturnValue(null);
    for (const method of [api.pair, api.sync, api.revoke, api.logout, api.resolve]) method.mockResolvedValue(undefined);
    api.list.mockResolvedValue(trusted);
    api.issue.mockResolvedValue({ code: 'synthetic-once-only-device-code', expiresAt: Date.now() + 900000 });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each(['checking', 'local', 'unauthorized', 'syncing', 'synced', 'offline', 'pending', 'conflict', 'error'] as const)('shows %s without a local-use gate or automatic sync', phase => {
    useCloudSync.setState({ phase, session: phase === 'local' || phase === 'checking' ? null : currentSession, pending: 3, conflicts: 2 });
    render(<MemoryCloudStatus />);
    expect(screen.getByText('待同步 3 项')).toBeTruthy();
    expect(screen.getByText('冲突 2 项')).toBeTruthy();
    expect(screen.getByText(/本机阅读、编辑和复习不受影响/)).toBeTruthy();
    expect(api.sync).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets a blank device enter a strong recovery code and trims pairing inputs', async () => {
    useRecallStore.setState({ cards: [], decks: [] });
    render(<MemoryCloudStatus />);
    fireEvent.change(screen.getByLabelText('设备名称'), { target: { value: '  我的 iPhone  ' } });
    const codeInput = screen.getByLabelText('授权 / 恢复码');
    fireEvent.change(codeInput, { target: { value: '  synthetic-strong-owner-recovery-code-12345  ' } });
    expect(codeInput.getAttribute('type')).toBe('password');
    expect(codeInput.getAttribute('maxlength')).toBe('256');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '授权并合并' })); });
    expect(api.pair).toHaveBeenCalledExactlyOnceWith('synthetic-strong-owner-recovery-code-12345', '我的 iPhone');
    expect((codeInput as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/首次授权会先自动保存/)).toBeNull();
    expect(api.download).not.toHaveBeenCalled();
  });

  it('offers reauthorization even with a cached session and makes migration/credential-free backup explicit', async () => {
    authorize('unauthorized');
    render(<MemoryCloudStatus />);
    expect(screen.getByText(/保留原有编号和复习记录/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '授权并合并' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '立即同步' })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '备份本机数据' })); });
    const payload = JSON.parse(api.download.mock.calls[0][0]);
    expect(payload.cards[0].id).toBe('card-1');
    expect(payload.cards[0].reps).toBe(8);
    expect(payload.settings.syncCode).toBeNull();
    expect(api.download.mock.calls[0][0]).not.toContain('synthetic-device-secret');
    expect(api.download.mock.calls[0][0]).not.toContain(currentSession.spaceId);
  });

  it('clears a failed pairing code, reports the failure, and requires re-entry to retry', async () => {
    api.pair.mockRejectedValueOnce(new Error('授权码无效或已过期'));
    render(<MemoryCloudStatus />);
    fireEvent.change(screen.getByLabelText('设备名称'), { target: { value: '手机' } });
    fireEvent.change(screen.getByLabelText('授权 / 恢复码'), { target: { value: 'synthetic-code' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '授权并合并' })); });
    expect(screen.getByRole('alert').textContent).toBe('授权码无效或已过期');
    expect((screen.getByLabelText('授权 / 恢复码') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: '授权并合并' })).toBeDisabled();
  });

  it('does not claim a completed retry if the service returns an error status', async () => {
    authorize('error');
    useCloudSync.setState({ error: '服务不可用', pending: 7 });
    api.sync.mockImplementation(async () => { useCloudSync.setState({ phase: 'offline', error: '仍然离线' }); });
    render(<MemoryCloudStatus />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试同步' })); });
    expect(api.sync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('仍然离线')).toBeTruthy();
    expect(screen.getByText('待同步 7 项')).toBeTruthy();
    expect(screen.queryByText('云同步 · 已同步')).toBeNull();
  });

  it('keeps home compact and delegates management through the optional callback', () => {
    authorize('conflict');
    useCloudSync.setState({ conflicts: 1 });
    const manage = vi.fn();
    render(<MemoryCloudStatus onManage={manage} />);
    fireEvent.click(screen.getByRole('button', { name: '处理冲突' }));
    expect(manage).toHaveBeenCalledOnce();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: '立即同步' })).toBeDisabled();
  });

  it('exports BOTH conflict variants with stable identity and progress but no credentials', async () => {
    await openConflicts();
    const panel = screen.getByRole('region', { name: '先保留双方，再处理冲突' });
    expect(within(panel).getByLabelText('card:card-1 本机版本').textContent).toContain('本机答案');
    expect(within(panel).getByLabelText('card:card-1 云端版本').textContent).toContain('云端答案');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: '备份并选择版本后继续' })).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导出冲突双方备份' })); });
    const raw = api.download.mock.calls[0][0] as string;
    const payload = JSON.parse(raw);
    expect(payload.local.cards[0]).toMatchObject({ id: 'card-1', back: '本机答案', reps: 8 });
    expect(payload.remote.cards[0]).toMatchObject({ id: 'card-1', back: '云端答案', reps: 12 });
    expect(payload.conflicts[0].local.value.back).toBe('本机答案');
    expect(payload.conflicts[0].remote.value.back).toBe('云端答案');
    for (const secret of ['synthetic-device-secret', currentSession.spaceId, 'synthetic-relay.invalid']) expect(raw).not.toContain(secret);
    expect(screen.getByRole('radio', { name: '使用云端版本，覆盖本机冲突' })).toBeDisabled();
    expect(api.resolve).not.toHaveBeenCalled();
  });

  it.each(['local', 'remote'] as const)('requires saved backup, explicit %s choice, and confirmation before resolving', async choice => {
    await openConflicts();
    await backupAndChoose(choice);
    const button = screen.getByRole('button', { name: choice === 'local' ? '确认保留本机版本' : '确认使用云端版本' });
    expect(api.resolve).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await act(async () => { fireEvent.click(button); });
    expect(api.resolve).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(button); });
    expect(api.resolve).toHaveBeenCalledExactlyOnceWith(choice);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('全部 1 项冲突'));
  });

  it('uses live edited local conflict content rather than a stale journal value', async () => {
    const current = fixture();
    useRecallStore.setState({ cards: [{ ...current.cards[0], back: '最新本机答案' }] });
    await openConflicts();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导出冲突双方备份' })); });
    const payload = JSON.parse(api.download.mock.calls[0][0]);
    expect(payload.local.cards[0].back).toBe('最新本机答案');
    expect(payload.conflicts[0].local.value.back).toBe('最新本机答案');
  });

  it('invalidates the backup after edits and after an unseen journal change', async () => {
    const journal = journalFixture();
    await openConflicts(journal);
    await backupAndChoose('remote');
    const changed: Card = { ...fixture().cards[0], back: '备份后又编辑' };
    act(() => useRecallStore.setState({ cards: [changed] }));
    expect(screen.getByRole('button', { name: '确认使用云端版本' })).toBeDisabled();
    expect(screen.getByText('数据已变化，需要重新导出双方备份。')).toBeTruthy();
    await backupAndChoose('remote');
    api.journal.mockReturnValue({ ...journal, base: { ...journal.base, revision: 5 } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认使用云端版本' })); });
    expect(api.resolve).not.toHaveBeenCalled();
    expect(screen.getByText('本机数据或冲突已变化，请重新预览并导出双方备份。')).toBeTruthy();
  });

  it('blocks overwrite when backup download fails or when conflict settings could contain credentials', async () => {
    await openConflicts();
    api.download.mockImplementationOnce(() => { throw new Error('下载失败'); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导出冲突双方备份' })); });
    expect(screen.getByText('下载失败')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(api.resolve).not.toHaveBeenCalled();
    const journal = journalFixture();
    journal.conflicts[0] = { key: 'setting:syncCode', local: { kind: 'setting', id: 'syncCode', revision: 0, value: 'synthetic-secret' }, remote: { kind: 'setting', id: 'syncCode', revision: 1, value: 'synthetic-remote-secret' } };
    api.journal.mockReturnValue(journal);
    fireEvent.click(screen.getByRole('button', { name: '刷新冲突详情' }));
    expect(screen.getByText(/冲突包含不可导出的设备设置/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '导出冲突双方备份' })).toBeDisabled();
  });

  it('shows deletion as a conflict variant and exports the deletion without losing the other version', async () => {
    const journal = journalFixture();
    journal.conflicts[0].remote.value = null;
    await openConflicts(journal);
    expect(screen.getByLabelText('card:card-1 云端版本').textContent).toContain('此版本已删除');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导出冲突双方备份' })); });
    const payload = JSON.parse(api.download.mock.calls[0][0]);
    expect(payload.local.cards).toHaveLength(1);
    expect(payload.remote.cards).toHaveLength(0);
    expect(payload.conflicts[0].remote.value).toBeNull();
  });

  it('fails closed with malformed or missing conflict details', async () => {
    await openConflicts();
    api.journal.mockImplementation(() => { throw new Error('队列损坏'); });
    fireEvent.click(screen.getByRole('button', { name: '刷新冲突详情' }));
    expect(screen.getByText('队列损坏')).toBeTruthy();
    expect(screen.getByRole('button', { name: '备份并选择版本后继续' })).toBeDisabled();
    api.journal.mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: '刷新冲突详情' }));
    expect(screen.getByText(/当前没有可读取的冲突详情/)).toBeTruthy();
    expect(api.resolve).not.toHaveBeenCalled();
  });

  it('identifies the current device, omits revoked devices, and confirms other-device revocation', async () => {
    authorize();
    await act(async () => { render(<MemoryCloudSettings />); });
    expect(screen.getByText('当前设备')).toBeTruthy();
    expect(screen.queryByText('旧设备')).toBeNull();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '撤销 我的 Mac' }));
    expect(api.revoke).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤销 我的 Mac' })); });
    expect(api.revoke).toHaveBeenCalledExactlyOnceWith('other-device');
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('不能清除设备已有的离线数据'));
  });

  it('warns before revoking/logging out the pending current device and blocks both during sync', async () => {
    authorize('pending');
    useCloudSync.setState({ pending: 5, conflicts: 2 });
    await act(async () => { render(<MemoryCloudSettings />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤销 我的 iPhone（当前设备）' })); });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('本机还有 5 项待同步、2 项冲突'));
    expect(api.revoke).toHaveBeenCalledExactlyOnceWith('this-device');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '退出本机授权' })); });
    expect(api.logout).toHaveBeenCalledOnce();
    act(() => useCloudSync.setState({ phase: 'syncing' }));
    expect(screen.getByRole('button', { name: '退出本机授权' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '撤销 我的 Mac' })).toBeDisabled();
  });

  it('reports a device-list error and supports manual refresh without a false empty-list claim', async () => {
    authorize('offline');
    api.list.mockRejectedValueOnce(new Error('设备查询离线'));
    await act(async () => { render(<MemoryCloudSettings />); });
    expect(screen.getByText('设备查询离线')).toBeTruthy();
    expect(screen.getByText('设备列表尚未取得，请重试刷新。')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '刷新设备列表' })); });
    expect(screen.getByText('我的 Mac')).toBeTruthy();
  });

  it('keeps issued codes ephemeral, interprets expiry as milliseconds, and clears expired display', async () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 900000;
    api.issue.mockResolvedValue({ code: 'synthetic-once-only-device-code', expiresAt });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    authorize();
    await act(async () => { render(<MemoryCloudSettings />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成新设备码' })); });
    expect(screen.getByText('synthetic-once-only-device-code')).toBeTruthy();
    expect(document.querySelector('time')?.dateTime).toBe(new Date(expiresAt).toISOString());
    expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(899999));
    expect(screen.getByText('synthetic-once-only-device-code')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('synthetic-once-only-device-code')).toBeNull();
    expect(screen.getByText('设备码已过期，需要时请重新生成。')).toBeTruthy();
  });

  it('removes issued code on loss of authorization or unmount, and rejects invalid timestamps', async () => {
    authorize();
    const view = render(<MemoryCloudSettings />);
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成新设备码' })); });
    expect(screen.getByText('synthetic-once-only-device-code')).toBeTruthy();
    act(() => useCloudSync.setState({ phase: 'unauthorized' }));
    expect(screen.queryByText('synthetic-once-only-device-code')).toBeNull();
    act(() => authorize());
    await act(async () => {});
    api.issue.mockResolvedValueOnce({ code: 'synthetic-invalid-code', expiresAt: NaN });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成新设备码' })); });
    expect(screen.getByText('设备码有效期无效，请重试生成。')).toBeTruthy();
    expect(screen.queryByText('synthetic-invalid-code')).toBeNull();
    view.unmount();
    await act(async () => { render(<MemoryCloudSettings />); });
    expect(screen.queryByText('synthetic-once-only-device-code')).toBeNull();
  });

  it('locks same-frame double pairing submits and does not perform any UI storage writes', async () => {
    let finish!: () => void;
    api.pair.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    render(<MemoryCloudStatus />);
    fireEvent.change(screen.getByLabelText('设备名称'), { target: { value: '手机' } });
    fireEvent.change(screen.getByLabelText('授权 / 恢复码'), { target: { value: 'synthetic-code' } });
    act(() => {
      const form = screen.getByRole('form', { name: '授权这台设备' });
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(api.pair).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '正在授权' })).toBeDisabled();
    await act(async () => { finish(); });
    expect(write).not.toHaveBeenCalled();
  });
});
