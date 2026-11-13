import { create } from 'zustand';
import { backendFetch } from '../../shared/client-http';
import { pauseMediaSync, synchronizeMedia, useMediaSync } from './media-sync';
import { applyEntities, type CloudState } from '../../shared/cloud';
import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { commitMemory } from './memory-actions';
import { validateImportSnapshot } from './repository';
import { buildExportPayload } from './import-export';
import { acknowledgeMutation, backupKey, pendingChanges, readJournal, reconcileCloud, type CloudJournal } from './cloud-cache';

interface PersonalStatus {
  available: boolean;
  enabled: boolean;
  running: boolean;
  phase: 'local' | 'syncing' | 'synced' | 'conflict' | 'offline' | 'error';
  error: string;
  lastSyncedAt: string | null;
}
export const usePersonalSync = create<PersonalStatus>(() => ({ available: false, enabled: false, running: false, phase: 'local', error: '', lastSyncedAt: null }));
const accountStorage = 'recall.miaoda.personal.account.v1';
const enabledStorage = 'recall.miaoda.personal.enabled.v1';
const syncedStorage = 'recall.miaoda.personal.synced.v1';
let active: Promise<void> | null = null;
let generation = 0;
class PersonalApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function api(method: string, account: string | null, body?: unknown, since?: number): Promise<{ state: CloudState; account: string }> {
  const response = await backendFetch(`/api/recall/personal-sync${since === undefined ? '' : `?since=${since}`}`, {
    method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(account ? { 'X-Recall-Account-Key': account } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new PersonalApiError('个人同步服务尚未启用，本机数据不受影响。', 503);
  const payload = await response.json();
  if (!response.ok) throw new PersonalApiError(typeof payload.error === 'string' ? payload.error : '个人同步失败，本机数据仍保留。', response.status);
  const key = response.headers.get('x-recall-account-key');
  if (!key || !/^[a-f0-9]{64}$/.test(key) || account && key !== account) throw new PersonalApiError('登录账号发生变化，已停止同步，请保留本机备份。', 401);
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0 || method === 'GET' && !Array.isArray(payload.entities)) {
    throw new PersonalApiError('同步响应无效，本机数据仍保留。', 503);
  }
  return { state: payload as CloudState, account: key };
}

function journal(value: CloudJournal | null, account: string): CloudJournal {
  if (!value || value.spaceId !== `miaoda-personal-${account}`) throw new Error('本机同步队列与登录账号不一致，请先保留备份。');
  return value;
}

async function run(currentGeneration: number): Promise<void> {
  if (!usePersonalSync.getState().available || !usePersonalSync.getState().enabled || currentGeneration !== generation) return;
  if (!useRecallStore.getState().isInitialized || useRecallStore.getState().error) throw new Error('本机资料库尚未成功载入，已暂停同步。');
  if (!navigator.onLine) { usePersonalSync.setState({ phase: 'offline', error: '当前离线，本机修改保留，联网后重试。' }); return; }
  const local = dataState(useRecallStore.getState());
  if (local.cards.some(card => card.cardType === 'image-occlusion')) {
    throw new Error('旧版图片遮挡卡暂不支持同步，请保留完整带图备份。');
  }
  const savedAccount = localStorage.getItem(accountStorage);
  const connection = await api('GET', savedAccount);
  if (currentGeneration !== generation) return;
  const account = connection.account;
  const previous = readJournal();
  if (previous && previous.spaceId !== `miaoda-personal-${account}`) throw new Error('此浏览器已有其他同步资料库，不能自动混合上传。请先保留备份。');
  if (!previous) {
    if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(buildExportPayload(local)));
    await commitMemory(current => current, (current, latest) => ({ snapshot: current,
      journal: latest ? journal(latest, account) : { version: 1, spaceId: `miaoda-personal-${account}`, base: { revision: 0, entities: [] }, pending: null, conflicts: [], migrating: true } }));
  }
  localStorage.setItem(accountStorage, account);
  for (let attempt = 0; attempt < 8 && currentGeneration === generation; attempt++) {
    let current = journal(readJournal(), account);
    const latest = dataState(useRecallStore.getState());
    if (latest.cards.some(card => card.cardType === 'image-occlusion')) {
      throw new Error('旧版图片遮挡卡暂不支持同步，请保留完整带图备份。');
    }
    await synchronizeMedia(`miaoda-personal-${account}`);
    if (currentGeneration !== generation) return;
    if (useMediaSync.getState().error) throw new Error(useMediaSync.getState().error);
    if (current.pending) {
      try {
        const acknowledged = await api('POST', account, current.pending);
        if (currentGeneration !== generation) return;
        await commitMemory(snapshot => snapshot, (snapshot, latest) => ({ snapshot, journal: acknowledgeMutation(journal(latest, account), acknowledged.state.revision) }));
      } catch (error) {
        if (!(error instanceof PersonalApiError) || error.status !== 409) throw error;
        await commitMemory(snapshot => snapshot, (snapshot, latest) => ({ snapshot, journal: { ...journal(latest, account), pending: null } }));
      }
    }
    current = journal(readJournal(), account);
    const incoming = await api('GET', account, undefined, current.base.revision);
    if (currentGeneration !== generation) return;
    await commitMemory(snapshot => snapshot, (snapshot, latest) => reconcileCloud(snapshot, journal(latest, account), incoming.state, validateImportSnapshot));
    await synchronizeMedia(`miaoda-personal-${account}`);
    if (currentGeneration !== generation) return;
    if (useMediaSync.getState().error) throw new Error(useMediaSync.getState().error);
    current = journal(readJournal(), account);
    if (current.conflicts.length) { usePersonalSync.setState({ phase: 'conflict', error: '两台设备修改了同一内容，已保留双方版本。请选择要保留的版本后重试。' }); return; }
    if (!pendingChanges(dataState(useRecallStore.getState()), current).length) {
      const lastSyncedAt = new Date().toISOString();
      localStorage.setItem(syncedStorage, JSON.stringify({ account, lastSyncedAt }));
      usePersonalSync.setState({ phase: 'synced', error: '', lastSyncedAt }); return;
    }
    await commitMemory(snapshot => snapshot, (snapshot, latest) => {
      const base = journal(latest, account);
      const changes = pendingChanges(snapshot, base);
      return { snapshot, journal: { ...base, pending: changes.length ? { id: crypto.randomUUID(), baseRevision: base.base.revision, changes } : null } };
    });
  }
}

export function synchronizePersonal(): Promise<void> {
  if (active) return active;
  const currentGeneration = generation;
  usePersonalSync.setState({ running: true, phase: 'syncing', error: '' });
  const work = () => run(currentGeneration);
  active = (navigator.locks ? navigator.locks.request('recall-personal-sync', work) : work())
    .catch((error: unknown) => {
      pauseMediaSync();
      if (currentGeneration === generation) usePersonalSync.setState({ phase: 'error', error: error instanceof Error ? error.message : '个人同步失败，本机数据仍保留。' });
    }).finally(() => { active = null; if (currentGeneration === generation) usePersonalSync.setState({ running: false }); });
  return active;
}

export function enablePersonalSync(): Promise<void> {
  if (!usePersonalSync.getState().available) return Promise.resolve();
  localStorage.setItem(enabledStorage, '1');
  usePersonalSync.setState({ enabled: true });
  return synchronizePersonal();
}

export function pausePersonalSync(): void {
  generation++;
  pauseMediaSync();
  localStorage.removeItem(enabledStorage);
  usePersonalSync.setState({ enabled: false, running: false, phase: 'local' });
}

export async function resolvePersonalConflicts(choice: 'local' | 'remote'): Promise<void> {
  const account = localStorage.getItem(accountStorage);
  if (!account) return;
  await commitMemory(snapshot => snapshot, (snapshot, latest) => {
    const current = journal(latest, account);
    const next = choice === 'remote' ? applyEntities(snapshot, current.conflicts.map(conflict => conflict.remote)) : snapshot;
    validateImportSnapshot(next);
    return { snapshot: next, journal: { ...current, pending: null, conflicts: [] } };
  });
  await synchronizePersonal();
}

export function installPersonalSync(): () => void {
  generation++;
  const enabled = localStorage.getItem(enabledStorage) === '1';
  let lastSyncedAt: string | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(syncedStorage) || 'null');
    if (saved?.account === localStorage.getItem(accountStorage) && typeof saved.lastSyncedAt === 'string' && Number.isFinite(Date.parse(saved.lastSyncedAt))) lastSyncedAt = saved.lastSyncedAt;
  } catch { lastSyncedAt = null; }
  usePersonalSync.setState({ available: true, enabled, running: false, lastSyncedAt, phase: 'local', error: '' });
  const tick = () => { if (usePersonalSync.getState().enabled && useRecallStore.getState().isInitialized && !useRecallStore.getState().error && document.visibilityState !== 'hidden') void synchronizePersonal(); };
  const timer = setInterval(tick, 15000);
  const unsubscribe = useRecallStore.subscribe((state, previous) => { if (state.isInitialized && !previous.isInitialized) tick(); });
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', tick);
  tick();
  return () => {
    generation++;
    pauseMediaSync();
    clearInterval(timer);
    unsubscribe();
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', tick);
    usePersonalSync.setState({ available: false, enabled: false, running: false });
  };
}
