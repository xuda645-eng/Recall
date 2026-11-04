import {useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {useRecallStore} from '@/stores/recall-store';
import {subtreeIds} from '@/lib/memory-folders';
import {MemoryFolderSelector} from '@/components/memory-folder-selector';
import {memoryDueForecast,memoryProgressCounts} from '@/services/memory-statistics';
const dayKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function MemoryStats():JSX.Element{
 const cards=useRecallStore(s=>s.cards),decks=useRecallStore(s=>s.decks),logs=useRecallStore(s=>s.reviewLogs);
 const [scope,setScope]=useState(''),[range,setRange]=useState(7),[month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const selectedScope=decks.some(deck=>deck.id===scope)?scope:'';
 const ids=subtreeIds(decks,selectedScope||null),scopeCards=cards.filter(c=>ids.has(c.deckId)),cs=scopeCards.filter(c=>!c.archivedAt),cardIds=new Set(scopeCards.map(c=>c.id)),ls=logs.filter(l=>cardIds.has(l.cardId));
 const counts=useMemo(()=>{const result=new Map<string,number>();for(const l of ls){const k=dayKey(new Date(l.reviewDate));result.set(k,(result.get(k)||0)+1);}return result;},[ls]);
 const activity=Array.from({length:range},(_,i)=>{const d=new Date();d.setDate(d.getDate()-range+1+i);return {key:dayKey(d),label:`${d.getMonth()+1}/${d.getDate()}`,count:counts.get(dayKey(d))||0};});
 const forecast=memoryDueForecast(cs).map((entry,index)=>({key:dayKey(entry.date),label:index===0?'当前待复习':`${entry.date.getMonth()+1}/${entry.date.getDate()}`,count:entry.count}));
 const max=Math.max(1,...activity.map(a=>a.count)),fmax=Math.max(1,...forecast.map(a=>a.count));
 const start=new Date(month);start.setDate(1-start.getDay());const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
 const progress=memoryProgressCounts(cs),selectedTotal=activity.reduce((s,a)=>s+a.count,0);
 return <div className="m-stats"><MemoryFolderSelector decks={decks} value={selectedScope} onChange={setScope} label="统计范围" rootLabel="全部卡片"/><div className="m-stats-summary"><div><strong>{cs.length}</strong><span>卡片</span></div><div><strong>{progress.review}</strong><span>长期复习</span></div><div><strong>{selectedTotal}</strong><span>近 {range} 天复习次数</span></div></div>
 <section className="m-panel"><div className="m-spread"><h2>复习量</h2><select aria-label="统计天数" value={range} onChange={e=>setRange(Number(e.target.value))}><option value={7}>7 天</option><option value={30}>30 天</option></select></div><div className="m-bars" aria-label="每日复习量">{activity.map((d,i)=><div key={d.key} title={`${d.key} ${d.count} 次`}><span>{range===7||d.count?d.count:''}</span><i style={{height:`${d.count/max*100}px`}}/><small>{range===7||i%7===0||i===range-1?d.label:''}</small></div>)}</div></section>
 <section className="m-panel"><h2>学习进度</h2><div className="m-mastery">{cs.length>0&&<i style={{width:`${progress.review/cs.length*100}%`}}/>}</div><div className="m-progress-counts"><span>待学习 {progress.fresh}</span><span>学习中 {progress.learning}</span><span>长期复习 {progress.review}</span></div><p className="m-note">待学习是从未评分的新卡；长期复习表示已进入间隔复习，不代表永久掌握。</p></section>
 <section className="m-panel"><div className="m-spread"><h2>复习日历</h2><div><button aria-label="上个月" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}><ChevronLeft size={18}/></button><span>{month.getFullYear()}/{month.getMonth()+1}</span><button aria-label="下个月" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}><ChevronRight size={18}/></button></div></div><div className="m-calendar">{'日一二三四五六'.split('').map(d=><small key={d}>{d}</small>)}{days.map(d=>{const count=counts.get(dayKey(d))||0;return <div key={dayKey(d)} style={{opacity:d.getMonth()===month.getMonth()?1:.3}} data-today={dayKey(d)===dayKey(new Date())} title={`${dayKey(d)} ${count} 次`}><span>{d.getDate()}</span><small>{count||''}</small></div>;})}</div></section>
 <section className="m-panel"><h2>未来到期</h2><p className="m-note">仅统计已学卡。第一列是现在已到期的卡片，新卡和今天尚未到点的卡片不计入；后续日期按当前排期预估。</p><div className="m-bars m-forecast-bars">{forecast.map(d=><div key={d.key}><span>{d.count}</span><i style={{height:`${d.count/fmax*100}px`}}/><small>{d.label}</small></div>)}</div></section>
 </div>;
}
