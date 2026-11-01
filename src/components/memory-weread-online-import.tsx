import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, LoaderCircle, Pause, Search, SlidersHorizontal, X } from 'lucide-react';
import { useRecallStore } from '@/stores/recall-store';
import { commitMemory } from '@/services/memory-actions';
import { generateWereadQuestion, loadOnlineBook, loadOnlineBooks, loadOnlineProgress, type WereadOnlineBook } from '@/services/weread-online';
import { applyWereadImport, buildWereadDrafts, parseWereadExport, planWereadImport, type WereadDraft } from '@/lib/memory-weread';
import { createWereadJob, jobUpdates, needsQuestion, pendingQuestions, safeJobPlan, type WereadJob } from '@/lib/weread-job';
import { checkWereadBudget, discardWereadJob, loadWereadJob, saveWereadJob, withWereadJobLock } from '@/services/weread-job-storage';
import { AI_DAILY_MODEL_ATTEMPTS } from '../../shared/weread-ai';
import type { MemoryWereadImportProps } from './memory-weread-import';

function Cover({ book }: { book: { title: string; cover?: string | null } }): JSX.Element {
  const [failed, setFailed] = useState(false);
  return <div className="wr-cover" aria-hidden="true">{book.cover && !failed ? <img src={book.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <><span>{book.title.slice(0, 9)}</span><small>RECALL NOTES</small></>}</div>;
}
function Meter({ value }: { value: number }): JSX.Element { return <div className="wr-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}/></div>; }
function ReadingCard({ book, selected, disabled, imported, onSelect, onVisible }: { book: WereadOnlineBook; selected: boolean; disabled: boolean; imported: boolean; onSelect: () => void; onVisible: () => void }): JSX.Element {
  const card = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!card.current || book.readingProgress !== null || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { onVisible(); observer.disconnect(); } });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [book.readingProgress, onVisible]);
  return <button ref={card} type="button" className="wr-book" aria-pressed={selected} disabled={disabled || !book.highlightCount} onClick={onSelect} aria-label={`${book.title}，${book.highlightCount} 条我的划线`}>
    <Cover book={book}/><div className="wr-book-info"><div className="wr-book-title"><h3>{book.title}</h3><span className="wr-check">{selected && <Check size={13}/>}</span></div><p className="wr-author">{book.author || '作者未提供'}</p>
    <div className="wr-reading"><span>{book.markedFinished == null ? '状态未提供' : book.markedFinished ? '已标记读完' : '在读'}</span><small>{book.readingProgress == null ? '进度暂未提供' : `阅读进度 ${book.readingProgress}%`}</small></div>
    {book.readingProgress != null && <Meter value={book.readingProgress}/>}
    <p className="wr-counts"><strong>{book.highlightCount}</strong> 条我的划线 <small>· {book.totalNoteCount == null ? '笔记总数未提供' : `笔记共 ${book.totalNoteCount} 条`}</small></p>
    <p className="wr-book-foot">{!book.highlightCount ? '暂无可导入划线' : book.lastNoteAt ? `最近笔记 ${book.lastNoteAt}` : '笔记时间未提供'}{imported && <span> · 已导入 Recall</span>}</p></div>
  </button>;
}
export function MemoryWereadOnlineImport({ onClose, onComplete, onBusy, onLocal }: MemoryWereadImportProps & { onLocal: () => void }): JSX.Element {
  const [stage, setStage] = useState<'connect' | 'books' | 'confirm' | 'job'>('connect');
  const [books, setBooks] = useState<WereadOnlineBook[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyHighlights, setOnlyHighlights] = useState(false);
  const [onlyUnimported, setOnlyUnimported] = useState(false);
  const [drafts, setDrafts] = useState<WereadDraft[]>([]);
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<WereadJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [error, setError] = useState('');
  const [showHighlights, setShowHighlights] = useState(false);
  const [renewed, setRenewed] = useState<WereadJob | null>(null);
  const currentJob = useRef<WereadJob | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const progressQueue = useRef<string[]>([]);
  const progressStarted = useRef(new Set<string>());
  const progressActive = useRef(0);
  const progressControllers = useRef(new Set<AbortController>());
  const needsSave = useRef(false);
  const callbacks = useRef({ onBusy });
  useEffect(() => { callbacks.current = { onBusy }; }, [onBusy]);
  const failure = (value: unknown) => value instanceof Error ? value.message : '操作失败，请重试';
  const publish = (next: WereadJob) => { currentJob.current = next; if (mounted.current) setJob(next); };
  const report = (value: boolean) => { running.current = value; if (mounted.current) setBusy(value); callbacks.current.onBusy?.(value); };

  useEffect(() => {
    mounted.current = true;
    void loadWereadJob().then(saved => { if (mounted.current && saved) { currentJob.current = saved; setJob(saved); setStage('job'); } })
      .catch(value => { if (mounted.current) { setError(failure(value)); setDraftBlocked(true); } }).finally(() => { if (mounted.current) setInitializing(false); });
    return () => { mounted.current = false; abort.current?.abort(); progressControllers.current.forEach(controller => controller.abort()); callbacks.current.onBusy?.(false); };
  }, []);
  async function persist(next: WereadJob): Promise<void> { await saveWereadJob(next); publish(next); }
  async function connect(more = false): Promise<void> {
    if (running.current) return;
    report(true); setError('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const page = await loadOnlineBooks(more ? cursor : null, controller.signal);
      if (!mounted.current) return;
      setBooks(old => more ? [...old, ...page.books.filter(book => !old.some(existing => existing.bookId === book.bookId))] : page.books);
      setCursor(page.cursor); setStage('books');
    } catch (value) { if (mounted.current) setError(failure(value)); }
    finally { report(false); }
  }
  function loadProgress(id: string): void {
    if (progressStarted.current.has(id)) return;
    progressStarted.current.add(id); progressQueue.current.push(id); pumpProgress();
  }
  function pumpProgress(): void {
    while (mounted.current && progressActive.current < 2 && progressQueue.current.length) {
      const id = progressQueue.current.shift()!;
      const controller = new AbortController(); progressControllers.current.add(controller);
      progressActive.current++;
      void loadOnlineProgress(id, controller.signal).then(progress => {
        if (mounted.current) setBooks(old => old.map(book => book.bookId === id ? { ...book, readingProgress: progress } : book));
      }).catch(() => undefined).finally(() => { progressControllers.current.delete(controller); progressActive.current--; pumpProgress(); });
    }
  }
  async function prepare(): Promise<void> {
    if (running.current || !selected.size) return;
    report(true); setError('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const picked = [];
      for (const id of selected) picked.push(await loadOnlineBook(id, controller.signal));
      const parsed = parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: picked }));
      if (!mounted.current) return;
      const next = buildWereadDrafts(useRecallStore.getState(), parsed.books, selected);
      if (!next.length) throw new Error('这些书暂时没有我的划线，请重新选择');
      setDrafts(next); setRenewed(null); setUpdates(new Set()); setShowHighlights(false); setStage('confirm');
    } catch (value) { if (mounted.current) setError(failure(value)); }
    finally { report(false); }
  }
  async function execute(input: WereadJob, replacement = false): Promise<void> {
    if (running.current) return;
    report(true); setError('');
    const controller = new AbortController(); abort.current = controller;
    let next = input;
    try {
      await withWereadJobLock(async () => {
        const disk = await loadWereadJob();
        if (!disk && !replacement && !needsSave.current) throw new Error('这份任务已在其他页面取消，请重新选择');
        if (disk && disk.createdAt !== next.createdAt) throw new Error('另一个页面的任务已变化，请刷新后继续');
        if (replacement && disk && disk.generated.some(id => !next.generated.includes(id))) throw new Error('另一个页面已继续生成，请刷新后重新检查');
        if (disk && !replacement) {
          if (disk.status === 'done') { publish(disk); return; }
          if (!needsSave.current || disk.generated.some(id => !next.generated.includes(id))) next = disk;
        }
        try {
          await persist(next);
        needsSave.current = false;
        safeJobPlan(useRecallStore.getState(), next);
        const candidates = pendingQuestions(next);
        await checkWereadBudget(candidates.length, controller.signal);
        next = { ...next, status: 'generating', error: '' };
        await persist(next);
        for (const draft of candidates) {
          if (controller.signal.aborted) break;
          const result = await generateWereadQuestion(draft.highlight.markText, false, controller.signal);
          next = { ...next, generated: [...next.generated, draft.id], drafts: next.drafts.map(item => item.id === draft.id ? { ...item, kind: 'qa', question: result.question, aiSummary: undefined } : item) };
          await persist(next);
        }
        if (controller.signal.aborted || !mounted.current) { await persist({ ...next, status: 'paused' }); return; }
        next = { ...next, status: 'importing' }; await persist(next);
        let receipt: WereadJob['receipt'];
        await commitMemory(snapshot => {
          const plan = safeJobPlan(snapshot, next);
          const result = applyWereadImport(snapshot, plan, jobUpdates(plan, next));
          receipt = { added: result.added, updated: result.updated, skipped: result.skipped, deckIds: result.deckIds };
          return result.snapshot;
        });
        next = { ...next, status: 'done', receipt, error: '' };
        await persist(next);
        } catch (value) {
          const stopped = controller.signal.aborted;
          next = { ...next, status: stopped ? 'paused' : ['importing', 'done'].includes(next.status) ? 'import-failed' : 'generation-failed', error: stopped ? '' : failure(value) };
          publish(next);
          try { await saveWereadJob(next); needsSave.current = false; } catch { needsSave.current = true; if (mounted.current) setError('任务草稿保存失败，请保持此页面并重试；不会继续调用 AI'); }
        }
      });
    } catch (value) {
      if (mounted.current) setError(failure(value));
    } finally { report(false); }
  }
  async function confirm(): Promise<void> {
    if (running.current) return;
    try {
      let next = createWereadJob(useRecallStore.getState(), drafts, updates);
      if (renewed) next = { ...next, generated: renewed.generated.filter(id => next.drafts.some(draft => draft.id === id)), createdAt: renewed.createdAt };
      needsSave.current = true;
      publish(next); setStage('job');
      await execute(next, true);
    } catch (value) { setError(failure(value)); }
  }
  async function clearJob(): Promise<void> {
    if (running.current) return;
    try { await withWereadJobLock(discardWereadJob); currentJob.current = null; needsSave.current = false; setDraftBlocked(false); setRenewed(null); setJob(null); setSelected(new Set()); setError(''); setStage(books.length ? 'books' : 'connect'); }
    catch (value) { setError(failure(value)); }
  }
  const known = useRecallStore.getState().cards.filter(card => card.sourceRef?.provider === 'weread');
  const isImported = (id: string) => known.some(card => card.sourceRef?.bookId === id);
  const visible = books.filter(book => (!query.trim() || `${book.title} ${book.author || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    && (filter === 'all' || book.markedFinished === (filter === 'finished')) && (!onlyHighlights || book.highlightCount > 0) && (!onlyUnimported || !isImported(book.bookId)))
    .sort((first, second) => sort === 'highlights' ? second.highlightCount - first.highlightCount : sort === 'progress' ? (second.readingProgress ?? -1) - (first.readingProgress ?? -1) : (second.lastNoteAt || '').localeCompare(first.lastNoteAt || ''));
  const included = drafts.filter(draft => draft.include);
  let confirmationRows: ReturnType<typeof planWereadImport>['rows'] = [];
  let confirmationError = '';
  if (stage === 'confirm' && included.length) {
    try { confirmationRows = planWereadImport(useRecallStore.getState(), included).rows; } catch (value) { confirmationError = failure(value); }
  }
  const changes = confirmationRows.filter(row => row.status === 'change').map(row => row.draft);
  const questionCount = confirmationRows.filter(row => row.status !== 'duplicate' && needsQuestion(row.draft) && !renewed?.generated.includes(row.draft.id) && (!row.existingId || updates.has(row.draft.id))).length;
  const confirmedBooks = [...new Map(drafts.map(draft => [draft.book.bookId, books.find(book => book.bookId === draft.book.bookId) || draft.book])).values()];
  const totalJob = job ? job.generated.length + pendingQuestions(job).length : 0;
  const done = job?.status === 'done';
  const paused = job && !['generating', 'importing', 'done'].includes(job.status);
  const activeBook = job ? pendingQuestions(job)[0]?.book.bookId : undefined;
  function reconfirm(): void {
    if (!job || running.current) return;
    try {
      const rows = planWereadImport(useRecallStore.getState(), job.drafts).rows;
      setDrafts(rows.map(row => ({ ...row.draft, existingId: row.existingId, originalUnchanged: row.status === 'duplicate' })));
      setRenewed(job); setUpdates(new Set()); setSelected(new Set(job.drafts.map(draft => draft.book.bookId))); setStage('confirm'); setError('');
    } catch (value) { setError(failure(value)); }
  }
  return <section className="wr-workspace" aria-label="微信读书导入" aria-busy={busy}>
    {error && <p role="alert" className="m-error">{error}</p>}
    {confirmationError && <p role="alert" className="m-error">{confirmationError}</p>}
    {draftBlocked && <button className="m-secondary wr-more" onClick={() => { if (window.confirm('取消无法恢复的本机任务草稿？已导入卡片不会删除。')) void clearJob(); }}>取消旧任务草稿，重新选择</button>}
    {initializing ? <p role="status">正在检查本机任务草稿…</p> : stage === 'connect' ? <div className="wr-landing">
      <span className="wr-eyebrow">YOUR READING, RECALLED</span><h1>读过的，<br/>也能记得住。</h1><p>把微信读书里的划线，<br/>变成下一次温习的问题。</p>
      <div className="wr-art" aria-hidden="true"><div><span>阅读的回声</span></div><div><span>思考的尺度</span></div><div><Check size={30}/></div></div>
      <button className="m-primary" disabled={busy || draftBlocked} onClick={() => void connect()}>{busy ? <LoaderCircle className="wr-spin" size={18}/> : null}{busy ? '正在连接' : '连接微信读书'}<ArrowRight size={17}/></button><small>只导入我的划线，不包含其他人的热门划线。</small><button className="m-text" disabled={busy} onClick={onLocal}>其他导入方式</button>
    </div> : stage === 'books' ? <>
      <header className="wr-heading"><span className="wr-eyebrow">YOUR NOTEBOOKS</span><h1>选择想记住的书</h1><p>我的笔记本 · 已载入 {books.length} 本{cursor !== null ? '，还有更多' : ''}</p></header>
      <div className="wr-search"><label><Search size={18}/><input type="search" aria-label="搜索书名或作者" placeholder="搜索书名或作者" value={query} onChange={event => setQuery(event.target.value)}/></label><button className="m-secondary" aria-label="更多筛选" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={18}/></button></div>
      {filtersOpen && <div className="wr-filter-options"><label><input type="checkbox" checked={onlyHighlights} onChange={event => setOnlyHighlights(event.target.checked)}/>只看有划线的书</label><label><input type="checkbox" checked={onlyUnimported} onChange={event => setOnlyUnimported(event.target.checked)}/>只看未导入的书</label></div>}
      <div className="wr-filters">{[['all', '全部'], ['reading', '在读'], ['finished', '已读完']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="wr-list-meta"><span>{visible.length} 本书 · 每批最多选 5 本</span><select aria-label="书籍排序" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">最近笔记 ↓</option><option value="highlights">划线最多 ↓</option><option value="progress">阅读进度 ↓</option></select></div>
      <div className="wr-books">{visible.map(book => <ReadingCard key={book.bookId} book={book} selected={selected.has(book.bookId)} disabled={busy} imported={isImported(book.bookId)} onVisible={() => loadProgress(book.bookId)} onSelect={() => { if (!selected.has(book.bookId) && selected.size >= 5) { setError('每批最多选 5 本，请分批导入'); return; } setSelected(old => { const next = new Set(old); if (next.has(book.bookId)) next.delete(book.bookId); else next.add(book.bookId); return next; }); }}/>)}</div>
      {!visible.length && <div className="wr-empty"><BookOpen size={28}/><h2>暂时没有匹配的书</h2><p>{cursor !== null ? '试试加载更多，或调整筛选。' : '没有我的划线时，可以用手动文件导入。'}</p><button className="m-secondary" onClick={() => { setQuery(''); setFilter('all'); setOnlyHighlights(false); setOnlyUnimported(false); }}>清除搜索与筛选</button></div>}
      {cursor !== null && <button className="m-secondary wr-more" disabled={busy} onClick={() => void connect(true)}>加载更多书籍</button>}
      <div className="wr-dock"><div><strong>已选 {selected.size} 本</strong><span>{books.filter(book => selected.has(book.bookId)).reduce((total, book) => total + book.highlightCount, 0)} 条我的划线</span></div><button className="m-primary" disabled={busy || !selected.size} onClick={() => void prepare()}>{busy ? '正在读取划线' : '下一步 · AI 问题与导入'}<ArrowRight size={17}/></button></div>
    </> : stage === 'confirm' ? <>
      <header className="wr-heading"><span className="wr-eyebrow">READY TO RECALL</span><h1>让划线变成问题</h1><p>已选 {selected.size} 本书 · {included.length} 条我的划线</p></header>
      <div className="wr-confirm-books">{confirmedBooks.map(book => <div key={book.bookId}><Cover book={book}/><span><strong>{book.title}</strong><small>{drafts.filter(draft => draft.book.bookId === book.bookId && draft.include).length} 条已选划线</small></span></div>)}</div>
      <div className="wr-confirm-count"><span>本次生成</span><strong>{questionCount}<small> 个问题</small></strong></div>
      {!!changes.length && <div className="wr-changes"><h2>{changes.length} 张已有卡片的原文发生变化</h2><p>默认保留已有内容；勾选后才更新，复习进度保留。</p>{changes.map(draft => <label key={draft.id}><input type="checkbox" checked={updates.has(draft.id)} onChange={event => setUpdates(old => { const next = new Set(old); if (event.target.checked) next.add(draft.id); else next.delete(draft.id); return next; })}/><span>{draft.book.title} · {draft.highlight.markText.slice(0, 60)}</span></label>)}</div>}
      <p className="wr-consent">确认后，仅所选原文发送至火山 AI，依次生成全部问题。每日最多 {AI_DAILY_MODEL_ATTEMPTS} 次模型尝试，每小时最多 120 次请求；限流或失败保留进度。全部成功后自动导入，原文不改写；已有相同划线保留。AI 可能出错，导入后可查看和编辑。</p>
      <button className="m-secondary wr-more" aria-expanded={showHighlights} onClick={() => setShowHighlights(!showHighlights)}>选择划线 · 默认全选</button>
      {showHighlights && <div className="wr-highlight-options">{drafts.map(draft => <label key={draft.id}><input type="checkbox" checked={draft.include} onChange={event => setDrafts(old => old.map(item => item.id === draft.id ? { ...item, include: event.target.checked } : item))}/><span><small>{draft.book.title} · {draft.highlight.chapterTitle}</small>{draft.highlight.markText}</span></label>)}</div>}
      <div className="wr-dock"><button className="m-primary" disabled={busy || !included.length || !!confirmationError} onClick={() => void confirm()}>生成并自动导入<ArrowRight size={17}/></button><button className="m-text" disabled={busy} onClick={() => { setStage('books'); setError(''); }}>再选一选</button></div>
    </> : job ? <>
      {done ? <><div className="wr-done-symbol"><Check size={30}/></div><header className="wr-heading wr-done-heading"><h1>让读过的，留得住。</h1><p>导入完成 · 原文已保留</p></header><div className="wr-receipt">{[[job.receipt?.added || 0, '新增卡片'], [job.receipt?.updated || 0, '更新卡片'], [job.receipt?.skipped || 0, '跳过已有']].map(([value, title]) => <div key={title}><strong>{value}</strong><span>{title}</span></div>)}</div></>
        : <><header className="wr-heading"><span className="wr-eyebrow">READING INTO MEMORY</span><h1>{job.status === 'import-failed' ? '问题已好，导入未完成' : paused ? '进度已为你保留' : job.status === 'importing' ? '正在放进你的卡组' : '正在把划线变成问题'}</h1><p>{paused ? '已完成的问题保留，继续时不重做。' : '一条划线，一个问题。原文始终保留。'}</p></header><div className="wr-job-summary"><div><span>问题生成进度</span><strong>{job.generated.length}<small> / {totalJob}</small></strong></div><Meter value={totalJob ? job.generated.length / totalJob * 100 : 100}/><p>01 生成问题 <span>02 自动导入</span></p></div></>}
      <div className="wr-job-books">{[...new Set(job.drafts.map(draft => draft.book.bookId))].map(id => { const bookDrafts = job.drafts.filter(draft => draft.book.bookId === id); const count = bookDrafts.filter(draft => job.generated.includes(draft.id)).length; const target = count + pendingQuestions(job).filter(draft => draft.book.bookId === id).length; return <article key={id} className={job.status === 'generation-failed' && activeBook === id ? 'wr-failed' : ''}><Cover book={bookDrafts[0].book}/><div><h3>{bookDrafts[0].book.title}</h3><p>{done ? `${bookDrafts.filter(draft => draft.include).length} 条已处理划线` : `${count} / ${target} · ${count === target ? '问题已就绪' : paused ? '等待继续' : activeBook === id ? '问题生成中' : '等待生成'}`}</p>{!done && <Meter value={target ? count / target * 100 : 100}/>}</div></article>; })}</div>
      {job.error && <p className="m-error" role="alert">{job.error}；{job.status === 'import-failed' ? `${job.receipt ? '卡片已写入，完成记录待保存。' : ''}重试仅检查并执行导入，不重新生成。` : '尚未导入卡片，重试继续未完成部分。'}</p>}
      {!busy && job.error.includes('变化') && <button className="m-secondary wr-more" onClick={reconfirm}>重新检查导入变化</button>}
      <div className="wr-dock">{done ? <><button className="m-primary" onClick={() => onComplete(job.receipt?.deckIds || [])}>查看卡组<ChevronRight size={18}/></button><button className="m-text" onClick={() => void clearJob()}>继续选择其他书</button></> : busy ? <button className="m-secondary" disabled={job.status === 'importing'} onClick={() => abort.current?.abort()}><Pause size={17}/>{job.status === 'importing' ? '正在自动导入' : '暂停，保留进度'}</button> : <><button className="m-primary" onClick={() => void execute(job)}>{job.status === 'import-failed' ? '重试导入' : '重试并继续'}</button><button className="m-text" onClick={() => { if (window.confirm('取消任务并删除这份本机问题草稿？已导入卡片不会删除。')) void clearJob(); }}>取消任务，重新选择</button></>}</div>
    </> : null}
    {stage !== 'job' && <button className="m-text wr-back" disabled={busy} onClick={onClose}><X size={15}/>返回导入</button>}
  </section>;
}
