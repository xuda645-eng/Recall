import {describe,it,expect,vi} from 'vitest';
import {createSeedSnapshot} from '@/data/seed';
import {createFolder,newMemoryCard,folderPath} from './memory-folders';
import {parseMemoryMarkdown,planMemoryImport,applyMemoryImport} from './memory-markdown';
import {buildExportPayload,mergeImportPayload,parseImportPayload} from '@/services/import-export';
import {getRecallRepository,validateImportSnapshot} from '@/services/repository';
vi.mock('@/db/client',()=>({getTauriSqlExecutor:async()=>null,isTauriRuntime:()=>false}));
describe('多级内容安全与兼容备份',()=>{
 it('备份合并保留同名不同路径及独立书摘',()=>{let s:import('@/types').RecallStateSnapshot={...createSeedSnapshot(),decks:[],cards:[],reviewLogs:[],studySessions:[]};s=createFolder(s,'甲',null);const a=s.decks.at(-1)!;s=createFolder(s,'摘录',a.id);const aa=s.decks.at(-1)!;s=createFolder(s,'乙',null);const b=s.decks.at(-1)!;s=createFolder(s,'摘录',b.id);const bb=s.decks.at(-1)!;s.cards=[newMemoryCard({deckId:aa.id,front:'书名',back:'第一段',contentKind:'excerpt'},new Date().toISOString()),newMemoryCard({deckId:aa.id,front:'书名',back:'第二段',contentKind:'excerpt'},new Date().toISOString()),newMemoryCard({deckId:bb.id,front:'书名',back:'第三段',contentKind:'excerpt'},new Date().toISOString())];const payload=buildExportPayload(s);payload.decks.reverse();const empty={...createSeedSnapshot(),decks:[],cards:[],studySessions:[],reviewLogs:[]};const merged=mergeImportPayload(empty,parseImportPayload(JSON.stringify(payload)));expect(merged.cards).toHaveLength(3);expect(merged.decks).toHaveLength(4);expect(folderPath(merged.decks,merged.cards[2].deckId).map(d=>d.name)).toEqual(['乙','摘录']);expect(mergeImportPayload(merged,payload).cards).toHaveLength(3);expect(()=>validateImportSnapshot(merged)).not.toThrow();});
 it('损坏本地库报错且保留原始数据，不回写示例',async()=>{const repo=await getRecallRepository();localStorage.setItem('recall.snapshot.v1','{broken');await expect(repo.loadAppData()).rejects.toThrow();expect(localStorage.getItem('recall.snapshot.v1')).toBe('{broken');localStorage.clear();});
 it('长正文通过存盘校验，首次未知时间不补造',()=>{const s=createSeedSnapshot();const text='# 长阅读\n<!-- recall:card {"id":"L-01","type":"excerpt"} -->\n'+'长内容'.repeat(4000)+'\n<!-- recall:end -->';const d=parseMemoryMarkdown(text);const a=applyMemoryImport(s,planMemoryImport(s,d,null),new Set());expect(()=>validateImportSnapshot(a.snapshot)).not.toThrow();});
});
