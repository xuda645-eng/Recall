import { create } from 'zustand';
import { commitMemory } from '@/services/memory-actions';
import { buildExportPayload } from '@/services/import-export';
import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { validateImportSnapshot } from '@/services/repository';
import { acknowledgeMutation, backupKey, pendingChanges, readJournal, reconcileCloud, type CloudJournal } from '@/services/cloud-cache';
import { applyEntities, type CloudState, type DeviceSession, type TrustedDevice } from '../../shared/cloud';
import { pauseMediaSync, synchronizeMedia } from '@/services/media-sync';

type SyncPhase = 'checking' | 'local' | 'unauthorized' | 'syncing' | 'synced' | 'offline' | 'pending' | 'conflict' | 'error';
interface CloudStatus {
  phase: SyncPhase;
  session: DeviceSession | null;
  pending: number;
  conflicts: number;
  lastSyncedAt: string | null;
  error: string;
}
export const useCloudSync = create<CloudStatus>(() => ({ phase: 'checking', session: null, pending: 0, conflicts: 0, lastSyncedAt: null, error: '' }));
const sessionKey = 'recall.cloud.session.v1';
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function api<Result>(path: string, method = 'GET', body?: unknown): Promise<Result> {
  const response = await fetch(`/api/${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const type = response.headers.get('Content-Type') ?? '';
  if (!type.includes('application/json')) throw new ApiError('此站点尚未启用云同步，本机数据不受影响。', 503);
  const payload = await response.json() as Result & { error?: string };
  if (!response.ok) throw new ApiError(payload.error ?? `云同步请求失败 (${response.status})`, response.status);
  return payload;
}

function cachedSession(): DeviceSession | null {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  const session = JSON.parse(raw) as DeviceSession;
  return typeof session?.spaceId === 'string' && typeof session.device?.id === 'string'
    && typeof session.device.label === 'string' ? session : null;
}

function requireJournal(journal: CloudJournal | null): CloudJournal {
  if (!journal) throw new Error('云同步尚未初始化');
  return journal;
}

function refreshCounts(): void {
  const journal = readJournal();
  const snapshot = dataState(useRecallStore.getState());
  const pending = journal ? pendingChanges(snapshot, journal).length : 0;
  const conflicts = journal?.conflicts.length ?? 0;
  useCloudSync.setState({ pending, conflicts });
}

function syncFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const unauthorized = error instanceof ApiError && error.status === 401;
  if (unauthorized) pauseMediaSync();
  const unavailable = error instanceof ApiError && error.status === 503;
  useCloudSync.setState({ phase: unauthorized ? 'unauthorized' : !navigator.onLine ? 'offline' : unavailable && !useCloudSync.getState().session ? 'local' : 'error', error: message });
  try { refreshCounts(); }
  catch { useCloudSync.setState({ phase: 'error', error: '云同步队列无法读取，已保留本机数据，请先备份。' }); }
}

async function acceptSession(session: DeviceSession): Promise<void> {
  const previous = readJournal();
  if (previous && previous.spaceId !== session.spaceId) throw new Error('此设备缓存属于另一个数据空间。请先备份，并使用独立浏览器授权，不能混合上传。');
  if (!previous) {
    const snapshot = dataState(useRecallStore.getState());
    if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(buildExportPayload(snapshot)));
    await commitMemory(current => current, current => ({ snapshot: current, journal: { version: 1, spaceId: session.spaceId, base: { revision: 0, entities: [] }, pending: null, conflicts: [], migrating: true } }));
  }
  localStorage.setItem(sessionKey, JSON.stringify(session));
  useCloudSync.setState({ session, phase: 'pending', error: '' });
}

export async function pairDevice(code: string, label: string): Promise<void> {
  await acceptSession(await api<DeviceSession>('auth/pair', 'POST', { code: code.trim(), label: label.trim() }));
  await synchronizeCloud();
}
export async function listTrustedDevices(): Promise<TrustedDevice[]> { return (await api<{ devices: TrustedDevice[] }>('auth/devices')).devices; }
export async function issueDeviceCode(): Promise<{ code: string; expiresAt: number }> { return api('auth/codes', 'POST', {}); }
export async function revokeDevice(id: string): Promise<void> {
  await api(`auth/devices/${encodeURIComponent(id)}`, 'DELETE');
  if (useCloudSync.getState().session?.device.id === id) { pauseMediaSync(); useCloudSync.setState({ phase: 'unauthorized', error: '本机授权已撤销，本地缓存仍保留。' }); }
}
export async function logoutDevice(): Promise<void> {
  await api('auth/logout', 'POST', {});
  pauseMediaSync();
  useCloudSync.setState({ phase: 'unauthorized', error: '本机授权已退出，待同步数据和缓存仍保留。' });
}

let activeSync: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function performSync(): Promise<void> {
  if (!useCloudSync.getState().session) return;
  if (!navigator.onLine) { useCloudSync.setState({ phase: 'offline' }); refreshCounts(); return; }
  useCloudSync.setState({ phase: 'syncing', error: '' });
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      let journal = requireJournal(readJournal());
      if (journal.pending) {
        try {
          const receipt = await api<{ revision: number }>('sync', 'POST', journal.pending);
          await commitMemory(current => current, (current, latest) => ({ snapshot: current, journal: acknowledgeMutation(requireJournal(latest), receipt.revision) }));
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          await commitMemory(current => current, (current, latest) => ({ snapshot: current, journal: { ...requireJournal(latest), pending: null } }));
        }
        journal = requireJournal(readJournal());
      }
      const incoming = await api<CloudState>(`sync?since=${journal.base.revision}`);
      await commitMemory(current => current, (current, latest) => {
        const result = reconcileCloud(current, requireJournal(latest), incoming, validateImportSnapshot);
        validateImportSnapshot(result.snapshot);
        return result;
      });
      journal = requireJournal(readJournal());
      refreshCounts();
      if (journal.conflicts.length) { useCloudSync.setState({ phase: 'conflict' }); return; }
      const changes = pendingChanges(dataState(useRecallStore.getState()), journal);
      if (!changes.length) {
        useCloudSync.setState({ phase: 'synced', error: '', lastSyncedAt: new Date().toISOString() });
        void synchronizeMedia(useCloudSync.getState().session!.spaceId).catch(() => {});
        return;
      }
      await commitMemory(current => current, (current, latest) => {
        const base = requireJournal(latest);
        const changes = pendingChanges(current, base);
        return { snapshot: current, journal: { ...base, pending: changes.length ? { id: crypto.randomUUID(), baseRevision: base.base.revision, changes } : null } };
      });
    }
    useCloudSync.setState({ phase: 'pending' });
  } catch (error) { syncFailure(error); }
}

export function synchronizeCloud(): Promise<void> {
  if (activeSync) return activeSync;
  const run = async () => {
    if (readJournal()) await commitMemory(current => current);
    await performSync();
  };
  activeSync = (navigator.locks ? navigator.locks.request('recall-cloud-sync', run) : run()).catch(syncFailure).finally(() => { activeSync = null; });
  return activeSync;
}

export async function resolveCloudConflicts(choice: 'local' | 'remote'): Promise<void> {
  await commitMemory(current => current, (current, latest) => {
    const journal = requireJournal(latest);
    const snapshot = choice === 'remote' ? applyEntities(current, journal.conflicts.map(conflict => conflict.remote)) : current;
    validateImportSnapshot(snapshot);
    return { snapshot, journal: { ...journal, conflicts: [], pending: null } };
  });
  await synchronizeCloud();
}

export function startCloudSync(): () => void {
  let stopped = false;
  let initializing = true;
  const onSaved = () => {
    refreshCounts();
    if (initializing || activeSync || !useCloudSync.getState().session) return;
    const phase = useCloudSync.getState().phase;
    if (phase === 'unauthorized' || phase === 'conflict') return;
    useCloudSync.setState({ phase: navigator.onLine ? 'pending' : 'offline' });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (!stopped) void synchronizeCloud(); }, 800);
  };
  const onResume = () => { if (!document.hidden && !stopped && useCloudSync.getState().phase !== 'unauthorized') void synchronizeCloud(); };
  window.addEventListener('recall-cache-saved', onSaved);
  window.addEventListener('online', onResume);
  window.addEventListener('offline', onSaved);
  const onStorage = (event: StorageEvent) => { if (event.key === 'recall.snapshot.v1') onResume(); };
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onResume);
  const poll = setInterval(onResume, 60000);
  void (async () => {
    try {
      const cached = cachedSession();
      if (cached) useCloudSync.setState({ session: cached });
      const session = await api<DeviceSession>('auth/session');
      if (stopped) return;
      await acceptSession(session);
      if (!stopped) await synchronizeCloud();
    } catch (error) { if (!stopped) syncFailure(error); }
    finally { initializing = false; }
  })();
  return () => {
    stopped = true;
    pauseMediaSync();
    clearInterval(poll);
    if (timer) clearTimeout(timer);
    window.removeEventListener('recall-cache-saved', onSaved);
    window.removeEventListener('online', onResume);
    window.removeEventListener('offline', onSaved);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onResume);
  };
}
