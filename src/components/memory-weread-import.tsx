import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecallStore } from '@/stores/recall-store';
import { commitMemory } from '@/services/memory-actions';
import { applyWereadImport, buildWereadDrafts, parseWereadExport, planWereadImport, WEREAD_MAX_BYTES, type WereadBook, type WereadDraft, type WereadImportPlan, type WereadImportResult, type WereadKind } from '@/lib/memory-weread';
import { generateWereadQuestion, loadOnlineBook, loadOnlineBooks } from '@/services/weread-online';
import './memory-weread-import.css';

export interface MemoryWereadImportProps {
  onClose: () => void;
  onComplete: (deckIds: string[]) => void;
  onBusy?: (busy: boolean) => void;
}
type Stage = 'load' | 'books' | 'drafts' | 'changes' | 'done';
const originalSample = {
  format: 'recall-weread-export-v1',
  books: [
    { bookId: 'recall-original-sample-v1-reading', title: '阅读与回忆（原创示例）', author: 'Recall 原创流程样例', highlights: [
      { bookmarkId: 'original-1', chapterUid: '1', chapterTitle: '检验理解', markText: '  合上材料，用自己的话说明结论与依据。\n再回到原文，检查遗漏。  ', question: '怎样检验自己是否理解了一段材料？' },
      { bookmarkId: 'original-2', chapterUid: '2', chapterTitle: '暂存摘录', markText: '暂时没有好问题，也可以先保留原文。', recallKind: 'excerpt' },
    ] },
    { bookId: 'recall-original-sample-v1-thinking', title: '思考练习（原创示例）', author: 'Recall 原创流程样例', highlights: [
      { bookmarkId: 'original-1', markText: '先区分观察到的事实与自己的判断，再说明判断依据和不确定性。', question: '回忆：做判断前，需要区分什么？', recallKind: 'task' },
    ] },
  ],
};

export function MemoryWereadImport({ onClose, onComplete, onBusy }: MemoryWereadImportProps): JSX.Element {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('load');
  const [books, setBooks] = useState<WereadBook[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<WereadDraft[]>([]);
  const [plan, setPlan] = useState<WereadImportPlan | null>(null);
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [receipt, setReceipt] = useState<WereadImportResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [demo, setDemo] = useState(false);
  const [filename, setFilename] = useState('');
  const [online, setOnline] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<number | null>(null);
  const [aiStatus, setAiStatus] = useState<Record<string, string>>({});
  const [aiSummary, setAiSummary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0), mounted = useRef(true), lock = useRef(false), completed = useRef(false);
  const busy = useRef(false), busyCallback = useRef(onBusy);

  useEffect(() => {
    busyCallback.current = onBusy;
    if (busy.current) onBusy?.(true);
  }, [onBusy]);

  useEffect(() => {
    mounted.current = true;
    const cancel = () => {
      controller.current?.abort();
      mounted.current = false; generation.current++; busy.current = false;
      busyCallback.current?.(false);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!lock.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const preventEscape = (event: KeyboardEvent) => {
      if (lock.current && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('keydown', preventEscape, true);
    return () => {
      cancel();
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('keydown', preventEscape, true);
    };
  }, []);

  const message = (value: unknown) => value instanceof Error ? value.message : t('memory.weread.operationFailed', '操作失败，请重试');
  function reportBusy(value: boolean): void {
    if (busy.current === value) return;
    busy.current = value;
    busyCallback.current?.(value);
  }
  function close(): void {
    if (lock.current || busy.current) return;
    generation.current++;
    onClose();
  }
  function acceptBooks(next: WereadBook[], sample: boolean, name: string): void {
    setBooks(next); setSelection(new Set()); setDrafts([]); setPlan(null); setUpdates(new Set()); setReceipt(null);
    setDemo(sample); setFilename(name); setError(''); setLoading(false); setStage('books'); completed.current = false;
    setOnline(false); setCounts({}); setCursor(null); setAiStatus({}); setProgress('');
  }
  async function connect(more = false): Promise<void> {
    if (busy.current || lock.current) return;
    const current = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(''); reportBusy(true);
    try {
      const page = await loadOnlineBooks(more ? cursor : null, abort.signal);
      if (!mounted.current || current !== generation.current) return;
      const next = page.books.map(book => ({ bookId: book.bookId, title: book.title, author: book.author, highlights: [] }));
      if (!more) acceptBooks(next, false, '你的微信读书笔记本（真实数据，仅展示有笔记的书）');
      else setBooks(old => [...old, ...next.filter(book => !old.some(existing => existing.bookId === book.bookId))]);
      setCounts(old => ({ ...(more ? old : {}), ...Object.fromEntries(page.books.map(book => [book.bookId, book.highlightCount])) }));
      setOnline(true); setCursor(page.cursor);
    } catch (value) {
      if (mounted.current && !abort.signal.aborted) setError(message(value));
    } finally {
      if (mounted.current && current === generation.current) { setLoading(false); reportBusy(false); }
    }
  }
  async function load(file?: File): Promise<void> {
    if (!file || lock.current) return;
    controller.current?.abort();
    const current = ++generation.current;
    setLoading(true); setError(''); setPlan(null); setBooks([]); setDrafts([]); setReceipt(null); setDemo(false); setStage('load');
    try {
      reportBusy(true);
      if (file.size > WEREAD_MAX_BYTES) throw new Error(t('memory.weread.fileTooLarge', '文件不能超过 5 MB'));
      const text = await file.text();
      if (!mounted.current || current !== generation.current) return;
      acceptBooks(parseWereadExport(text).books, false, file.name);
    } catch (value) {
      if (mounted.current && current === generation.current) setError(message(value));
    } finally {
      if (mounted.current && current === generation.current) { setLoading(false); reportBusy(false); }
    }
  }
  function sample(): void {
    if (lock.current) return;
    controller.current?.abort();
    generation.current++;
    acceptBooks(parseWereadExport(JSON.stringify(originalSample)).books, true, t('memory.weread.originalSample', '原创预置样例'));
    reportBusy(false);
  }
  async function editCards(): Promise<void> {
    if (lock.current || busy.current) return;
    const current = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      let selectedBooks = books;
      if (online) {
        if (selection.size > 5) throw new Error('在线每批最多选择 5 本书，请分批导入');
        setLoading(true); reportBusy(true);
        selectedBooks = [];
        for (const id of selection) selectedBooks.push(await loadOnlineBook(id, abort.signal));
        selectedBooks = parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: selectedBooks })).books;
      }
      if (!mounted.current || current !== generation.current) return;
      const next = buildWereadDrafts(useRecallStore.getState(), selectedBooks, selection).map(draft => {
        const previous = drafts.find(old => old.id === draft.id && old.highlight.markText === draft.highlight.markText);
        return previous && !draft.originalUnchanged ? previous : draft;
      });
      if (!next.length) throw new Error(t('memory.weread.chooseHighlight', '至少选择一本含有划线的书'));
      setDrafts(next); setPlan(null); setUpdates(new Set()); setError(''); setStage('drafts');
    } catch (value) { if (mounted.current && !abort.signal.aborted) setError(message(value)); }
    finally { if (mounted.current && current === generation.current) { setLoading(false); reportBusy(false); } }
  }
  function edit(id: string, fields: Partial<Pick<WereadDraft, 'include' | 'kind' | 'question'>>): void {
    if (lock.current || busy.current) return;
    setDrafts(current => current.map(draft => draft.id === id ? { ...draft, ...fields } : draft));
    if (fields.question !== undefined) setAiStatus(current => ({ ...current, [id]: '手动编辑，AI 不会覆盖' }));
    setPlan(null);
  }
  async function generate(): Promise<void> {
    if (busy.current || lock.current || demo) return;
    const candidates = drafts.filter(draft => draft.include && draft.kind !== 'excerpt' && !draft.originalUnchanged
      && !draft.highlight.question?.trim() && !aiStatus[draft.id]?.startsWith('AI 已生成') && !aiStatus[draft.id]?.startsWith('手动')).slice(0, 20);
    if (!candidates.length) { setProgress('没有需要生成的问题：已有问题和手动编辑均保留'); return; }
    const abort = new AbortController(); controller.current = abort;
    const current = ++generation.current;
    reportBusy(true); setGenerating(true); setError(''); setPlan(null);
    let succeeded = 0;
    try {
      for (const [index, draft] of candidates.entries()) {
        if (abort.signal.aborted) break;
        setProgress(`AI 生成 ${index + 1}/${candidates.length}，已成功 ${succeeded} 条`);
        try {
          const result = await generateWereadQuestion(draft.highlight.markText, aiSummary, abort.signal);
          if (!mounted.current || abort.signal.aborted || current !== generation.current) break;
          setDrafts(old => old.map(item => item.id === draft.id ? { ...item, kind: 'qa', question: result.question, aiSummary: result.summary ?? undefined } : item));
          setAiStatus(old => ({ ...old, [draft.id]: 'AI 已生成，请检查问题是否可由原文回答' }));
          succeeded++;
        } catch (value) {
          if (abort.signal.aborted) break;
          setAiStatus(old => ({ ...old, [draft.id]: `生成失败：${message(value)}` }));
          setError(message(value));
          break;
        }
      }
    } finally {
      if (mounted.current && current === generation.current) {
        setProgress(`${abort.signal.aborted ? '已停止' : '本轮结束'}：成功 ${succeeded}/${candidates.length}。可继续生成、重试或手动编辑；尚未导入卡库。`);
        setGenerating(false); reportBusy(false);
      }
    }
  }
  function preview(): void {
    if (lock.current || busy.current) return;
    try {
      setPlan(planWereadImport(useRecallStore.getState(), drafts)); setUpdates(new Set()); setError(''); setStage('changes');
    } catch (value) { setError(message(value)); }
  }
  async function confirm(): Promise<void> {
    if (!plan || lock.current || busy.current || completed.current) return;
    lock.current = true;
    setPending(true); setError('');
    let result: WereadImportResult | undefined;
    try {
      reportBusy(true);
      const chosen = new Set(updates);
      await commitMemory(current => { result = applyWereadImport(current, plan, chosen); return result.snapshot; });
      completed.current = true;
      if (mounted.current && result) { setReceipt(result); setStage('done'); }
    } catch (value) {
      if (mounted.current) setError(message(value));
    } finally {
      lock.current = false;
      if (mounted.current) { setPending(false); reportBusy(false); }
    }
    if (mounted.current && completed.current && result) onComplete(result.deckIds);
  }
  const notice = demo ? t('memory.weread.demoNotice', '原创预置书架和问题，仅用于流程演示，不是你的微信读书数据，也不是 AI 输出。')
    : '可在线连接真实微信读书笔记本，或载入本地文件。AI 逐条生成问题，划线原文始终作为答案。密钥仅在服务端，必须先授权当前设备。';
  const statusLabel = (status: 'new' | 'change' | 'duplicate') => status === 'new' ? t('memory.weread.newCard', '新增卡片') : status === 'change' ? t('memory.weread.changedCard', '有变化，默认保留已有内容') : t('memory.weread.duplicateCard', '重复，保留已有卡片');
  const kindLabel = (kind: WereadKind) => kind === 'qa' ? t('memory.weread.questionKind', '问题 + 原文') : kind === 'task' ? t('memory.weread.taskKind', '回忆任务 + 原文') : t('memory.weread.excerptKind', '保留摘录，不强行出题');

  return <section aria-label={t('memory.weread.importTitle', '微信读书 Skill 导出导入')} aria-busy={loading || pending}>
    <header className="m-weread-heading">
      <h2>{t('memory.weread.importTitle', '微信读书 Skill 导出导入')}</h2>
      <p>连接或载入 → 选书与划线 → AI 问题 / 手动编辑 → 检查变化 → 确认导入</p>
    </header>
    <p className="m-source-notice">{notice}</p>
    <p>{t('memory.weread.mapping', '一本书对应一个根卡组，每条划线对应一张卡。章节仅作来源信息，不建立章节子卡组。原文不改写，摘要单独保留。')}</p>
    {error && <p role="alert" className="m-error">{error}</p>}
    <fieldset disabled={pending} style={{ minWidth: 0, border: 0, padding: 0, margin: 0 }}>
      {(stage === 'load' || stage === 'books') && <>
        <div className="m-panel">
          <button type="button" className="m-primary" disabled={loading} onClick={() => void connect()}>连接微信读书</button>
          <small>读取你的有笔记书籍列表；首版不导入想法、书签或有声书。点击 AI 生成时，仅所选划线会发送到火山模型。</small>
          <label>{t('memory.weread.loadFile', '载入本地 Skill 导出文件')}
            <input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void load(file); }}/>
          </label>
          <small>{t('memory.weread.limits', '仅支持 recall-weread-export-v1 JSON，最多 5 MB、200 本书、1000 条划线。文件不得含凭证字段。')}</small>
          <button type="button" onClick={sample}>{t('memory.weread.trySample', '体验原创示例书架（非个人数据 / 非 AI 输出）')}</button>
          {loading && <p role="status">{t('memory.weread.readingFile', '正在读取本地文件…')}</p>}
        </div>
        {stage === 'books' && <>
          <p>{filename}</p>
          <div className="m-weread-books">
            {books.map(book => <label className="m-book-choice m-panel" key={book.bookId}>
              <input type="checkbox" checked={selection.has(book.bookId)} disabled={loading || !(online ? counts[book.bookId] : book.highlights.length)} onChange={event => {
                const checked = event.target.checked;
                setSelection(current => { const next = new Set(current); if (checked) next.add(book.bookId); else next.delete(book.bookId); return next; });
              }}/>
              <span><strong>{book.title}</strong><br/><small>{book.author} · {t('memory.weread.highlightCount', { defaultValue: '{{count}} 条划线', count: online ? counts[book.bookId] : book.highlights.length })}</small></span>
            </label>)}
          </div>
          {online && cursor !== null && <button type="button" disabled={loading} onClick={() => void connect(true)}>加载更多书籍</button>}
          <button type="button" className="m-primary" disabled={!selection.size || loading} onClick={() => void editCards()}>{t('memory.weread.editCards', '预览并编辑回忆卡')}</button>
        </>}
      </>}
      {stage === 'drafts' && <>
        <p className="m-source-notice">每条划线生成一个问题；已有问题和手动编辑保留。AI 可能出错，请核对；默认回忆任务不是 AI 输出。停止或失败时保留已生成草稿，不自动导入。</p>
        {!demo && <div className="m-panel">
          <label><input type="checkbox" disabled={generating} checked={aiSummary} onChange={event => setAiSummary(event.target.checked)}/>同时生成辅助摘要（不是原文答案）</label>
          <button type="button" disabled={generating} onClick={() => void generate()}>AI 生成问题（最多 20 条）</button>
          {generating && <button type="button" onClick={() => controller.current?.abort()}>停止生成</button>}
          <small>单条最多 6000 字；每轮最多 20 条，可继续下一轮；每日全空间最多 100 次模型调用，失败也计入。仅点击后发送原文。</small>
          {progress && <p role="status">{progress}</p>}
        </div>}
        {drafts.map((draft, index) => <article className="m-weread-card m-panel" key={draft.id}>
          <label><input type="checkbox" disabled={generating} checked={draft.include} onChange={event => edit(draft.id, { include: event.target.checked })}/>{t('memory.weread.includeHighlight', '导入这条划线')}</label>
          {aiStatus[draft.id] && <small>{aiStatus[draft.id]}</small>}
          <small>{draft.existingId ? t('memory.weread.existingCard', '已存在，保留进度与归档状态') : t('memory.weread.newCard', '新增卡片')}</small>
          <strong>{draft.book.title}{draft.highlight.chapterTitle ? ` · ${draft.highlight.chapterTitle}` : ''}</strong>
          <label>{t('memory.weread.cardKind', '卡片形式')}
            <select disabled={generating} aria-label={t('memory.weread.kindAria', { defaultValue: '第 {{index}} 条划线的卡片形式', index: index + 1 })} value={draft.kind} onChange={event => {
              const kind = event.target.value as WereadKind;
              edit(draft.id, { kind, ...(kind === 'excerpt' ? { question: '' } : {}) });
            }}>{(['qa', 'task', 'excerpt'] as const).map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</select>
          </label>
          {draft.kind !== 'excerpt' && <label>{draft.kind === 'task' ? t('memory.weread.frontTask', '正面 · 回忆任务') : t('memory.weread.frontQuestion', '正面 · 问题')}
            <textarea disabled={generating} rows={3} maxLength={10000} value={draft.question} aria-label={t('memory.weread.promptAria', { defaultValue: '第 {{index}} 条划线的回忆提示', index: index + 1 })} onChange={event => edit(draft.id, { question: event.target.value })}/>
          </label>}
          <div className="m-original-highlight"><small>{t('memory.weread.originalBack', '背面 · 划线原文，保持不变')}</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.highlight.markText}</p></div>
          {draft.aiSummary && <aside><small>AI / 导入辅助摘要（非划线原文，不代替答案）</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.aiSummary}</p></aside>}
        </article>)}
        <div className="m-actions m-import-footer">
          <button type="button" disabled={generating} onClick={() => { if (!lock.current) setStage('books'); }}>{t('memory.weread.backToBooks', '返回选书')}</button>
          <button type="button" className="m-primary" onClick={preview} disabled={generating || !drafts.some(draft => draft.include)}>{t('memory.weread.previewChanges', '检查导入变化')}</button>
        </div>
      </>}
      {stage === 'changes' && plan && <>
        <p>{t('memory.weread.previewCounts', { defaultValue: '新增 {{added}}，变化 {{changed}}，重复 {{duplicates}}', added: plan.rows.filter(row => row.status === 'new').length, changed: plan.rows.filter(row => row.status === 'change').length, duplicates: plan.rows.filter(row => row.status === 'duplicate').length })}</p>
        <p className="m-source-notice">{t('memory.weread.updateNotice', '变化项须逐条勾选才会更新。仅修改内容与来源，不改变卡片编号、所在卡组、日期、复习进度或归档状态；未选择的更新和重复项均跳过。')}</p>
        {plan.rows.map(row => <article className="m-weread-card m-panel" key={row.draft.id}>
          <strong>{row.draft.book.title}</strong><p>{statusLabel(row.status)}</p>
          <small>{kindLabel(row.draft.kind)} · {row.content.source}</small>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.content.front || t('memory.weread.excerptTitle', '摘录卡')}</p>
          <div className="m-original-highlight"><small>{t('memory.weread.originalBack', '背面 · 划线原文，保持不变')}</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.content.back}</p></div>
          {row.content.aiSummary && <aside><small>AI / 导入辅助摘要（非划线原文，不代替答案）</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.content.aiSummary}</p></aside>}
          {row.status === 'change' && <>
            <details><summary>{t('memory.weread.existingContent', '查看已有内容')}</summary>
              <small>{kindLabel(row.existing?.contentKind === 'excerpt' ? 'excerpt' : row.existing?.recallKind === 'task' ? 'task' : 'qa')} · {row.existing?.source}</small>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.existing?.front}</p>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.existing?.back}</p>
              {row.existing?.aiSummary && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.existing.aiSummary}</p>}
            </details>
            <label><input type="checkbox" checked={updates.has(row.draft.id)} onChange={event => {
              const checked = event.target.checked;
              setUpdates(current => { const next = new Set(current); if (checked) next.add(row.draft.id); else next.delete(row.draft.id); return next; });
            }}/>{t('memory.weread.explicitUpdate', '明确更新这张卡片的内容与来源')}</label>
          </>}
        </article>)}
        <div className="m-actions m-import-footer">
          <button type="button" onClick={() => { if (!lock.current) { setPlan(null); setStage('drafts'); } }}>{t('memory.weread.backToEdit', '返回编辑 / 重新检查')}</button>
          <button type="button" className="m-primary" disabled={pending} onClick={() => void confirm()}>{pending ? t('memory.weread.committing', '正在保存，请勿离开…') : t('memory.weread.confirmImport', '确认导入')}</button>
        </div>
      </>}
      {stage === 'done' && receipt && <div className="m-panel">
        <h3>{t('memory.weread.importDone', '导入完成')}</h3>
        <p role="status">{t('memory.weread.resultCounts', { defaultValue: '新增 {{added}}，更新 {{updated}}，跳过 {{skipped}}', added: receipt.added, updated: receipt.updated, skipped: receipt.skipped })}</p>
      </div>}
      <div className="m-actions"><button type="button" disabled={pending || loading || generating} onClick={close}>{t('memory.weread.close', '返回导入')}</button></div>
    </fieldset>
  </section>;
}
