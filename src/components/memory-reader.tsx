import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Archive, ArrowLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { RichCard } from '@/components/RichCard';
import { useRecallStore } from '@/stores/recall-store';
import { commitMemory } from '@/services/memory-actions';
import { previewMemoryReview, reviewFingerprint } from '@/services/memory-review';
import { normalizeMemoryStudyPreferences, selectMemoryStudyCards } from '@/services/memory-study';
import { replanMemoryStudyQueue } from '@/services/memory-study-session';
import { createId } from '@/lib/utils';
import type { Card, ReviewRating } from '@/types';

const labels: Record<ReviewRating, string> = { again: '忘记了', hard: '有点难', good: '记住了', easy: '很熟悉' };
interface Props { ids: string[]; scopeIds?: string[]; onQueueChange?: (ids: string[]) => void; onContinue?: (completedIds: string[]) => void; initialIndex: number; reviewMode: boolean; onEdit: (id: string) => void; onOptions: (id: string) => void; onArchive: (id: string) => Promise<void>; restoreRequest: { id: string; token: string } | null; archiveNotice: ReactNode; fontSize: number; onIndex: (n: number) => void; onExit: () => void; onBusy: (busy: boolean) => void; }
interface ReadingPosition { revealed: boolean; scroll: number; }
interface Undo { card: Card; logId: string; index: number; rating: ReviewRating; }
export function MemoryReader({ ids: initialIds, scopeIds = initialIds, onQueueChange, onContinue, initialIndex, reviewMode, onOptions, onArchive, restoreRequest, archiveNotice, fontSize: font, onIndex, onExit, onBusy }: Props): JSX.Element {
  const cards = useRecallStore(s => s.cards), decks = useRecallStore(s => s.decks);
  const settings = useRecallStore(s => s.settings);
  const preferences = useMemo(() => normalizeMemoryStudyPreferences(settings.studyPreferences), [settings.studyPreferences]);
  const preferenceKey = JSON.stringify(preferences);
  const previousPreferences = useRef(preferenceKey);
  const [replanned, setReplanned] = useState(false);
  const ids = useMemo(() => initialIds.filter(id => cards.some(card => card.id === id && !card.archivedAt)), [initialIds, cards]);
  const [index, setIndex] = useState(initialIndex), [revision, setRevision] = useState(0), [rated, setRated] = useState<Record<string, ReviewRating>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [undo, setUndo] = useState<Undo[]>([]);
  const viewport = useRef<HTMLDivElement>(null), rail = useRef<HTMLDivElement>(null), indexRef = useRef(initialIndex), views = useRef<Record<string, ReadingPosition>>({});
  const ratedRef = useRef<Record<string, ReviewRating>>({}), pending = useRef(false), switching = useRef(false), scheduled = useRef(0), token = useRef(0), timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const gesture = useRef<{ x: number; y: number; at: number; max: number; scroll: number; axis: 'x'|'y'|null }|null>(null);
  const session = useRef({ id: createId('session'), startedAt: new Date().toISOString() }), alive = useRef(true);
  const previousIds = useRef(initialIds), restoredToken = useRef<string | null>(null);
  const current = cards.find(c => c.id === ids[index]);
  const previewState = useMemo(() => {
    void revision;
    try { return { preview: current ? previewMemoryReview(current, settings, new Date()) : null, error: '' }; }
    catch { return { preview: null, error: '此卡片的复习数据无法计算排期，暂不能评分。原文和进度未改动，仍可浏览、编辑或归档。' }; }
  }, [current, settings, revision]);
  const preview = previewState.preview;
  const view = (id: string): ReadingPosition => views.current[id] ??= { revealed: false, scroll: 0 };
  const currentPanel = () => rail.current?.querySelector<HTMLElement>('[data-active="true"]');
  function remember(): void { const id = ids[indexRef.current], el = currentPanel(); if (id && el) view(id).scroll = el.scrollTop; }
  function resetRail(): void { if (rail.current) { rail.current.style.transition = 'none'; rail.current.style.transform = 'translate3d(-100%,0,0)'; } }
  useEffect(() => {
    if (previousPreferences.current === preferenceKey) return;
    previousPreferences.current = preferenceKey;
    if (!reviewMode || !onQueueChange || !current) return;
    const panel = rail.current?.querySelector<HTMLElement>('[data-active="true"]');
    const position = views.current[current.id] ??= { revealed: false, scroll: 0 };
    if (panel) position.scroll = panel.scrollTop;
    token.current++; if (timer.current) clearTimeout(timer.current);
    switching.current = false; scheduled.current = 0;
    const next = replanMemoryStudyQueue(ids, current.id, Object.keys(ratedRef.current), cards.filter(card => scopeIds.includes(card.id)), preferences, new Date(), settings);
    onQueueChange(next);
    setReplanned(true);
  }, [preferenceKey, reviewMode, onQueueChange, current, ids, cards, preferences, settings, scopeIds]);
  useLayoutEffect(() => {
    let nextIndex = indexRef.current;
    if (previousIds.current.join('\0') !== ids.join('\0')) {
      const previousId = previousIds.current[indexRef.current];
      nextIndex = ids.includes(previousId) ? ids.indexOf(previousId) : Math.min(indexRef.current, ids.length);
      previousIds.current = ids;
      cancelTransition(); switching.current = false; scheduled.current = 0;
    }
    if (restoreRequest && restoreRequest.token !== restoredToken.current && ids.includes(restoreRequest.id)) {
      restoredToken.current = restoreRequest.token;
      nextIndex = ids.indexOf(restoreRequest.id);
      cancelTransition(); switching.current = false; scheduled.current = 0;
    }
    if (nextIndex !== index) { indexRef.current = nextIndex; setIndex(nextIndex); }
    resetRail(); rail.current?.querySelectorAll<HTMLElement>('[data-card-id]').forEach(el => { el.scrollTop = view(el.dataset.cardId!).scroll; });
    onIndex(nextIndex);
  }, [index, revision, onIndex, ids, restoreRequest]);
  function cancelTransition():void{token.current++;if(timer.current)clearTimeout(timer.current);}
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelTransition(); }; }, []);
  function settle(): void { if (rail.current) { rail.current.style.transition = 'transform 200ms cubic-bezier(.2,.8,.2,1)'; rail.current.style.transform = 'translate3d(-100%,0,0)'; } }
  function move(step: number): void {
    if (pending.current) return;
    if (switching.current) { scheduled.current += step; return; }
    const target = Math.max(0, Math.min(ids.length-1, indexRef.current+step));
    if (target === indexRef.current) { settle(); return; }
    remember(); switching.current = true;
    const seq = ++token.current, motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rail.current) { rail.current.style.transition = motion ? 'transform 240ms cubic-bezier(.2,.8,.2,1)' : 'none'; rail.current.style.transform = `translate3d(${-(1+target-indexRef.current)*100}%,0,0)`; }
    const finish = () => { if (seq !== token.current || !alive.current) return; token.current++; if (timer.current) clearTimeout(timer.current); switching.current = false; indexRef.current = target; setIndex(target); const next = scheduled.current; scheduled.current = 0; if (next) requestAnimationFrame(() => { if (alive.current) move(Math.sign(next)); }); };
    rail.current?.addEventListener('transitionend', finish, { once: true });
    timer.current = setTimeout(finish, motion ? 280 : 0);
  }
  function reveal(): void { if (!current || switching.current || pending.current) return; remember(); view(current.id).revealed = true; view(current.id).scroll = 0; setRevision(n => n+1); }
  function pointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (e.button > 0 || switching.current || pending.current || (e.target as HTMLElement).closest('button,a,summary,input,textarea,select')) return;
    gesture.current = { x: e.clientX, y: e.clientY, at: performance.now(), max: 0, scroll: currentPanel()?.scrollTop ?? 0, axis: null };
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>): void {
    const p = gesture.current; if (!p) return;
    const dx = e.clientX-p.x, dy = e.clientY-p.y; p.max = Math.max(p.max, Math.abs(dx), Math.abs(dy));
    if (!p.axis) { if (p.max < 10) return; if (Math.abs(dy) >= Math.abs(dx)) { p.axis = 'y'; return; } p.axis = 'x'; e.currentTarget.setPointerCapture(e.pointerId); }
    if (p.axis !== 'x' || !rail.current) return;
    const edge = indexRef.current === 0 && dx > 0 || indexRef.current === ids.length-1 && dx < 0;
    rail.current.style.transition = 'none'; rail.current.style.transform = `translate3d(calc(-100% + ${edge ? dx*.25 : dx}px),0,0)`;
  }
  function pointerUp(e: PointerEvent<HTMLDivElement>): void {
    const p = gesture.current; gesture.current = null; if (!p) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!p.axis) { if (p.max < 8 && performance.now()-p.at < 450 && p.scroll === currentPanel()?.scrollTop && window.getSelection()?.isCollapsed !== false) reveal(); return; }
    if (p.axis !== 'x') return;
    const dx=e.clientX-p.x, velocity=dx/Math.max(1,performance.now()-p.at);
    if (Math.abs(dx) > (viewport.current?.clientWidth ?? 393)*.2 || Math.abs(dx)>25 && Math.abs(velocity)>.45) move(dx<0?1:-1); else settle();
  }
  async function rate(id: string, rating: ReviewRating): Promise<void> {
    if (!current || !preview || id !== ids[indexRef.current] || ratedRef.current[id] || pending.current || switching.current || !(view(id).revealed || current.contentKind === 'excerpt')) return;
    pending.current = true; setBusy(true); onBusy(true); setError(''); remember();
    let before: Card|undefined; const logId=createId('review');
    try {
      await commitMemory(s => {
        before = s.cards.find(c=>c.id===id); if (!before || before.archivedAt) throw new Error('卡片已不存在或已归档');
        if (!preview || preview.fingerprint !== reviewFingerprint(before, s.settings)) throw new Error('卡片或复习计划已变化，请重新确认评分');
        const now = new Date(), fresh = previewMemoryReview(before, s.settings, now);
        if (s.settings.reviewPlan?.mode === 'fixed' && fresh.choices[rating].label !== preview.choices[rating].label) throw new Error('复习间隔已变化，请重新确认评分');
        const updated = fresh.choices[rating].card;
        const sessionCount = Object.keys(ratedRef.current).length+1;
        return { ...s, cards:s.cards.map(c=>c.id===id?updated:c), reviewLogs:[...s.reviewLogs,{id:logId,cardId:id,rating,reviewDate:now.toISOString(),stability:updated.stability,difficulty:updated.difficulty,elapsedDays:updated.elapsedDays,scheduledDays:updated.scheduledDays}], studySessions:reviewMode?[...s.studySessions.filter(x=>x.id!==session.current.id),{...session.current,deckId:null,endedAt:now.toISOString(),cardsStudied:sessionCount}]:s.studySessions };
      });
      if (!alive.current) return;
      ratedRef.current={...ratedRef.current,[id]:rating}; setRated(ratedRef.current); setUndo(u=>[...u,{card:before!,logId,index:indexRef.current,rating}]);
      pending.current=false; if(indexRef.current<ids.length-1) move(1); else if (reviewMode && ids.every(cardId => ratedRef.current[cardId])) { indexRef.current = ids.length; setIndex(ids.length); }
    } catch(e) { if(alive.current){setError(e instanceof Error?e.message:'评分保存失败，请重试');setRevision(value=>value+1);} }
    finally { pending.current=false;if(alive.current){setBusy(false);onBusy(false);} }
  }
  async function undoRating(): Promise<void> {
    const last=undo.at(-1);if(!last||pending.current)return;cancelTransition();switching.current=false;scheduled.current=0;resetRail();pending.current=true;setBusy(true);onBusy(true);setError('');
    try { await commitMemory(s=>{
      const actual=s.cards.find(c=>c.id===last.card.id);if(!actual)throw new Error('卡片不存在，无法撤销');
      const {state,lastReviewDate,nextReviewDate,stability,difficulty,elapsedDays,scheduledDays,reps,lapses,learningSteps}=last.card;
      const count=Object.keys(ratedRef.current).length-1;
      return {...s,cards:s.cards.map(c=>c.id===last.card.id?{...actual,state,lastReviewDate,nextReviewDate,stability,difficulty,elapsedDays,scheduledDays,reps,lapses,learningSteps}:c),reviewLogs:s.reviewLogs.filter(l=>l.id!==last.logId),studySessions:s.studySessions.flatMap(x=>x.id!==session.current.id?[x]:count?[{...x,cardsStudied:count}]:[])};
    });if(!alive.current)return;delete ratedRef.current[last.card.id];setRated({...ratedRef.current});setUndo(u=>u.slice(0,-1));const restoredIndex=ids.indexOf(last.card.id);if(restoredIndex>=0){indexRef.current=restoredIndex;setIndex(restoredIndex);}setRevision(n=>n+1);
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'撤销失败');}finally{pending.current=false;if(alive.current){setBusy(false);onBusy(false);}}
  }
  async function archiveCurrent(): Promise<void> {
    if (!current || pending.current || switching.current) return;
    pending.current = true; setBusy(true); onBusy(true); setError(''); remember();
    try { await onArchive(current.id); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '归档失败，请重试'); }
    finally { pending.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  }
  useEffect(()=>{
    function keys(e:KeyboardEvent):void{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||(e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable=true],[role=dialog]'))return;
      if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.code==='Space'){e.preventDefault();reveal();}
      const r=({1:'again',2:'hard',3:'good',4:'easy'} as Record<string,ReviewRating>)[e.key];if(r&&current){e.preventDefault();void rate(current.id,r);}
    }window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
  });
  function panel(n:number):JSX.Element{
    const card=cards.find(c=>c.id===ids[n]&&!c.archivedAt),active=n===index,shown=card&&(view(card.id).revealed||card.contentKind==='excerpt');
    return <article key={card ? `${card.id}:${shown ? 'back' : 'front'}` : n} className="m-reading" data-active={active} data-card-id={card?.id} aria-hidden={!active} inert={!active} aria-label={shown?'卡片正文':'回忆问题'} style={{fontSize:font}}>{card?<>
      {card.bookTitle&&<div className="m-reader-source"><span>{card.bookTitle}{card.chapter?' · '+card.chapter:''}</span>{shown&&<small>划线原文</small>}</div>}
      {card.contentKind==='excerpt'?<div className="m-source"><strong>{card.front||card.bookTitle||decks.find(d=>d.id===card.deckId)?.name}</strong>{card.chapter&&<small>{card.chapter}</small>}</div>:shown&&card.cardType==='basic'?<details><summary>{card.front.split('\n')[0].slice(0, 96)}{card.front.length > 96 ? '…' : ''}</summary><RichCard content={card.front} allowHtml={false}/></details>:null}
      {shown?<>{card.cardType!=='basic'&&<RichCard content={card.front} cardType={card.cardType} revealed allowHtml={false}/>}<RichCard content={card.back} allowHtml={false}/>{card.aiSummary&&<details className="m-ai-summary"><summary>查看辅助总结 · 非原文</summary><p>{card.aiSummary}</p></details>}</>:<><p className="m-recall-caption">{card.recallKind==='task'?'试着用自己的话复述':'先回忆，再看答案'}</p><div className="m-question"><RichCard content={card.front} cardType={card.cardType} revealed={false} allowHtml={false}/></div>{card.hint&&<p className="m-hint">{card.hint}</p>}</>}
      {shown&&card.source&&<small className="m-source-origin">来源：{card.source}</small>}
    </>:<div className="m-card-end">{n<0?'第一张':'已到末张'}</div>}</article>;
  }
  const shown=current&&(view(current.id).revealed||current.contentKind==='excerpt'),already=current&&rated[current.id];
  const completedIds = Object.keys(rated);
  const nextBatch = reviewMode ? selectMemoryStudyCards(cards.filter(card => scopeIds.includes(card.id) && !completedIds.includes(card.id)), preferences, new Date(), settings) : null;
  return current?<section className="m-study" aria-label={reviewMode?'到期复习':'浏览卡片'}><div className="m-spread m-study-tools"><span>{decks.find(d=>d.id===current.deckId)?.name}</span><div><button className="m-archive-button" disabled={busy} aria-label="归档当前卡片" onClick={()=>void archiveCurrent()}><Archive size={17}/><small>归档</small></button><button disabled={index===0||busy} aria-label="上一张" onClick={()=>move(-1)}><ArrowLeft size={20}/></button><button disabled={index===ids.length-1||busy} aria-label="下一张" onClick={()=>move(1)}><ChevronRight size={20}/></button><button disabled={busy} aria-label="卡片与复习选项" onClick={()=>{remember();onOptions(current.id);}}><MoreHorizontal size={20}/></button></div></div>
    <div className="m-progress" role="progressbar" aria-label="浏览位置" aria-valuemin={1} aria-valuemax={ids.length} aria-valuenow={index+1}><div style={{width:(index+1)/ids.length*100+'%'}}/></div>
    <div className="m-card-window" ref={viewport} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{gesture.current=null;settle();}}><div className="m-card-rail" ref={rail}>{panel(index-1)}{panel(index)}{panel(index+1)}</div></div>
    {archiveNotice}
    <footer className="m-study-footer">{replanned && <p className="m-study-replanned" role="status">已调整未练部分，当前卡和已完成记录保留。</p>}{(error||previewState.error)&&<p role="alert" className="m-error">{error||previewState.error}</p>}{already?<div className="m-rated"><span>{labels[already]}</span><button disabled={busy} onClick={()=>void undoRating()}>撤销评分</button>{index===ids.length-1&&<button disabled={busy} onClick={() => { if (reviewMode) { indexRef.current = ids.length; setIndex(ids.length); } else onExit(); }}>{reviewMode ? '结束本轮' : '返回'}</button>}</div>:shown?<><p className="m-rating-context">{settings.reviewPlan?.mode==='fixed'?'下次复习 · 固定间隔':'智能调度 · 按真实回忆程度评分'}</p><div className="m-ratings">{(Object.keys(labels) as ReviewRating[]).map(r=><button disabled={busy||!preview} key={current.id+r} data-rating={r} aria-label={preview ? settings.reviewPlan?.mode === 'fixed' ? `${labels[r]}，${preview.choices[r].label}后复习` : labels[r] : `${labels[r]}，排期暂不可用`} onClick={e=>{if(e.detail<=1)void rate(current.id,r);}}>{labels[r]}{settings.reviewPlan?.mode === 'fixed' && <small>{preview?.choices[r].label??'暂不可用'}</small>}</button>)}</div></>:<button className="m-primary" disabled={busy} onClick={reveal}>显示答案</button>}
    {undo.length>0&&!already&&<button className="m-reader-undo" disabled={busy} onClick={()=>void undoRating()}>撤销上次评分</button>}</footer>
  </section>:<section className="m-completion"><h2>本轮完成</h2><p>{completedIds.length} 张已练习</p><p className="m-completion-note">本轮已结束，不代表所有待复习卡片已清空。<br/>时长目标 {preferences.sessionMinutes} 分钟，不要求每天打卡或补完积压。</p>{archiveNotice}{nextBatch && nextBatch.cards.length > 0 && onContinue && <button className="m-primary" disabled={busy} onClick={() => onContinue(completedIds)}>再练一轮 · {nextBatch.cards.length} 张</button>}<button className="m-secondary" disabled={busy} onClick={onExit}>结束并返回</button>{undo.length>0&&<button disabled={busy} onClick={()=>void undoRating()}>撤销上次评分</button>}</section>;
}
