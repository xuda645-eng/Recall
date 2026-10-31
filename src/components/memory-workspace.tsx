import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Archive, ArrowLeft, ArrowUpRight, BarChart3, BookOpen, ChevronRight, Home, Layers, Library, MoreHorizontal, Plus, SlidersHorizontal, Undo2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRecallStore } from '@/stores/recall-store';
import { folderPath, subtreeIds, createFolder, changeFolder, moveMemoryCard, newMemoryCard } from '@/lib/memory-folders';
import { parseMemoryMarkdown, planMemoryImport, applyMemoryImport, type MarkdownPlan } from '@/lib/memory-markdown';
import { archiveMemoryCard, restoreMemoryCard } from '@/lib/memory-archive';
import { commitMemory, downloadMemoryText } from '@/services/memory-actions';
import { buildExportPayload } from '@/services/import-export';
import { isCardDue } from '@/lib/stats';
import { createId } from '@/lib/utils';
import { normalizeMemoryReviewPlan } from '@/services/memory-review';
import { MemoryReader } from '@/components/memory-reader';
import { MemoryFolderRows } from '@/components/memory-folder-rows';
import { MemoryStats } from '@/components/memory-stats';
import { MemoryReviewPlanEditor } from '@/components/memory-review-plan';
import { MemoryWereadImport } from '@/components/memory-weread-import';
import { MemoryCloudStatus, MemoryCloudSettings } from '@/components/memory-cloud';
import { Settings } from '@/components/settings';
import { ImportHub } from '@/components/import-hub';
import { RichCard } from '@/components/RichCard';
import { PWAUpdatePrompt } from '@/components/pwa-update-prompt';
import type { Card, Deck } from '@/types';
import './memory-workspace.css';
import './memory-appearance.css';

const titles = { home: '今日复习', folders: '我的卡组', cards: '全部卡片', archived: '已归档', stats: '统计', import: '导入', weread: '微信读书', settings: '设置与数据', advanced: '更多设置', compat: '其他导入' };
type Route = keyof typeof titles | 'read';
type Sheet = { kind: 'folder' | 'card' | 'move' | 'help' | 'filter' | 'path' | 'add' | 'card-menu' | 'reader-options' | 'review-plan' | 'font' | 'archived-detail'; id?: string };
interface ArchiveUndo { id: string; archivedAt: string; expiresAt: number; reading: boolean; }
const template = '# 知识整理\n\n## 回忆方法\n\n<!-- recall:card {} -->\n问题：怎样确认理解？\n\n合上材料，用自己的话说明结论、依据与适用条件。\n\n<!-- recall:end -->\n\n<!-- recall:card {"type":"excerpt","title":"阅读段落"} -->\n\n没有问题的一段内容也可以是一张卡片。\n\n<!-- recall:end -->\n';
const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '首次导入时间未知';
const currentTime = () => Date.now();
const initialRoute = (): Route => {
  const hash = window.location.hash.slice(1);
  return hash === 'decks' ? 'folders' : hash in titles ? hash as keyof typeof titles : 'home';
};

export function MemoryWorkspace(): JSX.Element {
  const store = useRecallStore();
  const { t } = useTranslation();
  const [route, setRoute] = useState<Route>(initialRoute);
  const [folder, setFolder] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [contentType, setContentType] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('new');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<MarkdownPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [receipt, setReceipt] = useState<{ text: string; added: number; updated: number; skipped: number } | null>(null);
  const [filename, setFilename] = useState('知识卡片.md');
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [returnRoute, setReturnRoute] = useState<Route>('home');
  const [archiveUndo, setArchiveUndo] = useState<ArchiveUndo | null>(null);
  const [remaining, setRemaining] = useState(3);
  const [restoreRequest, setRestoreRequest] = useState<{ id: string; token: string } | null>(null);
  const [font, setFont] = useState(() => Math.max(16, Math.min(22, Number(localStorage.getItem('recall.reading.font')) || 18)));
  const [mobile, setMobile] = useState(() => matchMedia('(max-width:760px)').matches);
  const brand = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const fileGeneration = useRef(0);
  const mounted = useRef(true);
  const sheetDirty = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const previousSheet = useRef<Sheet | null>(null);
  const drawerGesture = useRef<{ x: number; y: number; started: number; width: number; active: boolean } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    if (drawer) { setDrawerVisible(true); return; }
    const timer = setTimeout(() => setDrawerVisible(false), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
    return () => clearTimeout(timer);
  }, [drawer]);
  useEffect(() => {
    const media = matchMedia('(max-width:760px)');
    const change = () => { setMobile(media.matches); if (!media.matches) setDrawer(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (contentRef.current) contentRef.current.inert = drawer || !!sheet;
    if (drawerRef.current) drawerRef.current.inert = !!sheet || mobile && !drawer;
    if (brand.current) brand.current.inert = !!sheet;
    if (sheet) {
      sheetDirty.current = false;
      if (!previousSheet.current) restoreFocus.current = document.activeElement as HTMLElement;
      sheetRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (drawer) drawerRef.current?.querySelector<HTMLButtonElement>('[aria-current="page"],button')?.focus();
    else if (restoreFocus.current?.isConnected) restoreFocus.current.focus({ preventScroll: true });
    previousSheet.current = sheet;
  }, [drawer, sheet, mobile]);
  useEffect(() => {
    mounted.current = true;
    const generation = fileGeneration;
    return () => { mounted.current = false; generation.current++; };
  }, []);
  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${route}`);
    contentRef.current?.scrollTo(0, 0);
  }, [route]);
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = '#353532';
  }, []);
  useEffect(() => {
    if (!archiveUndo) return;
    const tick = () => {
      const next = Math.ceil((archiveUndo.expiresAt - Date.now()) / 1000);
      setRemaining(Math.max(0, next));
      if (next <= 0) setArchiveUndo(null);
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [archiveUndo]);

  const available = store.cards.filter(card => !card.archivedAt);
  const scopeIds = subtreeIds(store.decks, folder);
  const scope = available.filter(card => !folder || scopeIds.has(card.deckId));
  const hasFilters = contentType !== '全部' || status !== '全部' || sort !== 'new';
  const keyword = query.trim().toLowerCase();
  const matches = (card: Card) => (!keyword || `${card.front} ${card.back} ${card.bookTitle || ''} ${card.chapter || ''} ${folderPath(store.decks, card.deckId).map(deck => deck.name).join(' ')}`.toLowerCase().includes(keyword)) && (status === '全部' || status === '待复习' && isCardDue(card) || status === '已熟悉' && card.state === 'review');
  function arranged<Item extends Card | Deck>(items: Item[]): Item[] {
    return items.slice().sort((first, second) => {
      if (sort === 'name') return ('name' in first ? first.name : first.front).localeCompare('name' in second ? second.name : second.front, 'zh-CN');
      const field = sort === 'updated' ? 'updatedAt' : 'importedAt';
      const firstTime = Date.parse(first[field] || '') || 0;
      const secondTime = Date.parse(second[field] || '') || 0;
      return (firstTime - secondTime) * (sort === 'old' ? 1 : -1) || first.id.localeCompare(second.id);
    });
  }
  const libraryPool = route === 'archived' ? store.cards.filter(card => card.archivedAt) : route === 'cards' ? available : scope;
  const matching = arranged(libraryPool.filter(matches));
  const expanded = route === 'cards' || route === 'archived' || !!keyword || status !== '全部' || contentType === '仅卡片';
  const visibleCards = contentType === '仅卡组' && route !== 'archived' ? [] : matching.filter(card => expanded || card.deckId === folder);
  const children = route === 'folders' && contentType !== '仅卡片' ? arranged(store.decks.filter(deck => (deck.parentId || null) === folder && (!keyword && status === '全部' || keyword && deck.name.toLowerCase().includes(keyword) && status === '全部' || matching.some(card => subtreeIds(store.decks, deck.id).has(card.deckId))))) : [];
  const dueCards = available.filter(card => isCardDue(card));
  const activeQueue = queue.filter(id => available.some(card => card.id === id));
  const shellTitle = route === 'read' ? index < activeQueue.length ? `${index + 1} / ${activeQueue.length}` : '本轮完成' : route === 'folders' && folder ? store.decks.find(deck => deck.id === folder)?.name : titles[route];
  const navRoute = route === 'read' ? 'home' : route === 'weread' || route === 'compat' ? 'import' : route === 'advanced' ? 'settings' : route;
  const currentFolder = store.decks.find(deck => deck.id === folder);
  const reviewPlan = normalizeMemoryReviewPlan(store.settings.reviewPlan);

  function closeSheet(): void {
    if (busy || lock.current) return;
    if (sheetDirty.current && !window.confirm('放弃未保存的修改？')) return;
    sheetDirty.current = false;
    setSheet(null);
    setError('');
  }
  function navigate(next: Route): void {
    if (lock.current || busy) return;
    fileGeneration.current++;
    setDrawer(false);
    setSheet(null);
    setRoute(next);
    setError('');
    setContentType('全部');
    setStatus('全部');
    setQuery('');
  }
  function openFolder(id: string | null): void {
    if (lock.current || busy) return;
    setFolder(id);
    navigate('folders');
    contentRef.current?.scrollTo(0, 0);
  }
  async function run(change: () => Promise<void>): Promise<void> {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await change(); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : '操作失败，请重试'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function read(cards: Card[], mode: boolean, startId?: string): void {
    const list = cards.filter(card => !card.archivedAt && (!mode || isCardDue(card)));
    if (!list.length) { setError(mode ? '当前没有到期卡片' : '当前没有在学卡片'); return; }
    setReturnRoute(route);
    setQueue(list.map(card => card.id));
    setIndex(startId ? Math.max(0, list.findIndex(card => card.id === startId)) : 0);
    setReviewMode(mode);
    setRestoreRequest(null);
    navigate('read');
  }
  async function loadFile(file?: File): Promise<void> {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('文件不能超过 5 MB'); return; }
    const generation = ++fileGeneration.current;
    setBusy(true);
    setError('');
    try {
      const text = await file.text();
      if (generation !== fileGeneration.current || !mounted.current) return;
      const document = parseMemoryMarkdown(text);
      setPlan(planMemoryImport(useRecallStore.getState(), document, folder));
      setFilename(file.name);
      setSelected(new Set());
      setReceipt(null);
    } catch (failure) { if (generation === fileGeneration.current && mounted.current) setError(failure instanceof Error ? failure.message : '读取失败'); }
    finally { if (generation === fileGeneration.current && mounted.current) setBusy(false); }
  }
  async function archiveCard(id: string): Promise<void> {
    const archivedAt = new Date().toISOString();
    await commitMemory(snapshot => archiveMemoryCard(snapshot, id, archivedAt));
    if (!mounted.current) return;
    setRemaining(3);
    setArchiveUndo({ id, archivedAt, expiresAt: currentTime() + 3000, reading: route === 'read' });
    setSheet(null);
  }
  async function undoArchive(): Promise<void> {
    const operation = archiveUndo;
    if (!operation || currentTime() >= operation.expiresAt) { setArchiveUndo(null); return; }
    await run(async () => {
      await commitMemory(snapshot => restoreMemoryCard(snapshot, operation.id, operation.archivedAt));
      if (route === 'read' && operation.reading) setRestoreRequest({ id: operation.id, token: createId('restore') });
      setArchiveUndo(null);
    });
  }
  function restoreArchive(id: string): void {
    void run(async () => {
      await commitMemory(snapshot => restoreMemoryCard(snapshot, id));
      if (archiveUndo?.id === id) setArchiveUndo(null);
      setSheet(null);
    });
  }
  function topAction(): void {
    if (route === 'read') navigate(returnRoute);
    else if (route === 'archived') navigate('cards');
    else if (route === 'weread' || route === 'compat') navigate('import');
    else if (route === 'advanced') navigate('settings');
    else if (route === 'import') openFolder(folder);
    else if (route === 'settings') navigate('advanced');
    else setSheet({ kind: 'add' });
  }
  function drawerDown(event: PointerEvent<HTMLButtonElement>): void {
    drawerGesture.current = { x: event.clientX, y: event.clientY, started: performance.now(), width: drawerRef.current?.getBoundingClientRect().width || 0, active: false };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drawerMove(event: PointerEvent<HTMLButtonElement>): void {
    const gesture = drawerGesture.current;
    if (!gesture || !shellRef.current) return;
    const horizontal = event.clientX - gesture.x;
    const vertical = event.clientY - gesture.y;
    if (!gesture.active) {
      if (Math.abs(vertical) > Math.abs(horizontal) && Math.abs(vertical) > 10) { drawerGesture.current = null; return; }
      if (Math.abs(horizontal) < 10) return;
      gesture.active = true;
    }
    dragged.current = true;
    shellRef.current.style.transition = 'none';
    shellRef.current.style.transform = `translate3d(${Math.max(0, Math.min(gesture.width, gesture.width + horizontal))}px,0,0)`;
  }
  function drawerUp(event: PointerEvent<HTMLButtonElement>): void {
    const gesture = drawerGesture.current;
    drawerGesture.current = null;
    if (shellRef.current) { shellRef.current.style.transition = ''; shellRef.current.style.transform = ''; }
    if (gesture?.active) {
      const horizontal = event.clientX - gesture.x;
      if (horizontal < -gesture.width * 0.35 || horizontal / Math.max(1, performance.now() - gesture.started) < -0.5) { setDrawer(false); brand.current?.focus(); }
    }
    setTimeout(() => { dragged.current = false; }, 0);
  }

  function itemCard(card: Card): JSX.Element {
    const archived = !!card.archivedAt;
    const title = card.front || card.bookTitle || '阅读摘录';
    return <article className="memory-card-row" key={card.id} data-card-id={card.id}>
      <div className="m-spread"><span className="m-path">{card.chapter ? `${card.bookTitle || store.decks.find(deck => deck.id === card.deckId)?.name} · ${card.chapter}` : folderPath(store.decks, card.deckId).map(deck => deck.name).join(' / ')}</span>{!archived && <button aria-label={`管理卡片：${title}`} onClick={() => setSheet({ kind: 'card-menu', id: card.id })}><MoreHorizontal size={20}/></button>}</div>
      <button className="m-card-open" onClick={() => archived ? setSheet({ kind: 'archived-detail', id: card.id }) : read(arranged(available.filter(candidate => candidate.deckId === card.deckId)), false, card.id)}><strong>{title}</strong><p>{card.back.slice(0, 90)}{card.back.length > 90 ? '…' : ''}</p></button>
      <div className="m-spread"><small>{archived ? `归档于 ${date(card.archivedAt)}` : card.contentKind === 'excerpt' ? '摘录' : card.state === 'review' ? '已熟悉' : card.reps ? '学习中' : '未复习'}</small>{archived ? <button className="m-text" disabled={busy} onClick={() => restoreArchive(card.id)}>{t('memory.restoreArchive', '移出归档')}<Undo2 size={15}/></button> : <small>{date(card.importedAt)}</small>}</div>
    </article>;
  }
  function editorSheet(): JSX.Element {
    const editing = store.cards.find(card => card.id === sheet?.id);
    return <form onChange={() => { sheetDirty.current = true; }} onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      void run(async () => {
        await commitMemory(snapshot => {
          if (sheet?.kind === 'folder') return sheet.id ? changeFolder(snapshot, sheet.id, String(values.get('name')), String(values.get('parent')) || null) : createFolder(snapshot, String(values.get('name')), String(values.get('parent')) || null);
          if (sheet?.kind === 'move') return moveMemoryCard(snapshot, sheet.id!, String(values.get('parent')));
          const at = new Date().toISOString();
          const old = snapshot.cards.find(card => card.id === sheet?.id);
          const fields = { front: String(values.get('front')).trim(), back: String(values.get('back')).trim(), deckId: String(values.get('parent')), contentKind: String(values.get('kind')) as 'qa' | 'excerpt', bookTitle: String(values.get('bookTitle') || ''), chapter: String(values.get('chapter') || ''), source: String(values.get('source') || ''), updatedAt: at };
          if (!fields.back || !snapshot.decks.some(deck => deck.id === fields.deckId)) throw new Error('请选择卡组并填写正文');
          if (fields.contentKind === 'qa' && !fields.front) throw new Error('问答卡需要问题');
          return { ...snapshot, cards: old ? snapshot.cards.map(card => card.id === old.id ? { ...old, ...fields } : card) : [...snapshot.cards, newMemoryCard(fields, at)] };
        });
        sheetDirty.current = false;
        setSheet(null);
      });
    }}>
      {sheet?.kind === 'folder' && <label>名称<input name="name" required maxLength={80} defaultValue={store.decks.find(deck => deck.id === sheet.id)?.name || ''}/></label>}
      <label>{sheet?.kind === 'folder' ? '上级卡组' : '目标卡组'}<select name="parent" required={sheet?.kind !== 'folder'} defaultValue={sheet?.kind === 'folder' ? store.decks.find(deck => deck.id === sheet.id)?.parentId ?? folder ?? '' : editing?.deckId ?? folder ?? store.decks[0]?.id ?? ''}>
        {sheet?.kind === 'folder' && <option value="">根目录</option>}{store.decks.filter(deck => sheet?.kind !== 'folder' || !sheet.id || !subtreeIds(store.decks, sheet.id).has(deck.id)).map(deck => <option key={deck.id} value={deck.id}>{folderPath(store.decks, deck.id).map(item => item.name).join(' / ')}</option>)}
      </select></label>
      {sheet?.kind === 'card' && <><label>类型<select name="kind" defaultValue={editing?.contentKind || 'qa'}><option value="qa">问答卡</option><option value="excerpt">阅读摘录</option></select></label><label>问题或段落标题（摘录可空）<textarea name="front" maxLength={10000} defaultValue={editing?.front || ''}/></label><label>书名<input name="bookTitle" defaultValue={editing?.bookTitle || ''}/></label><label>章节<input name="chapter" defaultValue={editing?.chapter || ''}/></label><label>来源<input name="source" defaultValue={editing?.source || ''}/></label><label>正文<textarea name="back" required maxLength={20000} defaultValue={editing?.back || ''}/></label></>}
      <button className="m-primary" disabled={busy} type="submit">保存修改</button>
    </form>;
  }
  function renderSheet(): JSX.Element {
    if (!sheet) return <></>;
    if (sheet.kind === 'review-plan') return <MemoryReviewPlanEditor onClose={() => setSheet(null)} onBusy={setBusy}/>;
    if (sheet.kind === 'help') return <div className="m-about"><p>#、##、### 是卡组；卡片块里的标题仍是正文。编号和时间可以先留空，导入后保存带编号文件继续维护。</p><pre>{template}</pre><button onClick={() => downloadMemoryText(template, 'Recall-知识卡片示例.md')}>下载完整示例</button></div>;
    if (sheet.kind === 'path') return <div className="m-sheet-list"><button onClick={() => openFolder(null)}>全部卡组</button>{folderPath(store.decks, folder).map(deck => <button key={deck.id} onClick={() => openFolder(deck.id)}>{deck.name}<ChevronRight size={16}/></button>)}</div>;
    if (sheet.kind === 'filter') return <form onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); setContentType(String(values.get('content'))); setStatus(String(values.get('status'))); setSort(String(values.get('sort'))); setSheet(null); }}><label>内容<select name="content" defaultValue={contentType}>{['全部', '仅卡组', '仅卡片'].map(value => <option key={value}>{value}</option>)}</select></label><label>复习状态<select name="status" defaultValue={status}>{['全部', '待复习', '已熟悉'].map(value => <option key={value}>{value}</option>)}</select></label><label>排序<select name="sort" defaultValue={sort}><option value="new">导入时间：新到旧</option><option value="old">导入时间：旧到新</option><option value="name">名称</option><option value="updated">最近修改</option></select></label><p className="m-note">搜索和复习状态覆盖当前卡组及下级内容。</p><button className="m-primary" type="submit">应用</button></form>;
    if (sheet.kind === 'font') return <label>正文字号<select aria-label="正文字号" value={font} onChange={event => { const value = Number(event.target.value); setFont(value); localStorage.setItem('recall.reading.font', String(value)); }}>{[16, 18, 20, 22].map(value => <option key={value}>{value}</option>)}</select></label>;
    if (sheet.kind === 'archived-detail') {
      const card = store.cards.find(candidate => candidate.id === sheet.id);
      return card ? <div className="m-about"><h3>{card.front || card.bookTitle || '阅读摘录'}</h3><RichCard content={card.back} allowHtml={false}/><button className="m-primary" disabled={busy} onClick={() => restoreArchive(card.id)}>移出归档</button></div> : <p>卡片已不存在。</p>;
    }
    if (sheet.kind === 'add') return <div className="m-sheet-list"><button onClick={() => setSheet({ kind: 'folder' })}><Library size={20}/>新建{folder ? '子' : ''}卡组</button><button onClick={() => setSheet({ kind: 'card' })}><Plus size={20}/>添加卡片</button><button onClick={() => navigate('import')}><Upload size={20}/>导入到这里</button>{folder && <button onClick={() => setSheet({ kind: 'folder', id: folder })}><MoreHorizontal size={20}/>管理当前卡组</button>}</div>;
    if (sheet.kind === 'card-menu' || sheet.kind === 'reader-options') return <div className="m-sheet-list">{sheet.id && <><button onClick={() => setSheet({ kind: 'card', id: sheet.id })}><BookOpen size={20}/>编辑卡片</button><button onClick={() => setSheet({ kind: 'move', id: sheet.id })}><Library size={20}/>移动到其他卡组</button><button disabled={busy} onClick={() => void run(() => archiveCard(sheet.id!))}><Archive size={20}/>归档，不再复习</button></>}{sheet.kind === 'reader-options' && <><button onClick={() => setSheet({ kind: 'review-plan' })}><BarChart3 size={20}/>复习计划 · {reviewPlan.mode === 'smart' ? '智能' : '固定'}</button><button onClick={() => setSheet({ kind: 'font' })}>阅读字号</button><button onClick={() => navigate('archived')}><Archive size={20}/>查看已归档</button></>}</div>;
    return editorSheet();
  }

  const sheetTitle = sheet ? { folder: sheet.id ? '管理卡组' : '新建卡组', card: sheet.id ? '编辑卡片' : '添加卡片', move: '移动卡片', help: 'Markdown 格式', filter: '筛选与排序', path: '当前卡组路径', add: '添加', 'card-menu': '管理卡片', 'reader-options': '卡片与复习', 'review-plan': '复习计划', font: '阅读字号', 'archived-detail': '已归档 · 查看原文' }[sheet.kind] : '';
  const navEntries: [Route, string, typeof Home][] = [['home', '今日复习', Home], ['folders', '我的卡组', Library], ['cards', '全部卡片', Layers], ['archived', '已归档', Archive], ['stats', '统计', BarChart3], ['import', '导入', Upload]];
  const topBack = ['read', 'archived', 'weread', 'compat', 'advanced', 'import'].includes(route);
  const topLabel = route === 'read' ? '退出复习' : topBack ? '返回' : route === 'settings' ? '更多设置' : '添加';
  const today = store.reviewLogs.filter(log => new Date(log.reviewDate).toDateString() === new Date().toDateString()).length;
  const recentIds = [...new Set(store.reviewLogs.slice().reverse().map(log => log.cardId))];
  const recent = recentIds.length ? recentIds.map(id => available.find(card => card.id === id)).filter((card): card is Card => !!card).slice(0, 2) : available.slice(0, 2);
  const archiveNotice = archiveUndo ? <div className="m-archive-undo" role="status" aria-live="polite" inert={drawer || !!sheet}><span>已归档，不再安排复习</span><button disabled={busy} onClick={() => void undoArchive()} aria-label={`撤销归档，剩余 ${remaining} 秒`}>撤销 <b aria-hidden="true">{remaining}</b><span aria-hidden="true">s</span></button></div> : null;

  return <div className="memory-app" data-drawer={drawer} onClickCapture={event => {
    (event.target as HTMLElement).closest<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }} onKeyDown={event => {
    if (event.key === 'Escape') { if (sheet) closeSheet(); else if (drawer) { setDrawer(false); brand.current?.focus(); } else if (route === 'read') navigate(returnRoute); }
    if (event.key === 'Tab' && (sheet || drawer)) {
      const root = sheet ? sheetRef.current : drawerRef.current;
      const controls = Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || []);
      if (!sheet && drawer && brand.current) controls.push(brand.current);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <aside id="memory-drawer" className="memory-drawer" ref={drawerRef} data-visible={drawer || drawerVisible} aria-label="项目菜单" aria-hidden={mobile && !drawer}>
      <div className="m-drawer-brand"><strong>Recall</strong><span>记忆卡片</span><small>{titles[navRoute as keyof typeof titles]}</small></div>
      <nav>{navEntries.map(([target, label, Icon]) => <button key={target} aria-current={navRoute === target ? 'page' : undefined} onClick={() => { if (target === 'folders') setFolder(null); navigate(target); }}><span className="m-nav-icon"><Icon size={20}/></span>{t(`memory.routes.${target}`, label)}</button>)}</nav>
      <div className="m-drawer-footer"><button onClick={() => navigate('settings')}>设置与数据</button><button onClick={() => setSheet({ kind: 'add' })}>添加卡片</button><small>本机保存 · Recall</small></div>
    </aside>
    <div ref={shellRef} className={`memory-shell ${drawer ? 'is-open' : ''} ${route === 'read' ? 'is-reading' : ''} ${archiveUndo ? 'has-archive-undo' : ''}`}>
      <header className="memory-bar"><button ref={brand} className="m-brand" aria-expanded={drawer} aria-controls="memory-drawer" aria-label={drawer ? '关闭项目菜单' : '打开项目菜单'} disabled={busy} onClick={() => { if (sheet) { closeSheet(); return; } setDrawer(value => !value); }}><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M23 15h32c27 0 34 32 12 45l19 25H64L43 57v28H23z" fill="white"/><path d="M54 23c-1 10-4 14-14 15 10 1 13 5 14 15 1-10 4-14 14-15-10-1-13-5-14-15" fill="currentColor"/></svg></button>{route === 'folders' && folder ? <button className="m-context" onClick={() => setSheet({ kind: 'path' })} aria-label={`查看卡组路径：${shellTitle}`}>{shellTitle}</button> : <div className="m-context">{shellTitle}</div>}<button className="m-top-action" aria-label={topLabel} disabled={busy || drawer || !!sheet} onClick={topAction}>{route === 'read' ? '退出' : topBack ? <ArrowLeft size={20}/> : route === 'settings' ? <MoreHorizontal size={20}/> : <Plus size={22}/>}</button></header>
      <div ref={contentRef} className="memory-content" data-route={route}>
        <header className="m-desktop-header"><span>{shellTitle}</span><button className="m-secondary" disabled={busy} onClick={topAction}>{topLabel}</button></header>
        <main className="m-main" tabIndex={-1}>
          <PWAUpdatePrompt className="m-pwa-update" hidden={route === 'read'}/>
          {error && !sheet && <p role="alert" className="m-error">{error}</p>}
          {route === 'home' && <><header className="m-intro"><p>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p><h1>今天，温习一点。</h1></header><div className="m-home-columns"><div><section className="m-hero"><p className="m-hero-label"><i/>{dueCards.length ? '今日待复习' : '今日复习已完成'}</p><div className="m-big">{dueCards.length}<small>张卡片</small></div><p className="m-hero-copy">{dueCards.length ? '先试着回忆，再翻开答案。' : '也可以随手翻一张，慢慢读。'}</p><div className="m-card-stack" aria-hidden="true"><div/><div/><div><span>Q.</span><i/><i/><i/><small>从回忆开始</small></div></div><button className="m-primary" disabled={!available.length} onClick={() => read(dueCards.length ? dueCards.slice().sort((first, second) => first.nextReviewDate.localeCompare(second.nextReviewDate)) : arranged(available), !!dueCards.length)}>{dueCards.length ? '开始复习' : '自由浏览'}<ChevronRight size={18}/></button></section><div className="m-home-summary"><div><b>{today}</b><small>今日已练</small></div><div><b>{available.filter(card => card.state === 'review').length}</b><small>已熟悉</small></div><div><b>{available.length}</b><small>在学卡片</small></div></div><div className="m-home-shortcuts"><button onClick={() => navigate('import')}><Upload size={18}/>导入知识</button><button onClick={() => navigate('stats')}><BarChart3 size={18}/>查看统计</button></div></div><div><div className="m-section-head"><h2>我的卡组</h2><button className="m-text" onClick={() => openFolder(null)}>查看全部<ChevronRight size={15}/></button></div><MemoryFolderRows home list={arranged(store.decks.filter(deck => !deck.parentId))} decks={store.decks} cards={available} onOpen={openFolder} onManage={id => setSheet({ kind: 'folder', id })}/>{!store.decks.length && <div className="m-empty"><p>从一个卡组，收好你的知识。</p><button className="m-secondary" onClick={() => setSheet({ kind: 'folder' })}>新建卡组</button></div>}{recent.length > 0 && <section className="m-recent"><div className="m-section-head"><h2>{recentIds.length ? '最近温习' : '随手读一张'}</h2><small>自由浏览</small></div>{recent.map((card, position) => <button key={card.id} onClick={() => read(arranged(available.filter(candidate => candidate.deckId === card.deckId)), false, card.id)}><span className="m-recent-index">{String(position + 1).padStart(2, '0')}</span><span><small>{folderPath(store.decks, card.deckId).map(deck => deck.name).join(' / ')}</small><strong>{card.front || card.bookTitle || '阅读摘录'}</strong></span><ChevronRight size={17}/></button>)}</section>}</div></div></>}
          {route === 'home' && <MemoryCloudStatus onManage={() => navigate('settings')}/>}
          {route === 'settings' && <MemoryCloudSettings/>}
          {['folders', 'cards', 'archived'].includes(route) && <>
            {route === 'archived' && <p className="m-note">不再安排复习。原文和进度仍保留，随时可以移出归档。</p>}
            {route === 'folders' && folder && <button className="m-parent-link" onClick={() => openFolder(currentFolder?.parentId || null)}><ArrowLeft size={16}/>{currentFolder?.parentId ? store.decks.find(deck => deck.id === currentFolder.parentId)?.name : '全部卡组'}</button>}
            <div className="m-library-toolbar"><input type="search" aria-label="搜索当前范围及下级内容" placeholder={route === 'archived' ? '搜索已归档卡片' : '搜索卡组、问题或划线'} value={query} onChange={event => setQuery(event.target.value)}/>{route !== 'archived' && <button className={`m-filter ${hasFilters ? 'is-active' : ''}`} aria-label="筛选与排序" onClick={() => setSheet({ kind: 'filter' })}><SlidersHorizontal size={20}/>{hasFilters && <i/>}</button>}</div>
            {hasFilters && route !== 'archived' && <div className="m-filter-chips">{contentType !== '全部' && <span>{contentType}</span>}{status !== '全部' && <span>{status}</span>}{sort !== 'new' && <span>{sort === 'name' ? '名称排序' : sort === 'updated' ? '最近修改' : '导入最早'}</span>}<button onClick={() => { setContentType('全部'); setStatus('全部'); setSort('new'); }}>清除筛选</button></div>}
            <MemoryFolderRows list={children} decks={store.decks} cards={available} onOpen={openFolder} onManage={id => setSheet({ kind: 'folder', id })}/>
            {visibleCards.length > 0 && <><p className="m-result-heading">{expanded ? `${visibleCards.length} 张匹配卡片` : '本层卡片'}</p>{visibleCards.map(itemCard)}</>}
            {!children.length && !visibleCards.length && <div className="m-empty"><Archive size={34}/><strong>{keyword || hasFilters ? '没有匹配的内容' : route === 'archived' ? '还没有归档卡片' : '从第一张卡片开始'}</strong><p>{route === 'archived' ? '阅读时点击归档，就可以暂时放下这张卡。' : keyword || hasFilters ? '试试其他关键词，或清除筛选。' : '新建卡组，或导入你想温习的知识。'}</p>{route !== 'archived' && !keyword && !hasFilters && <button className="m-secondary" onClick={() => setSheet({ kind: 'add' })}>添加知识</button>}</div>}
          </>}
          {route === 'stats' && <MemoryStats/>}
          {route === 'settings' && <div className="m-settings"><p className="m-note">按照你的节奏，安排下一次温习。</p><div><span><strong>复习计划</strong><small>{reviewPlan.mode === 'smart' ? `智能调度 · ${Math.round(store.settings.desiredRetention * 100)}% 目标记忆率` : '固定间隔 · 自定义四档'}</small></span><button className="m-secondary" onClick={() => setSheet({ kind: 'review-plan' })}>配置</button></div><div><span><strong>已归档</strong><small>保留原文和进度，不安排复习。</small></span><button className="m-secondary" onClick={() => navigate('archived')}>查看 {store.cards.length - available.length}</button></div><div><strong>阅读字号</strong><button className="m-secondary" onClick={() => setSheet({ kind: 'font' })}>{font}</button></div><div><span><strong>本机数据</strong><small>本机保留离线缓存；授权后自动同步，仍建议定期备份。</small></span><button className="m-secondary" onClick={() => downloadMemoryText(JSON.stringify(buildExportPayload(store), null, 2), `Recall-${new Date().toISOString().slice(0, 10)}.recall`, 'application/json')}>备份</button></div><div><strong>导入知识</strong><button className="m-secondary" onClick={() => navigate('import')}>打开</button></div><div><span><strong>更多设置</strong><small>主题、同步和其他选项。</small></span><button className="m-secondary" onClick={() => navigate('advanced')}>查看</button></div></div>}
          {route === 'advanced' && <Settings/>}
          {route === 'compat' && <ImportHub onClose={() => navigate('import')}/>}
          {route === 'weread' && <MemoryWereadImport onClose={() => navigate('import')} onComplete={deckIds => { setDrawer(false); setSheet(null); setFolder(deckIds[0] || null); setRoute('folders'); setQuery(''); setError(''); }} onBusy={setBusy}/>}
          {route === 'import' && <>
            <div className="m-step">选择 / 校验 / 完成</div>
            {!plan && !receipt && <><section className="m-import-box"><span className="m-import-symbol"><Upload size={27}/></span><h1>把知识，收进卡片。</h1><p className="m-note">选择文件，先查看内容，再确认导入。</p><button className="m-primary" disabled={busy} onClick={() => files.current?.click()}>选择 Markdown 文件<Plus size={18}/></button><small>Markdown .md · 多级卡组 · 增量更新</small><input ref={files} type="file" accept=".md,.markdown" hidden onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }}/></section><div className="m-import-choice"><span><strong>Markdown 格式</strong><small>多级卡组，重复导入不覆盖进度。</small></span><div><button onClick={() => downloadMemoryText(template, 'Recall-知识卡片示例.md')}>示例</button><button onClick={() => setSheet({ kind: 'help' })}>格式</button></div></div><div className="m-import-choice"><span><strong>微信读书</strong><small>选书、预览回忆问题，保留划线原文。</small></span><button className="m-secondary" onClick={() => navigate('weread')}>导入划线</button></div><div className="m-import-choice"><span><strong>手动整理</strong><small>从一个问题和答案开始。</small></span><button className="m-secondary" onClick={() => setSheet({ kind: 'card' })}>添加</button></div><button className="m-text m-compat-link" onClick={() => navigate('compat')}>其他导入：CSV / Anki / Recall<ArrowUpRight size={15}/></button></>}
            {plan && <><section className="m-panel"><strong>{filename}</strong><label>导入到<select value={plan.parentId || ''} onChange={event => { try { setPlan(planMemoryImport(useRecallStore.getState(), plan.document, event.target.value || null)); setSelected(new Set()); setError(''); } catch (failure) { setError(String(failure)); } }}><option value="">根目录</option>{store.decks.map(deck => <option key={deck.id} value={deck.id}>{folderPath(store.decks, deck.id).map(item => item.name).join(' / ')}</option>)}</select></label></section><p className="m-counts">新增 {plan.rows.filter(row => row.status === 'new').length} · 重复 {plan.rows.filter(row => row.status === 'duplicate').length} · 变更 {plan.rows.filter(row => row.status === 'change').length}</p>{plan.rows.map(row => <article key={row.entry.id} className="m-panel"><div className="m-spread"><strong>{row.status === 'new' ? '新增' : row.status === 'duplicate' ? '跳过重复' : '检测到变化'}</strong>{row.status === 'change' && <label className="m-check"><input type="checkbox" checked={selected.has(row.entry.id)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(row.entry.id); else next.delete(row.entry.id); return next; })}/>更新</label>}</div><small>{row.entry.path.join(' / ')}</small><h3>{row.entry.front || row.entry.bookTitle || '阅读摘录'}</h3><p>{row.entry.back.slice(0, 240)}</p>{row.existing && row.status === 'change' && <details><summary>查看差异</summary><p>当前：</p><pre>{row.existing.front + '\n' + row.existing.back}</pre><p>文件：</p><pre>{row.entry.front + '\n' + row.entry.back}</pre><small>保留首次导入时间、归档状态与复习进度。</small></details>}</article>)}<div className="m-import-footer"><button className="m-secondary" disabled={busy} onClick={() => setPlan(null)}>取消</button><button className="m-primary" disabled={busy} onClick={() => void run(async () => { let result: ReturnType<typeof applyMemoryImport> | undefined; await commitMemory(snapshot => { result = applyMemoryImport(snapshot, plan, selected); return result.snapshot; }); setReceipt(result!); setPlan(null); })}>确认导入</button></div>{error.includes('重新校验') && <button className="m-secondary" onClick={() => { setPlan(planMemoryImport(useRecallStore.getState(), plan.document, plan.parentId)); setSelected(new Set()); setError(''); }}>重新校验</button>}</>}
            {receipt && <section className="m-panel"><h2>导入完成</h2><p>新增 {receipt.added}，更新 {receipt.updated}，跳过 {receipt.skipped}</p><button className="m-primary" onClick={() => downloadMemoryText(receipt.text, filename.replace(/\.md$/i, '').replace(/-带编号$/, '') + '-带编号.md')}>保存带编号的 Markdown</button><button className="m-secondary" onClick={() => { setReceipt(null); openFolder(folder); }}>查看位置</button><button onClick={() => setReceipt(null)}>继续导入</button></section>}
          </>}
          {route === 'read' && <MemoryReader ids={queue} initialIndex={index} reviewMode={reviewMode} onEdit={id => setSheet({ kind: 'card', id })} onOptions={id => setSheet({ kind: 'reader-options', id })} onArchive={archiveCard} restoreRequest={restoreRequest} archiveNotice={archiveNotice} fontSize={font} onIndex={setIndex} onExit={() => navigate(returnRoute)} onBusy={setBusy}/>}
        </main>
        {['folders', 'cards'].includes(route) && libraryPool.length > 0 && <div className="m-library-dock"><button className="m-secondary" disabled={!matching.length || busy} onClick={() => read(matching, false)}>浏览<span>{matching.length}</span></button><button className="m-primary" disabled={!matching.some(card => isCardDue(card)) || busy} onClick={() => read(matching.filter(card => isCardDue(card)).sort((first, second) => first.nextReviewDate.localeCompare(second.nextReviewDate)), true)}>到期复习<span>{matching.filter(card => isCardDue(card)).length}</span><ChevronRight size={16}/></button></div>}
      </div>
      {route !== 'read' && archiveNotice}
      {drawer && <button className="m-dismiss" aria-label="关闭菜单" onPointerDown={drawerDown} onPointerMove={drawerMove} onPointerUp={drawerUp} onPointerCancel={() => { drawerGesture.current = null; if (shellRef.current) { shellRef.current.style.transform = ''; shellRef.current.style.transition = ''; } }} onClick={() => { if (!dragged.current) { setDrawer(false); brand.current?.focus(); } }}/>}</div>
    {sheet && <div className="m-sheet-wrap" onClick={event => { if (event.target === event.currentTarget) closeSheet(); }}><section className="m-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="memory-sheet-title"><div className="m-grab"/><header><h2 id="memory-sheet-title">{sheetTitle}</h2><button disabled={busy} aria-label="关闭面板" onClick={closeSheet}><X size={22}/></button></header>{error && <p role="alert" className="m-error">{error}</p>}{renderSheet()}</section></div>}
  </div>;
}
