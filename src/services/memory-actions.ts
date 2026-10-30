import { useRecallStore } from '@/stores/recall-store';
import { getRecallRepository } from '@/services/repository';
import { dataState } from '@/stores/store-helpers';
import { migrateFolders,validateTree } from '@/lib/memory-folders';
import type { RecallStateSnapshot } from '@/types';
// One queue covers every new workspace write; subsequent tasks start from latest data.
let queue: Promise<void> = Promise.resolve();
export function commitMemory(change:(current:RecallStateSnapshot)=>RecallStateSnapshot):Promise<void>{
  const work=queue.then(async()=>{const before=dataState(useRecallStore.getState());const snapshot=change(migrateFolders(before));validateTree(snapshot.decks);
    if(typeof localStorage!=='undefined'){const raw=localStorage.getItem('recall.snapshot.v1');if(raw&&!localStorage.getItem('recall.snapshot.pre-folders.v1'))localStorage.setItem('recall.snapshot.pre-folders.v1',raw);}
    const repo=await getRecallRepository();await repo.saveSnapshot(snapshot);useRecallStore.setState({...snapshot,error:null});
  });queue=work.catch(()=>{});return work;
}
export function downloadMemoryText(text:string,name:string,type='text/markdown;charset=utf-8'):void{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/]/g,'-');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
