import type { Card, RecallStateSnapshot } from '@/types';
import { createId } from '@/lib/utils';
import { newMemoryCard } from '@/lib/memory-folders';
export interface MarkdownEntry { id: string; generated: boolean; path: string[]; front: string; back: string; kind: 'qa' | 'excerpt'; importedAt: string; bookTitle: string; chapter: string; line: number; meta: Record<string,string>; }
export interface MarkdownDocument { text: string; entries: MarkdownEntry[]; batchAt: string; }
export interface ImportRow { entry: MarkdownEntry; status: 'new' | 'duplicate' | 'change'; existing?: Card; }
export interface MarkdownPlan { document: MarkdownDocument; parentId: string | null; rows: ImportRow[]; fingerprint: string; }
export const snapshotFingerprint = (s: RecallStateSnapshot): string => JSON.stringify([s.decks.map(d=>({...d,parentId:d.parentId??null})),s.cards,s.reviewLogs,s.studySessions]);
export function importDate(value: string): string {
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){const d=new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));if(d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]&&d.getHours()===+(m[4]||0)&&d.getMinutes()===+(m[5]||0)&&d.getSeconds()===+(m[6]||0))return d.toISOString();}
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)){const prefix=value.slice(0,19);importDate(prefix);const d=new Date(value);if(Number.isFinite(+d))return d.toISOString();}
  throw new Error('导入时间无效');
}
export function parseMemoryMarkdown(raw: string, at=new Date().toISOString()): MarkdownDocument {
  if(new TextEncoder().encode(raw).length>5*1024*1024)throw new Error('文件不能超过 5 MB');
  const text=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'), lines=text.split('\n'), entries:MarkdownEntry[]=[], path:string[]=[], seen=new Set<string>();
  let open:{meta:Record<string,string>;body:string[];path:string[];line:number;fence:string|null}|null=null, outerFence:string|null=null;
  for(let i=0;i<lines.length;i++){const line=lines[i], start=line.match(/^\s*<!--\s*recall:card(?:\s+(\{.*\}))?\s*-->\s*$/),end=/^\s*<!--\s*recall:end\s*-->\s*$/.test(line),fence=line.match(/^\s*(`{3,}|~{3,})/);
    if(open){if(open.fence){if(new RegExp('^\\s*'+open.fence[0]+'{'+open.fence.length+',}\\s*$').test(line))open.fence=null;open.body.push(line);continue;}if(fence){open.fence=fence[1];open.body.push(line);continue;}if(start)throw new Error(`第 ${i+1} 行：上一张卡片未结束`);if(end){let body=open.body.join('\n').trim(),front='';const q=body.match(/^问题[：:]\s*([^\n]*)\n/);if(q){front=q[1].trim();body=body.slice(q[0].length).trim();}const kind=open.meta.type??(front?'qa':'excerpt');if(!['qa','excerpt'].includes(kind))throw new Error('类型仅支持 qa 或 excerpt');if(kind==='qa'&&!front)throw new Error('问答卡需要问题');if(!body||body.length>20000||front.length>10000)throw new Error('正文为空或内容过长');const id=open.meta.id||createId('card');if(seen.has(id))throw new Error('文件内卡片编号重复');seen.add(id);entries.push({id,generated:!open.meta.id,path:open.path,front:front||open.meta.title||'',back:body,kind:kind as MarkdownEntry['kind'],importedAt:open.meta.importedAt?importDate(open.meta.importedAt):at,bookTitle:open.meta.bookTitle||'',chapter:open.meta.chapter||'',line:open.line,meta:open.meta});open=null;continue;}open.body.push(line);continue;}
    if(outerFence){if(new RegExp('^\\s*'+outerFence[0]+'{'+outerFence.length+',}\\s*$').test(line))outerFence=null;continue;}if(fence){outerFence=fence[1];continue;}
    if(start){if(!path.length)throw new Error(`第 ${i+1} 行：缺少卡组标题`);let unknown:unknown;try{unknown=JSON.parse(start[1]||'{}');}catch{throw new Error(`第 ${i+1} 行：元数据不是 JSON`);}if(!unknown||typeof unknown!=='object'||Array.isArray(unknown))throw new Error('元数据须为对象');const meta=unknown as Record<string,string>;for(const k of Object.keys(meta)){if(!['id','importedAt','type','title','bookTitle','chapter'].includes(k)||typeof meta[k]!=='string')throw new Error(`元数据字段 ${k} 无效`);}if(meta.id&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(meta.id))throw new Error('编号格式无效');open={meta,body:[],path:[...path],line:i,fence:null};continue;}
    if(end)throw new Error('卡片结束标记前没有卡片');const h=line.match(/^(#+)\s+(.+?)\s*$/);if(h){const level=h[1].length,name=h[2].trim();if(level>32||level>path.length+1||!name||name.length>80)throw new Error(`第 ${i+1} 行：卡组层级或名称无效`);path.length=level-1;path.push(name);}else if(/recall:(card|end)/.test(line))throw new Error(`第 ${i+1} 行：卡片标记无效`);
  }
  if(open)throw new Error('卡片缺少 recall:end 或代码未闭合');if(!entries.length||entries.length>1000)throw new Error('每次导入 1–1000 张卡片');return {text,entries,batchAt:at};
}
function pathId(s:RecallStateSnapshot,path:string[],parent:string|null):string|null{let id=parent;for(const name of path){const d=s.decks.find(d=>(d.parentId??null)===id&&d.name===name);if(!d)return null;id=d.id;}return id;}
export function planMemoryImport(s:RecallStateSnapshot,document:MarkdownDocument,parentId:string|null):MarkdownPlan {
  if(parentId&&!s.decks.some(d=>d.id===parentId))throw new Error('目标卡组不存在');
  const seen=new Set<string>();const rows=document.entries.map(entry=>{const dest=pathId(s,entry.path,parentId);const existing=entry.generated?s.cards.find(c=>c.deckId===dest&&c.front===entry.front&&c.back===entry.back):s.cards.find(c=>c.id===entry.id);const key=existing?.id??entry.id;if(seen.has(key))throw new Error('文件中多条内容对应同一卡片');seen.add(key);const change=existing&&(existing.deckId!==dest||existing.front!==entry.front||existing.back!==entry.back||(existing.contentKind??'qa')!==entry.kind||(existing.bookTitle||'')!==entry.bookTitle||(existing.chapter||'')!==entry.chapter);return {entry,existing,status:existing?(change?'change':'duplicate'):'new'} as ImportRow;});
  return {document,parentId,rows,fingerprint:snapshotFingerprint(s)};
}
export function applyMemoryImport(s:RecallStateSnapshot,plan:MarkdownPlan,updates:Set<string>):{snapshot:RecallStateSnapshot;text:string;added:number;updated:number;skipped:number} {
  if(snapshotFingerprint(s)!==plan.fingerprint)throw new Error('数据已变化，请重新校验后导入');
  const next={...s,decks:[...s.decks],cards:[...s.cards]},lines=plan.document.text.split('\n');let added=0,updated=0,skipped=0;
  for(const row of plan.rows){const e=row.entry;let card=row.existing;if(row.status==='new'||row.status==='change'&&updates.has(e.id)){let id=plan.parentId;for(const name of e.path){let d=next.decks.find(d=>(d.parentId??null)===id&&d.name===name);if(!d){d={id:createId('deck'),name,parentId:id,description:'',color:'slate',createdAt:plan.document.batchAt,updatedAt:plan.document.batchAt,importedAt:plan.document.batchAt};next.decks.push(d);}id=d.id;}
      const fields={deckId:id!,front:e.front,back:e.back,contentKind:e.kind,bookTitle:e.bookTitle,chapter:e.chapter,updatedAt:plan.document.batchAt,lastImportedAt:plan.document.batchAt};if(card){card={...card,...fields};next.cards=next.cards.map(c=>c.id===card!.id?card!:c);updated++;}else{card=newMemoryCard({...fields,id:e.id,importedAt:e.importedAt},plan.document.batchAt);next.cards.push(card);added++;}
    }else skipped++;
    const meta={...e.meta,id:card?.id??e.id,importedAt:card?.importedAt??e.importedAt};lines[e.line]='<!-- recall:card '+JSON.stringify(meta).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')+' -->';
  }
  return {snapshot:next,text:lines.join('\n'),added,updated,skipped};
}
