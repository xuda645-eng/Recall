import { useRecallStore } from '@/stores/recall-store';
import { getRecallRepository } from '@/services/repository';
import { dataState } from '@/stores/store-helpers';
import { migrateFolders,validateTree } from '@/lib/memory-folders';
import type { RecallStateSnapshot } from '@/types';
import { readJournal, type CloudJournal } from '@/services/cloud-cache';
// One queue covers every new workspace write; subsequent tasks start from latest data.
let queue: Promise<void> = Promise.resolve();
function sanitizeFolderBackup(raw: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('迁移备份不是有效 JSON，已保留原始数据，请先备份并修复后重试'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('迁移备份格式无效，已保留原始数据，请先备份并修复后重试');
  }
  const snapshot = parsed as Record<string, unknown>;
  const settings = snapshot.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('迁移备份设置格式无效，已保留原始数据，请先备份并修复后重试');
  }
  const { cloudJournal: _cloudJournal, ...data } = snapshot;
  return JSON.stringify({ ...data, settings: { ...settings, syncCode: null, syncEnabled: false, syncRelayUrl: '' } });
}
function preserveFolderBackup(): void {
  if (typeof localStorage === 'undefined') return;
  const key = 'recall.snapshot.pre-folders.v1';
  const existing = localStorage.getItem(key);
  const source = existing ?? localStorage.getItem('recall.snapshot.v1');
  if (source === null) return;
  const sanitized = sanitizeFolderBackup(source);
  if (sanitized !== existing) localStorage.setItem(key, sanitized);
}
export function commitMemory(change:(current:RecallStateSnapshot)=>RecallStateSnapshot, cloud?: (current:RecallStateSnapshot, journal:CloudJournal|null)=>{snapshot:RecallStateSnapshot;journal:CloudJournal}):Promise<void>{
  const commit=async()=>{preserveFolderBackup();const repo=await getRecallRepository();const journal=readJournal();const before=migrateFolders(journal?await repo.loadAppData():dataState(useRecallStore.getState()));const result=cloud?.(before,journal);const snapshot=result?.snapshot??change(before);validateTree(snapshot.decks);
    await repo.saveSnapshot(snapshot,result?.journal);useRecallStore.setState({...snapshot,error:null});
  };
  const work=queue.then(()=>navigator.locks?navigator.locks.request('recall-cache',commit):commit());queue=work.catch(()=>{});return work;
}
export function downloadMemoryText(text:string,name:string,type='text/markdown;charset=utf-8'):void{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/]/g,'-');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
