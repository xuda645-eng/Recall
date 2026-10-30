import {useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {useRecallStore} from '@/stores/recall-store';
import {folderPath,subtreeIds} from '@/lib/memory-folders';
const dayKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function MemoryStats():JSX.Element{
 const cards=useRecallStore(s=>s.cards),decks=useRecallStore(s=>s.decks),logs=useRecallStore(s=>s.reviewLogs);
 const [scope,setScope]=useState(''),[range,setRange]=useState(7),[month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const ids=subtreeIds(decks,scope||null),scopeCards=cards.filter(c=>ids.has(c.deckId)),cs=scopeCards.filter(c=>!c.archivedAt),cardIds=new Set(scopeCards.map(c=>c.id)),ls=logs.filter(l=>cardIds.has(l.cardId));
 const counts=useMemo(()=>{const result=new Map<string,number>();for(const l of ls){const k=dayKey(new Date(l.reviewDate));result.set(k,(result.get(k)||0)+1);}return result;},[ls]);
 const activity=Array.from({length:range},(_,i)=>{const d=new Date();d.setDate(d.getDate()-range+1+i);return {key:dayKey(d),label:`${d.getMonth()+1}/${d.getDate()}`,count:counts.get(dayKey(d))||0};});
 const forecast=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);const k=dayKey(d);return {key:k,label:i===0?'今日':`${d.getMonth()+1}/${d.getDate()}`,count:cs.filter(c=>i===0?dayKey(new Date(c.nextReviewDate))<=k:dayKey(new Date(c.nextReviewDate))===k).length};});
 const max=Math.max(1,...activity.map(a=>a.count)),fmax=Math.max(1,...forecast.map(a=>a.count));
 const start=new Date(month);start.setDate(1-start.getDay());const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
 const mastered=cs.filter(c=>c.state==='review').length,selectedTotal=activity.reduce((s,a)=>s+a.count,0);
 return <div className="m-stats"><label>统计范围<select value={scope} onChange={e=>setScope(e.target.value)}><option value="">全部卡片</option>{decks.map(d=><option key={d.id} value={d.id}>{folderPath(decks,d.id).map(x=>x.name).join(' / ')}</option>)}</select></label><div className="m-stats-summary"><div><strong>{cs.length}</strong><span>卡片</span></div><div><strong>{mastered}</strong><span>已熟悉</span></div><div><strong>{selectedTotal}</strong><span>近 {range} 天复习</span></div></div>
 <section className="m-panel"><div className="m-spread"><h2>复习量</h2><select aria-label="统计天数" value={range} onChange={e=>setRange(Number(e.target.value))}><option value={7}>7 天</option><option value={30}>30 天</option></select></div><div className="m-bars" aria-label="每日复习量">{activity.map((d,i)=><div key={d.key} title={`${d.key} ${d.count} 次`}><span>{range===7||d.count?d.count:''}</span><i style={{height:`${d.count/max*100}px`}}/><small>{range===7||i%7===0||i===range-1?d.label:''}</small></div>)}</div></section>
 <section className="m-panel"><h2>熟悉度</h2><div className="m-mastery">{cs.length>0&&<i style={{width:`${mastered/cs.length*100}%`}}/>}</div><div className="m-spread"><span>已熟悉 {mastered}</span><span>待学习 {cs.length-mastered}</span></div></section>
 <section className="m-panel"><div className="m-spread"><h2>复习日历</h2><div><button aria-label="上个月" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}><ChevronLeft size={18}/></button><span>{month.getFullYear()}/{month.getMonth()+1}</span><button aria-label="下个月" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}><ChevronRight size={18}/></button></div></div><div className="m-calendar">{'日一二三四五六'.split('').map(d=><small key={d}>{d}</small>)}{days.map(d=>{const count=counts.get(dayKey(d))||0;return <div key={dayKey(d)} style={{opacity:d.getMonth()===month.getMonth()?1:.3}} data-today={dayKey(d)===dayKey(new Date())} title={`${dayKey(d)} ${count} 次`}><span>{d.getDate()}</span><small>{count||''}</small></div>;})}</div></section>
 <section className="m-panel"><h2>未来到期</h2><div className="m-bars">{forecast.map(d=><div key={d.key}><span>{d.count}</span><i style={{height:`${d.count/fmax*100}px`}}/><small>{d.label}</small></div>)}</div></section>
 </div>;
}
