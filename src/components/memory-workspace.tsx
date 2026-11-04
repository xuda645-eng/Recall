import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Archive, ArrowLeft, BarChart3, BookOpen, ChevronRight, Home, Layers, Library, MoreHorizontal, Plus, SlidersHorizontal, Trash2, Undo2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRecallStore } from '@/stores/recall-store';
import { folderPath, subtreeIds, createFolder, changeFolder, moveMemoryCard, newMemoryCard, memoryImportLocations } from '@/lib/memory-folders';
import { parseMemoryMarkdown, planMemoryImport, applyMemoryImport, type MarkdownPlan } from '@/lib/memory-markdown';
import { archiveMemoryCard, archiveMemoryFolder, deleteArchivedMemoryCard, deleteArchivedMemoryFolder, memoryArchiveFolderState, restoreMemoryCard, restoreMemoryCards, restoreMemoryFolder } from '@/lib/memory-archive';
import { commitMemory, downloadMemoryText } from '@/services/memory-actions';
import { memoryCardSummary } from '@/lib/memory-card-summary';
import { memoryProgressCounts } from '@/services/memory-statistics';
import { isCardDue } from '@/lib/stats';
import { createId } from '@/lib/utils';
import { normalizeMemoryReviewPlan } from '@/services/memory-review';
import { isMemoryNewCard, normalizeMemoryStudyPreferences, selectMemoryStudyCards } from '@/services/memory-study';
import { MemoryFolderRows } from '@/components/memory-folder-rows';
import { MemoryReviewDeckPicker } from '@/components/memory-review-deck-picker';
import { MemoryStatusEdge } from '@/components/memory-status-edge';
import { MemoryDisplayDiagnostics } from '@/components/memory-display-diagnostics';
import { MemoryCloudDrawerStatus, MemoryCloudSettings } from '@/components/memory-cloud';
import { PWAAppVersion, PWAUpdatePrompt } from '@/components/pwa-update-prompt';
import { MediaEditor } from '@/components/media-editor';
import { MediaBackupControls } from '@/components/media-backup-controls';
import { MediaPackagePreview } from '@/components/media-package-preview';
import { MemoryImportChoices } from '@/components/memory-import-choices';
import { parseMediaPackage } from '@/services/media-package';
import { MemoryImportCompletion } from '@/components/memory-import-completion';
import { MemoryFolderSelector } from '@/components/memory-folder-selector';
import { organizeExistingWereadFolders } from '@/services/weread-folder-organization';
import { parseWereadExport } from '@/lib/memory-weread';
import { saveMedia } from '@/services/media-storage';
import type { MediaAsset } from '../../shared/media';
import type { Card, Deck } from '@/types';
import './memory-workspace.css';
import './memory-appearance.css';
import './memory-study.css';

const MemoryReader = lazy(() => import('@/components/memory-reader').then(module => ({ default: module.MemoryReader })));
const MemoryStats = lazy(() => import('@/components/memory-stats').then(module => ({ default: module.MemoryStats })));
const MemoryReviewPlanEditor = lazy(() => import('@/components/memory-review-plan').then(module => ({ default: module.MemoryReviewPlanEditor })));
const MemoryWereadImport = lazy(() => import('@/components/memory-weread-import').then(module => ({ default: module.MemoryWereadImport })));
const MemoryWereadLocalImport = lazy(() => import('@/components/memory-weread-import').then(module => ({ default: module.MemoryWereadManualImport })));
const Settings = lazy(() => import('@/components/settings').then(module => ({ default: module.Settings })));
const ImportHub = lazy(() => import('@/components/import-hub').then(module => ({ default: module.ImportHub })));
const RichCard = lazy(() => import('@/components/RichCard').then(module => ({ default: module.RichCard })));
const loadingView = <p className="m-note" role="status">正在加载，请稍候。</p>;

const titles = { home: '今日复习', folders: '卡组目录', cards: '全部卡片', archived: '已归档', stats: '统计', import: '导入', weread: '微信读书', settings: '设置与数据', advanced: '更多设置', compat: '其他导入' };
type Route = keyof typeof titles | 'read';
type Sheet = { kind: 'folder' | 'folder-archive' | 'folder-restore' | 'archived-folder-menu' | 'archived-card-menu' | 'archived-folder-delete' | 'archived-card-delete' | 'card' | 'move' | 'help' | 'filter' | 'path' | 'add' | 'card-menu' | 'reader-options' | 'review-plan' | 'review-deck' | 'font' | 'archived-detail' | 'backup' | 'cloud'; id?: string };
interface ArchiveUndo { ids: string[]; archivedAt: string; expiresAt: number; reading: boolean; }
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
  const [archivedFolder, setArchivedFolder] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [contentType, setContentType] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('new');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; deckIds: string[]; cardIds: string[]; archivedAt?: string } | null>(null);
  const [plan, setPlan] = useState<MarkdownPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [receipt, setReceipt] = useState<{ text: string; added: number; updated: number; skipped: number; deckIds: string[]; parentId: string | null } | null>(null);
  const [importFormat, setImportFormat] = useState('Markdown');
  const [organizationError, setOrganizationError] = useState('');
  const [localWereadFile, setLocalWereadFile] = useState<File | null>(null);
  const [compatReceipt, setCompatReceipt] = useState<{ source: string; added: number; updated: number; skipped: number; deckIds: string[] } | null>(null);
  const [filename, setFilename] = useState('知识卡片.md');
  const [importAssets, setImportAssets] = useState<MediaAsset[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [reviewScope, setReviewScope] = useState<string[]>([]);
  const [readerKey, setReaderKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [returnRoute, setReturnRoute] = useState<Route>('home');
  const [studyDeck, setStudyDeck] = useState(() => localStorage.getItem('recall.study.deck') || '');
  const [illustration] = useState(() => new Date().getDate() % 3);
  const [editorPreview, setEditorPreviewState] = useState(false);
  const [expandedAnswer, setExpandedAnswer] = useState(false);
  const [editorContent, setEditorContent] = useState({ front: '', back: '' });
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
  const wereadBack = useRef<(() => void) | null>(null);
  const registerWereadBack = useCallback((handler: (() => void) | null) => { wereadBack.current = handler; }, []);
  const lock = useRef(false);
  const fileGeneration = useRef(0);
  const mounted = useRef(true);
  const sheetDirty = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const previousSheet = useRef<Sheet | null>(null);
  const drawerGesture = useRef<{ x: number; y: number; started: number; width: number; active: boolean } | null>(null);
  const dragged = useRef(false);
  const readingOrigin = useRef<{ route: Route; folder: string | null; contentType: string; status: string; query: string; sort: string; scroll: number; cardId?: string; label: string } | null>(null);
  const restoreReadingOrigin = useRef(false);

  useEffect(() => {
    void organizeExistingWereadFolders().then(() => { if (mounted.current) setOrganizationError(''); }).catch(failure => {
      if (mounted.current) setOrganizationError(`微信读书归组未完成：${failure instanceof Error ? failure.message : '请稍后重试'}。原卡片与进度保留。`);
    });
  }, [store.cards, store.decks]);

  function setEditorPreview(show: boolean): void {
    const form = sheetRef.current?.querySelector('form');
    if (show && form) {
      const values = new FormData(form);
      setEditorContent({ front: String(values.get('front') || ''), back: String(values.get('back') || '') });
    }
    setEditorPreviewState(show);
  }

  useEffect(() => {
    const card = useRecallStore.getState().cards.find(candidate => candidate.id === sheet?.id);
    setEditorPreviewState(false);
    setExpandedAnswer(false);
    setEditorContent({ front: card?.front || '', back: card?.back || '' });
  }, [sheet]);

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
    if (sheet && !previousSheet.current) restoreFocus.current = document.activeElement as HTMLElement;
    if (contentRef.current) contentRef.current.inert = drawer || !!sheet;
    if (drawerRef.current) drawerRef.current.inert = !!sheet || mobile && !drawer;
    if (brand.current) brand.current.inert = !!sheet;
    if (sheet) {
      sheetDirty.current = false;
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
  useLayoutEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${route}`);
    const origin = readingOrigin.current;
    if (restoreReadingOrigin.current && origin?.route === route) {
      restoreReadingOrigin.current = false;
      contentRef.current?.scrollTo(0, origin.scroll);
      const controls = Array.from(contentRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
      const target = (origin.cardId ? controls.find(button => button.classList.contains('m-card-open') && button.closest('[data-card-id]')?.getAttribute('data-card-id') === origin.cardId) : undefined) || controls.find(button => (button.getAttribute('aria-label') || button.textContent?.trim()) === origin.label);
      target?.focus({ preventScroll: true });
      return;
    }
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

  const archiveFolders = useMemo(() => memoryArchiveFolderState(store.decks, store.cards), [store.decks, store.cards]);
  const activeDecks = store.decks.filter(deck => !archiveFolders.ids.has(deck.id));
  useEffect(() => {
    if (!folder || !archiveFolders.ids.has(folder)) return;
    const parent = folderPath(store.decks, folder).slice(0, -1).reverse().find(deck => !archiveFolders.ids.has(deck.id));
    setFolder(parent?.id ?? null);
  }, [folder, archiveFolders, store.decks]);
  const available = store.cards.filter(card => !card.archivedAt);
  const scopeIds = subtreeIds(store.decks, folder);
  const scope = available.filter(card => !folder || scopeIds.has(card.deckId));
  const hasFilters = contentType !== '全部' || status !== '全部' || sort !== 'new';
  const keyword = query.trim().toLowerCase();
  const matches = (card: Card) => (!keyword || `${card.front} ${card.back} ${card.bookTitle || ''} ${card.chapter || ''} ${folderPath(store.decks, card.deckId).map(deck => deck.name).join(' ')}`.toLowerCase().includes(keyword)) && (status === '全部' || status === '待复习' && !isMemoryNewCard(card) && isCardDue(route === 'archived' ? { ...card, archivedAt: undefined } : card) || status === '待学习' && isMemoryNewCard(card) || status === '学习中' && !isMemoryNewCard(card) && card.state !== 'review' || status === '长期复习' && !isMemoryNewCard(card) && card.state === 'review');
  function arranged<Item extends Card | Deck>(items: Item[]): Item[] {
    return items.slice().sort((first, second) => {
      if (sort === 'name') return ('name' in first ? first.name : first.front).localeCompare('name' in second ? second.name : second.front, 'zh-CN');
      const field = sort === 'updated' ? 'updatedAt' : 'importedAt';
      const firstDate = route === 'archived' && sort !== 'updated' ? 'name' in first ? archiveFolders.times.get(first.id) : first.archivedAt : first[field];
      const secondDate = route === 'archived' && sort !== 'updated' ? 'name' in second ? archiveFolders.times.get(second.id) : second.archivedAt : second[field];
      const firstTime = Date.parse(firstDate || '') || 0;
      const secondTime = Date.parse(secondDate || '') || 0;
      if (firstTime === secondTime && !('name' in first) && !('name' in second)
        && first.sourceRef?.bookId === second.sourceRef?.bookId && first.sourceRef?.chapterIdx !== undefined && second.sourceRef?.chapterIdx !== undefined
        && first.sourceRef.range && second.sourceRef.range) {
        return first.sourceRef.chapterIdx - second.sourceRef.chapterIdx || Number(first.sourceRef.range.split('-')[0]) - Number(second.sourceRef.range.split('-')[0]) || first.id.localeCompare(second.id);
      }
      return (firstTime - secondTime) * (sort === 'old' ? 1 : -1) || first.id.localeCompare(second.id);
    });
  }
  const archivedScope = subtreeIds(store.decks, archivedFolder);
  const libraryPool = route === 'archived' ? store.cards.filter(card => card.archivedAt && (!archivedFolder || archivedScope.has(card.deckId))) : route === 'cards' ? available : scope;
  const matching = arranged(libraryPool.filter(matches));
  function matchesArchivedFolder(deck: Deck): boolean {
    const ids = subtreeIds(store.decks, deck.id);
    return status === '全部' && (!keyword || folderPath(store.decks, deck.id).some(item => item.name.toLowerCase().includes(keyword)) || store.decks.some(child => ids.has(child.id) && child.name.toLowerCase().includes(keyword))) || matching.some(card => ids.has(card.deckId));
  }
  const expanded = route === 'cards' || route === 'archived' || !!keyword || status !== '全部' || contentType === '仅卡片';
  const visibleCards = contentType === '仅卡组' ? [] : route === 'archived' ? matching.filter(card => contentType === '仅卡片' || card.deckId === archivedFolder || !archiveFolders.ids.has(card.deckId)) : matching.filter(card => expanded || card.deckId === folder);
  const children = contentType === '仅卡片' ? [] : route === 'folders' ? arranged(activeDecks.filter(deck => (deck.parentId || null) === folder && (!keyword && status === '全部' || keyword && deck.name.toLowerCase().includes(keyword) && status === '全部' || matching.some(card => subtreeIds(store.decks, deck.id).has(card.deckId))))) : route === 'archived' ? arranged(store.decks.filter(deck => archiveFolders.ids.has(deck.id) && (!archivedFolder || archivedScope.has(deck.id) && deck.id !== archivedFolder) && (deck.parentId === archivedFolder || !deck.parentId || !archiveFolders.ids.has(deck.parentId)) && matchesArchivedFolder(deck))) : [];
  const studyPreferences = normalizeMemoryStudyPreferences(store.settings.studyPreferences);
  const lastStudyDeck = activeDecks.find(deck => deck.id === studyDeck);
  const progress = memoryProgressCounts(available);
  const libraryRecommendation = selectMemoryStudyCards(matching, studyPreferences, new Date(), store.settings);
  const activeQueue = queue.filter(id => available.some(card => card.id === id));
  const shellTitle = route === 'read' ? index < activeQueue.length ? `${index + 1} / ${activeQueue.length}` : '本轮完成' : route === 'folders' && folder ? store.decks.find(deck => deck.id === folder)?.name : route === 'archived' && archivedFolder ? store.decks.find(deck => deck.id === archivedFolder)?.name : titles[route];
  const navRoute = route === 'read' ? returnRoute : route === 'weread' || route === 'compat' ? 'import' : route === 'advanced' ? 'settings' : route;
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
    if (next !== 'weread') setLocalWereadFile(null);
    if (next !== 'compat') setCompatReceipt(null);
    setArchivedFolder(null);
    setError('');
    if (next !== 'read') {
      setContentType('全部');
      setStatus('全部');
      setQuery('');
    }
  }
  function exitReading(): void {
    if (lock.current || busy) return;
    const origin = readingOrigin.current;
    navigate(origin?.route || returnRoute);
    if (!origin) return;
    setFolder(origin.folder);
    setContentType(origin.contentType);
    setStatus(origin.status);
    setQuery(origin.query);
    setSort(origin.sort);
    restoreReadingOrigin.current = true;
  }
  function openFolder(id: string | null): void {
    if (lock.current || busy) return;
    setFolder(id);
    navigate('folders');
    contentRef.current?.scrollTo(0, 0);
  }
  function openArchivedFolder(id: string | null): void {
    if (lock.current || busy) return;
    navigate('archived');
    setArchivedFolder(id);
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
    const list = mode ? selectMemoryStudyCards(cards, studyPreferences, new Date(), store.settings).cards : cards.filter(card => !card.archivedAt);
    if (!list.length) { setError(mode ? '当前没有到期旧卡或待学习新卡' : '当前没有在学卡片'); return; }
    if (route !== 'read') {
      setReturnRoute(route);
      const focused = sheet?.kind === 'review-deck' ? restoreFocus.current : document.activeElement as HTMLElement | null;
      readingOrigin.current = { route, folder, contentType, status, query, sort, scroll: contentRef.current?.scrollTop || 0, cardId: startId || focused?.closest('[data-card-id]')?.getAttribute('data-card-id') || undefined, label: focused?.getAttribute('aria-label') || focused?.textContent?.trim() || '' };
    }
    setReviewScope(cards.map(card => card.id));
    setReaderKey(value => value + 1);
    setQueue(list.map(card => card.id));
    setIndex(startId ? Math.max(0, list.findIndex(card => card.id === startId)) : 0);
    setReviewMode(mode);
    setRestoreRequest(null);
    navigate('read');
  }
  async function loadFile(file?: File): Promise<void> {
    if (!file) return;
    if (file.size > (file.name.endsWith('.json') ? 16 : 5) * 1024 * 1024) { setError('Markdown 最大 5 MB，带图包最大 16 MB'); return; }
    const generation = ++fileGeneration.current;
    setBusy(true);
    setError('');
    try {
      const text = await file.text();
      if (generation !== fileGeneration.current || !mounted.current) return;
      if (file.name.endsWith('.json') && JSON.parse(text)?.format === 'recall-weread-export-v1') {
        parseWereadExport(text);
        setLocalWereadFile(file);
        setPlan(null);
        setReceipt(null);
        setImportAssets([]);
        setRoute('weread');
        setDrawer(false);
        setSheet(null);
        return;
      }
      const packed = file.name.endsWith('.json') ? await parseMediaPackage(text) : null;
      if (generation !== fileGeneration.current || !mounted.current) return;
      if (packed && !packed.package.markdown) throw new Error('这是完整带图备份，请从设置中的恢复入口合并恢复');
      const document = parseMemoryMarkdown(packed?.package.markdown ?? text);
      setPlan(planMemoryImport(useRecallStore.getState(), document, folder));
      setImportAssets(packed?.assets ?? []);
      setImportFormat(packed ? '带图文件' : 'Markdown');
      setFilename(file.name);
      setSelected(new Set());
      setReceipt(null);
    } catch (failure) { if (generation === fileGeneration.current && mounted.current) setError(failure instanceof Error ? failure.message : '读取失败'); }
    finally { if (generation === fileGeneration.current && mounted.current) setBusy(false); }
  }
  async function confirmImport(): Promise<void> {
    if (!plan || busy) return;
    await run(async () => {
      let result: ReturnType<typeof applyMemoryImport> | undefined;
      if (importAssets.length) await saveMedia(importAssets);
      await commitMemory(snapshot => { result = applyMemoryImport(snapshot, plan, selected); return result.snapshot; });
      if (!mounted.current || !result) return;
      const importedIds = new Set(plan.rows.map(row => row.existing?.id || row.entry.id));
      const deckIds = [...new Set(result.snapshot.cards.filter(card => importedIds.has(card.id)).map(card => card.deckId))];
      setReceipt({ text: result.text, added: result.added, updated: result.updated, skipped: result.skipped, deckIds, parentId: plan.parentId });
      setPlan(null);
      setImportAssets([]);
    });
  }
  async function archiveCard(id: string): Promise<void> {
    const archivedAt = new Date().toISOString();
    await commitMemory(snapshot => archiveMemoryCard(snapshot, id, archivedAt));
    if (!mounted.current) return;
    setRemaining(3);
    setArchiveUndo({ ids: [id], archivedAt, expiresAt: currentTime() + 3000, reading: route === 'read' });
    setSheet(null);
  }
  async function archiveFolder(id: string): Promise<void> {
    const archivedAt = new Date().toISOString();
    let ids: string[] = [];
    await commitMemory(snapshot => {
      const result = archiveMemoryFolder(snapshot, id, archivedAt);
      ids = result.ids;
      return result.snapshot;
    });
    if (!mounted.current) return;
    setRemaining(3);
    setArchiveUndo({ ids, archivedAt, expiresAt: currentTime() + 3000, reading: false });
    setSheet(null);
  }
  async function undoArchive(): Promise<void> {
    const operation = archiveUndo;
    if (!operation || currentTime() >= operation.expiresAt) { setArchiveUndo(null); return; }
    await run(async () => {
      await commitMemory(snapshot => restoreMemoryCards(snapshot, operation.ids, operation.archivedAt));
      if (route === 'read' && operation.reading) setRestoreRequest({ id: operation.ids[0], token: createId('restore') });
      setArchiveUndo(null);
    });
  }
  function restoreArchive(id: string): void {
    void run(async () => {
      await commitMemory(snapshot => restoreMemoryCard(snapshot, id));
      if (archiveUndo?.ids.includes(id)) setArchiveUndo(null);
      setSheet(null);
    });
  }
  async function restoreArchiveFolder(id: string): Promise<void> {
    await commitMemory(snapshot => restoreMemoryFolder(snapshot, id).snapshot);
    if (!mounted.current) return;
    setArchiveUndo(null);
    setArchivedFolder(null);
    setSheet(null);
  }
  function topAction(): void {
    if (route === 'read') exitReading();
    else if (route === 'folders' && folder) openFolder(currentFolder?.parentId || null);
    else if (route === 'archived' && archivedFolder) {
      const parent = store.decks.find(deck => deck.id === archivedFolder)?.parentId;
      openArchivedFolder(parent && archiveFolders.ids.has(parent) ? parent : null);
    }
    else if (route === 'weread' && wereadBack.current) wereadBack.current();
    else if (route === 'weread' || route === 'compat') navigate('import');
    else if (route === 'advanced') navigate('settings');
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
      <div className="m-spread"><span className="m-path">{route === 'folders' && !expanded ? card.contentKind === 'excerpt' ? '阅读摘录' : '问答卡' : card.chapter ? `${card.bookTitle || store.decks.find(deck => deck.id === card.deckId)?.name} · ${card.chapter}` : folderPath(store.decks, card.deckId).map(deck => deck.name).join(' / ')}</span><button className="m-text" aria-label={`${archived ? '管理归档卡片' : '管理卡片'}：${title}`} disabled={busy} onClick={() => setSheet({ kind: archived ? 'archived-card-menu' : 'card-menu', id: card.id })}><MoreHorizontal size={20}/></button></div>
      <button className="m-card-open" onClick={() => archived ? setSheet({ kind: 'archived-detail', id: card.id }) : read(matching, false, card.id)}><strong>{title}</strong><p>{memoryCardSummary(card.back)}</p></button>
      <div className="m-spread"><small>{archived ? `归档于 ${date(card.archivedAt)}` : card.contentKind === 'excerpt' ? '摘录' : isMemoryNewCard(card) ? '待学习' : card.state === 'review' ? '长期复习' : '学习中'}</small>{!archived && <small>{card.source || card.back.includes('来源证据') ? '含来源信息' : ''}</small>}</div>
    </article>;
  }
  function editorSheet(): JSX.Element {
    const editing = store.cards.find(card => card.id === sheet?.id);
    const archiveFolders = sheet?.kind === 'folder' && sheet.id ? subtreeIds(store.decks, sheet.id) : new Set<string>();
    const archiveCount = available.filter(card => archiveFolders.has(card.deckId)).length;
    return <form onChange={event => { sheetDirty.current = true; const values = new FormData(event.currentTarget); setEditorContent({ front: String(values.get('front') || ''), back: String(values.get('back') || '') }); }} onSubmit={event => {
      event.preventDefault();
      setEditorPreview(false);
      const values = new FormData(event.currentTarget);
      void run(async () => {
        await commitMemory(snapshot => {
          if (sheet?.kind === 'folder') return sheet.id ? changeFolder(snapshot, sheet.id, String(values.get('name')), String(values.get('parent')) || null) : createFolder(snapshot, String(values.get('name')), String(values.get('parent')) || null);
          if (sheet?.kind === 'move') return moveMemoryCard(snapshot, sheet.id!, String(values.get('parent')));
          const at = new Date().toISOString();
          const old = snapshot.cards.find(card => card.id === sheet?.id);
          const fields = { front: String(values.get('front')).trim(), back: old?.sourceRef?.highlights ? old.back : String(values.get('back')).trim(), deckId: String(values.get('parent')), contentKind: old?.contentKind === 'excerpt' ? 'excerpt' as const : 'qa' as const, bookTitle: String(values.get('bookTitle') || ''), chapter: String(values.get('chapter') || ''), source: String(values.get('source') || ''), updatedAt: at };
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
      {sheet?.kind === 'card' && <><p className="m-note">{editing?.sourceRef?.highlights ? '合并划线原文只读，可修改问题；来源与复习进度保留。' : editing?.contentKind === 'excerpt' ? '阅读摘录 · 保留原文与复习进度' : '问答卡 · 先回忆问题，再查看答案'}</p><div className="m-editor-tabs"><button type="button" aria-pressed={!editorPreview} onClick={() => setEditorPreview(false)}>编辑</button><button type="button" aria-pressed={editorPreview} onClick={() => setEditorPreview(true)}>预览</button></div><div hidden={editorPreview} className="m-editor-fields"><label>{editing?.contentKind === 'excerpt' ? '段落标题（可选）' : '问题'}<textarea name="front" required={!editorPreview && editing?.contentKind !== 'excerpt'} maxLength={10000} defaultValue={editing?.front || ''}/></label><label>{editing?.contentKind === 'excerpt' ? '划线原文' : '答案'}<textarea className={expandedAnswer ? 'is-expanded' : ''} name="back" required={!editorPreview} readOnly={!!editing?.sourceRef?.highlights} maxLength={20000} defaultValue={editing?.back || ''}/></label><button className="m-text" type="button" aria-pressed={expandedAnswer} onClick={() => setExpandedAnswer(value => !value)}>{expandedAnswer ? '收起答案编辑' : '展开答案编辑'}</button></div>{editorPreview && <section className="m-editor-preview" aria-label="卡片排版预览"><RichCard content={editorContent.front} allowHtml={false}/><hr/><RichCard content={editorContent.back} allowHtml={false} collapseSourceEvidence/></section>}<details className="m-card-source-fields"><summary>来源信息（可选）</summary><label>书名<input name="bookTitle" defaultValue={editing?.bookTitle || ''}/></label><label>章节<input name="chapter" defaultValue={editing?.chapter || ''}/></label><label>来源<input name="source" defaultValue={editing?.source || ''}/></label></details></>}
      {sheet?.kind === 'folder' && sheet.id && <><button className="m-secondary" type="button" disabled={busy || !archiveCount} onClick={() => { if (sheetDirty.current && !window.confirm('归档前放弃未保存的修改？')) return; setSheet({ kind: 'folder-archive', id: sheet.id }); }}><Archive size={20}/>归档整个卡组</button><small>{archiveCount ? `包含所有子卡组，共 ${archiveCount} 张在学卡片。原文与进度保留。` : '本卡组及子卡组没有在学卡片。'}</small></>}
      {sheet?.kind === 'card' && !editing?.sourceRef?.highlights && <MediaEditor onBusy={setBusy} onDirty={() => { sheetDirty.current = true; }}/>}
      {editing && <small>首次导入：{date(editing.importedAt)} · 最近修改：{date(editing.updatedAt)}</small>}
      <button className="m-primary" disabled={busy} type="submit">{sheet?.kind === 'card' && !editing ? '保存卡片' : '保存修改'}</button>
    </form>;
  }
  function renderSheet(): JSX.Element {
    if (!sheet) return <></>;
    if (sheet.kind === 'review-deck') return <MemoryReviewDeckPicker decks={store.decks} cards={store.cards} preferences={studyPreferences} settings={store.settings} lastDeck={studyDeck} onStart={(cards, mode, deckId) => {
      setStudyDeck(deckId);
      try { localStorage.setItem('recall.study.deck', deckId); } catch { setError('本机未能保存卡组偏好，本次选择仍然有效。'); }
      read(mode ? cards : arranged(cards), mode);
    }}/>;
    if (sheet.kind === 'backup') return <MediaBackupControls onBusy={setBusy} onRestorePlain={() => navigate('compat')}/>;
    if (sheet.kind === 'cloud') return <MemoryCloudSettings/>;
    if (sheet.kind === 'archived-folder-menu' || sheet.kind === 'archived-card-menu') {
      const isFolder = sheet.kind === 'archived-folder-menu';
      const entity = isFolder ? store.decks.find(deck => deck.id === sheet.id) : store.cards.find(card => card.id === sheet.id);
      const folders = subtreeIds(store.decks, sheet.id || null);
      const canRestore = isFolder ? store.cards.some(card => card.archivedAt && folders.has(card.deckId)) : !!(entity as Card | undefined)?.archivedAt;
      return <div className="m-sheet-list"><button disabled={busy || !canRestore} onClick={() => isFolder ? setSheet({ kind: 'folder-restore', id: sheet.id }) : restoreArchive(sheet.id!)}><Undo2 size={18}/>移出归档（恢复）</button><button className="m-danger" disabled={busy || !entity} onClick={() => {
        setDeleteConfirmation('');
        setDeleteTarget({ id: sheet.id!, deckIds: isFolder ? [...folders] : [], cardIds: isFolder ? store.cards.filter(card => folders.has(card.deckId)).map(card => card.id) : [sheet.id!], archivedAt: isFolder ? undefined : store.cards.find(card => card.id === sheet.id)?.archivedAt });
        setSheet({ kind: isFolder ? 'archived-folder-delete' : 'archived-card-delete', id: sheet.id });
      }}><Trash2 size={18}/>彻底删除</button></div>;
    }
    if (sheet.kind === 'archived-folder-delete' || sheet.kind === 'archived-card-delete') {
      const isFolder = sheet.kind === 'archived-folder-delete';
      const deck = store.decks.find(candidate => candidate.id === sheet.id);
      const card = store.cards.find(candidate => candidate.id === sheet.id);
      const folders = subtreeIds(store.decks, sheet.id || null);
      const cards = store.cards.filter(candidate => folders.has(candidate.deckId));
      const name = isFolder ? deck?.name : card?.front || card?.bookTitle || '阅读摘录';
      const expectedDecks = new Set(deleteTarget?.deckIds);
      const expectedCards = new Set(deleteTarget?.cardIds);
      const valid = !!deleteTarget && deleteTarget.id === sheet.id && (isFolder ? !!deck && archiveFolders.ids.has(deck.id) && folders.size === expectedDecks.size && [...folders].every(id => expectedDecks.has(id)) && cards.length === expectedCards.size && cards.every(candidate => candidate.archivedAt && expectedCards.has(candidate.id)) : !!card?.archivedAt && card.archivedAt === deleteTarget.archivedAt);
      return <form onSubmit={event => {
        event.preventDefault();
        if (deleteConfirmation !== '删除' || !valid || busy) return;
        const target = sheet.id!;
        void run(async () => {
          await commitMemory(snapshot => isFolder ? deleteArchivedMemoryFolder(snapshot, target, deleteTarget!) : deleteArchivedMemoryCard(snapshot, target, deleteTarget!.archivedAt!));
          setArchiveUndo(operation => operation?.ids.some(id => expectedCards.has(id)) ? null : operation);
          setDeleteConfirmation('');
          setDeleteTarget(null);
          setSheet(null);
          if (isFolder && archivedFolder && folders.has(archivedFolder)) setArchivedFolder(null);
        });
      }}><p>彻底删除“{name}”{isFolder ? `及其 ${Math.max(0, expectedDecks.size - 1)} 个子卡组、${expectedCards.size} 张归档卡片` : '这张归档卡片'}？</p><p className="m-note">卡片原文及关联复习记录将删除，不能撤销。已有备份不受影响，可先从设置导出备份。</p>{!valid && <p role="alert" className="m-error">归档状态或范围已变化，请取消后重新确认。</p>}<label>输入“删除”以确认<input aria-label="删除确认" autoComplete="off" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)}/></label><button className="m-secondary" type="button" disabled={busy} onClick={() => { setDeleteConfirmation(''); setDeleteTarget(null); setSheet({ kind: isFolder ? 'archived-folder-menu' : 'archived-card-menu', id: sheet.id }); }}>取消</button><button className="m-primary" type="submit" disabled={busy || !valid || deleteConfirmation !== '删除'}>确认彻底删除</button></form>;
    }
    if (sheet.kind === 'folder-archive') {
      const deck = store.decks.find(candidate => candidate.id === sheet.id);
      const folders = subtreeIds(store.decks, sheet.id || null);
      const count = available.filter(card => folders.has(card.deckId)).length;
      return <form onSubmit={event => { event.preventDefault(); void run(() => archiveFolder(sheet.id!)); }}><p>将归档“{deck?.name}”及所有子卡组中的 {count} 张在学卡片，不再安排复习。</p><p className="m-note">完全归档的卡组将移到“已归档”，层级、原文、复习进度和历史记录仍保留。已归档卡片不受影响；操作后 3 秒内可撤销，之后可整组或逐张移出归档。</p><button className="m-secondary" type="button" disabled={busy} onClick={() => setSheet({ kind: 'folder', id: sheet.id })}>取消，返回管理</button><button className="m-primary" type="submit" disabled={busy || !deck || !count}>确认归档 {count} 张卡片</button></form>;
    }
    if (sheet.kind === 'folder-restore') {
      const deck = store.decks.find(candidate => candidate.id === sheet.id);
      const folders = subtreeIds(store.decks, sheet.id || null);
      const count = store.cards.filter(card => card.archivedAt && folders.has(card.deckId)).length;
      return <form onSubmit={event => { event.preventDefault(); void run(() => restoreArchiveFolder(sheet.id!)); }}><p>将“{deck?.name}”及所有子卡组中的 {count} 张归档卡片移出归档，重新进入在学卡片库。</p><p className="m-note">保留卡组层级、原文、已有排期和复习历史，不重新评分。包括之前已归档的卡片；其他卡组不受影响。</p><button className="m-secondary" type="button" disabled={busy} onClick={closeSheet}>取消</button><button className="m-primary" type="submit" disabled={busy || !deck || !count}>确认移出归档 {count} 张卡片</button></form>;
    }
    if (sheet.kind === 'review-plan') return <MemoryReviewPlanEditor onClose={() => setSheet(null)} onBusy={setBusy}/>;
    if (sheet.kind === 'help') return <div className="m-about"><p>#、##、### 是卡组；卡片块里的标题仍是正文。编号和时间可以先留空，导入后保存带编号文件继续维护。</p><pre>{template}</pre><button onClick={() => downloadMemoryText(template, 'Recall-知识卡片示例.md')}>下载完整示例</button></div>;
    if (sheet.kind === 'path') return <div className="m-sheet-list"><button onClick={() => openFolder(null)}>全部卡组</button>{folderPath(store.decks, folder).map(deck => <button key={deck.id} onClick={() => openFolder(deck.id)}>{deck.name}<ChevronRight size={16}/></button>)}</div>;
    if (sheet.kind === 'filter') return <form onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); setContentType(String(values.get('content'))); setStatus(String(values.get('status'))); setSort(String(values.get('sort'))); setSheet(null); }}><label>内容<select name="content" aria-label="内容" defaultValue={contentType}>{['全部', '仅卡组', '仅卡片'].map(value => <option key={value}>{value}</option>)}</select></label><label>复习状态<select name="status" aria-label="复习状态" defaultValue={status}>{['全部', '待复习', '待学习', '学习中', '长期复习'].map(value => <option key={value}>{value}</option>)}</select></label><label>排序<select name="sort" aria-label="排序" defaultValue={sort}><option value="new">{route === 'archived' ? '归档时间' : '导入时间'}：新到旧</option><option value="old">{route === 'archived' ? '归档时间' : '导入时间'}：旧到新</option><option value="name">名称</option><option value="updated">最近修改</option></select></label><p className="m-note">{route === 'archived' ? '默认整组显示，单独归档的卡片单列。仅卡片会展开全部归档卡片；卡组按其中最近一次归档时间排序。复习状态按保留的进度和排期筛选，不会安排归档卡片复习。' : '搜索和复习状态覆盖当前卡组及下级内容。待学习是从未评分的新卡，长期复习不代表永久掌握。'}</p><button className="m-primary" type="submit">应用</button></form>;
    if (sheet.kind === 'font') return <label>正文字号<select aria-label="正文字号" value={font} onChange={event => { const value = Number(event.target.value); setFont(value); localStorage.setItem('recall.reading.font', String(value)); }}>{[16, 18, 20, 22].map(value => <option key={value}>{value}</option>)}</select></label>;
    if (sheet.kind === 'archived-detail') {
      const card = store.cards.find(candidate => candidate.id === sheet.id);
      return card ? <div className="m-about"><h3>{card.front || card.bookTitle || '阅读摘录'}</h3><RichCard content={card.back} allowHtml={false}/><button className="m-primary" disabled={busy} onClick={() => restoreArchive(card.id)}>移出归档</button></div> : <p>卡片已不存在。</p>;
    }
    if (sheet.kind === 'add') return <div className="m-sheet-list"><button onClick={() => setSheet({ kind: 'folder' })}><Library size={20}/>新建{folder ? '子' : ''}卡组</button><button onClick={() => setSheet({ kind: 'card' })}><Plus size={20}/>添加卡片</button><button onClick={() => navigate('import')}><Upload size={20}/>导入到这里</button>{folder && <button onClick={() => setSheet({ kind: 'folder', id: folder })}><MoreHorizontal size={20}/>管理当前卡组</button>}</div>;
    if (sheet.kind === 'card-menu' || sheet.kind === 'reader-options') return <div className="m-sheet-list">{sheet.id && <><button onClick={() => setSheet({ kind: 'card', id: sheet.id })}><BookOpen size={20}/>编辑卡片</button><button onClick={() => setSheet({ kind: 'move', id: sheet.id })}><Library size={20}/>移动到其他卡组</button><button disabled={busy} onClick={() => void run(() => archiveCard(sheet.id!))}><Archive size={20}/>归档，不再复习</button></>}{sheet.kind === 'reader-options' && <><button onClick={() => setSheet({ kind: 'review-plan' })}><BarChart3 size={20}/>复习计划 · {reviewPlan.mode === 'smart' ? '智能' : '固定'}</button><button onClick={() => setSheet({ kind: 'font' })}>阅读字号</button><button onClick={() => navigate('archived')}><Archive size={20}/>查看已归档</button></>}</div>;
    return editorSheet();
  }

  const sheetTitle = sheet ? { folder: sheet.id ? '管理卡组' : '新建卡组', 'folder-archive': '归档整个卡组', 'folder-restore': '移出归档整个卡组', 'archived-folder-menu': '管理归档卡组', 'archived-card-menu': '管理归档卡片', 'archived-folder-delete': '彻底删除卡组', 'archived-card-delete': '彻底删除卡片', card: sheet.id ? '编辑卡片' : '添加卡片', move: '移动卡片', help: 'Markdown 格式', filter: '筛选与排序', path: '当前卡组路径', add: '添加', 'card-menu': '管理卡片', 'reader-options': '卡片与复习', 'review-plan': '复习计划', 'review-deck': '这次温习哪一组？', font: '阅读字号', 'archived-detail': '已归档 · 查看原文', backup: '数据备份与恢复', cloud: '云同步管理' }[sheet.kind] : '';
  const navEntries: [Route, string, typeof Home][] = [['home', '今日复习', Home], ['folders', '卡组目录', Library], ['cards', '全部卡片', Layers], ['archived', '已归档', Archive], ['stats', '统计', BarChart3], ['import', '导入', Upload]];
  const topBack = ['read', 'weread', 'compat', 'advanced'].includes(route) || route === 'folders' && !!folder || route === 'archived' && !!archivedFolder;
  const hasTopAction = !['stats', 'archived', 'import'].includes(route) || route === 'archived' && !!archivedFolder;
  const topLabel = route === 'read' ? reviewMode ? '退出复习' : '退出浏览' : topBack ? '返回' : route === 'settings' ? '更多设置' : '添加';
  const today = store.reviewLogs.filter(log => new Date(log.reviewDate).toDateString() === new Date().toDateString()).length;
  const recentIds = [...new Set(store.reviewLogs.slice().reverse().map(log => log.cardId))];
  const recent = recentIds.length ? recentIds.map(id => available.find(card => card.id === id)).filter((card): card is Card => !!card).slice(0, 2) : available.slice(0, 2);
  const archiveNotice = archiveUndo ? <div className="m-archive-undo" role="status" aria-live="polite" inert={drawer || !!sheet}><span>{archiveUndo.ids.length > 1 ? `已归档 ${archiveUndo.ids.length} 张，不再安排复习` : '已归档，不再安排复习'}</span><button disabled={busy} onClick={() => void undoArchive()} aria-label={`撤销归档，剩余 ${remaining} 秒`}>撤销 <b aria-hidden="true">{remaining}</b><span aria-hidden="true">s</span></button></div> : null;

  return <div className="memory-app" data-drawer={drawer} onClickCapture={event => {
    (event.target as HTMLElement).closest<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }} onKeyDown={event => {
    if (event.key === 'Escape') { if (sheet) closeSheet(); else if (drawer) { setDrawer(false); brand.current?.focus(); } else if (route === 'read') exitReading(); }
    if (event.key === 'Tab' && (sheet || drawer)) {
      const root = sheet ? sheetRef.current : drawerRef.current;
      const controls = Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary') || []).filter(control => control.getClientRects().length > 0);
      if (!sheet && drawer && brand.current) controls.push(brand.current);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <MemoryStatusEdge/>
    <aside id="memory-drawer" className="memory-drawer" ref={drawerRef} data-visible={drawer || drawerVisible} aria-label="项目菜单" aria-hidden={mobile && !drawer}>
      <div className="m-drawer-brand"><strong>Recall</strong><span>记忆卡片</span><small>{titles[navRoute as keyof typeof titles]}</small></div>
      <nav>{navEntries.map(([target, label, Icon]) => <button key={target} aria-current={navRoute === target ? 'page' : undefined} onClick={() => { if (target === 'folders') setFolder(null); navigate(target); }}><span className="m-nav-icon"><Icon size={20}/></span>{target === 'folders' ? label : t(`memory.routes.${target}`, label)}</button>)}</nav>
      <div className="m-drawer-footer"><MemoryCloudDrawerStatus onManage={() => { if (mobile) { setDrawer(false); brand.current?.focus(); } setSheet({ kind: 'cloud' }); }}/><button onClick={() => navigate('settings')}>设置与数据</button><PWAAppVersion disabled={busy}/></div>
    </aside>
    <div ref={shellRef} className={`memory-shell ${drawer ? 'is-open' : ''} ${route === 'read' ? 'is-reading' : ''} ${archiveUndo ? 'has-archive-undo' : ''}`}>
      <header className="memory-bar"><button ref={brand} className="m-brand" aria-expanded={drawer} aria-controls="memory-drawer" aria-label={drawer ? '关闭项目菜单' : '打开项目菜单'} disabled={busy} onClick={() => { if (sheet) { closeSheet(); return; } setDrawer(value => !value); }}><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M23 15h32c27 0 34 32 12 45l19 25H64L43 57v28H23z" fill="white"/><path d="M54 23c-1 10-4 14-14 15 10 1 13 5 14 15 1-10 4-14 14-15-10-1-13-5-14-15" fill="currentColor"/></svg></button>{route === 'folders' && folder ? <button className="m-context" onClick={() => setSheet({ kind: 'path' })} aria-label={`查看卡组路径：${shellTitle}`}>{shellTitle}</button> : <div className="m-context">{shellTitle}</div>}{hasTopAction ? <button className="m-top-action" aria-label={topLabel} disabled={busy || drawer || !!sheet} onClick={topAction}>{route === 'read' ? '退出' : topBack ? <ArrowLeft size={20}/> : route === 'settings' ? <MoreHorizontal size={20}/> : <Plus size={22}/>}</button> : <span className="m-top-action-placeholder" aria-hidden="true"/>}</header>
      <div ref={contentRef} className="memory-content" data-route={route}>
        <header className="m-desktop-header"><span>{shellTitle}</span>{hasTopAction && <button className="m-secondary" disabled={busy} onClick={topAction}>{topLabel}</button>}</header>
        <main className="m-main" tabIndex={-1}>
          {organizationError && <p className="m-error" role="alert">{organizationError}</p>}
          <PWAUpdatePrompt className="m-pwa-update" hidden={route === 'read'}/>
          <Suspense fallback={loadingView}>
          {error && !sheet && <p role="alert" className="m-error">{error}</p>}
          {route === 'home' && <><header className="m-intro"><p>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p><h1>今天，温习一点。</h1></header><div className="m-home-columns"><div>
            <section className="m-hero" aria-label="开始按卡组复习" data-illustration={illustration}>
              <p className="m-hero-label"><i/>从一个卡组开始</p>
              <h2 className="m-hero-title">慢慢读，<br/>认真记。</h2>
              <p className="m-hero-copy">每次一小轮，按自己的节奏来。</p>
              <div className="m-card-stack" aria-hidden="true"><div/><div/><div><span>{['Q.', 'Aa', '*'][illustration]}</span><i/><i/><i/><small>{['从回忆开始', '让知识生长', '温习一点点'][illustration]}</small></div></div>
              <button className="m-primary" disabled={busy} onClick={() => { setDrawer(false); setSheet({ kind: 'review-deck' }); }}>开始复习<ChevronRight size={18}/></button>
            </section>
            <div className="m-study-backlog"><small>{lastStudyDeck ? `上次选择 · ${lastStudyDeck.name}` : studyDeck === '__all' ? '上次选择 · 混合全部卡组' : '选好卡组，再开始这一轮'}</small><button className="m-text" onClick={() => setSheet({ kind: 'review-plan' })}>复习计划</button></div>
            <div className="m-home-summary"><div><b>{today}</b><small>今日总复习次数</small></div><div><b>{progress.review}</b><small>全部长期复习</small></div><div><b>{available.length}</b><small>全部在学卡片</small></div></div><div className="m-home-shortcuts"><button onClick={() => navigate('import')}><Upload size={18}/>导入知识</button><button onClick={() => navigate('stats')}><BarChart3 size={18}/>查看统计</button></div></div><div><div className="m-section-head"><h2>我的卡组</h2><button className="m-text" onClick={() => openFolder(null)}>查看全部<ChevronRight size={15}/></button></div><MemoryFolderRows home list={arranged(activeDecks.filter(deck => !deck.parentId))} decks={activeDecks} cards={store.cards} onOpen={openFolder} onManage={id => setSheet({ kind: 'folder', id })}/>{!activeDecks.length && <div className="m-empty"><p>从一个卡组，收好你的知识。</p><button className="m-secondary" onClick={() => setSheet({ kind: 'folder' })}>新建卡组</button></div>}{recent.length > 0 && <section className="m-recent"><div className="m-section-head"><h2>{recentIds.length ? '最近温习' : '随手读一张'}</h2><small>自由浏览</small></div>{recent.map((card, position) => <button key={card.id} onClick={() => read(arranged(available.filter(candidate => candidate.deckId === card.deckId)), false, card.id)}><span className="m-recent-index">{String(position + 1).padStart(2, '0')}</span><span><small>{folderPath(store.decks, card.deckId).map(deck => deck.name).join(' / ')}</small><strong>{card.front || card.bookTitle || '阅读摘录'}</strong></span><ChevronRight size={17}/></button>)}</section>}</div></div></>}
          {['folders', 'cards', 'archived'].includes(route) && <>
            {route === 'archived' && <p className="m-note">不再安排复习。整组归档保留层级，单独归档的卡片单列；随时可以整组或逐张移出归档。</p>}
            {route === 'archived' && archivedFolder && <><button className="m-parent-link" onClick={() => openArchivedFolder(null)}><ArrowLeft size={16}/>全部归档</button><button className="m-secondary" disabled={busy || !libraryPool.length} onClick={() => setSheet({ kind: 'folder-restore', id: archivedFolder })}><Undo2 size={18}/>整组移出归档</button></>}
            {route === 'folders' && folder && <button className="m-parent-link" onClick={() => openFolder(currentFolder?.parentId || null)}><ArrowLeft size={16}/>{currentFolder?.parentId ? store.decks.find(deck => deck.id === currentFolder.parentId)?.name : '全部卡组'}</button>}
            <div className="m-library-toolbar"><input type="search" aria-label="搜索当前范围及下级内容" placeholder={route === 'archived' ? '搜索已归档卡组、问题或划线' : '搜索卡组、问题或划线'} value={query} onChange={event => setQuery(event.target.value)}/><button className={`m-filter ${hasFilters ? 'is-active' : ''}`} aria-label="筛选与排序" onClick={() => setSheet({ kind: 'filter' })}><SlidersHorizontal size={20}/>{hasFilters && <i/>}</button></div>
            {route !== 'archived' && <p className="m-library-description">{route === 'folders' ? '按层级整理卡组；全部卡片可跨卡组搜索和浏览。' : '跨卡组搜索和浏览；卡组目录用于层级管理。'}</p>}
            {hasFilters && <div className="m-filter-chips">{contentType !== '全部' && <span>{contentType}</span>}{status !== '全部' && <span>{status}</span>}{sort !== 'new' && <span>{sort === 'name' ? '名称排序' : sort === 'updated' ? '最近修改' : route === 'archived' ? '归档最早' : '导入最早'}</span>}<button onClick={() => { setContentType('全部'); setStatus('全部'); setSort('new'); }}>清除筛选</button></div>}
            {route === 'archived' && children.length > 0 && <p className="m-result-heading">{children.length} 个归档卡组</p>}
            <MemoryFolderRows list={children} decks={route === 'archived' ? store.decks : activeDecks} cards={store.cards} archived={route === 'archived'} archiveTimes={archiveFolders.times} onOpen={route === 'archived' ? openArchivedFolder : openFolder} onManage={id => setSheet({ kind: route === 'archived' ? 'archived-folder-menu' : 'folder', id })}/>
            {visibleCards.length > 0 && <><p className="m-result-heading">{expanded ? `${visibleCards.length} 张匹配卡片` : '本层卡片'}</p>{visibleCards.map(itemCard)}</>}
            {!children.length && !visibleCards.length && <div className="m-empty"><Archive size={34}/><strong>{keyword || hasFilters ? '没有匹配的内容' : route === 'archived' ? '还没有归档卡片' : '从第一张卡片开始'}</strong><p>{route === 'archived' ? '阅读时点击归档，就可以暂时放下这张卡。' : keyword || hasFilters ? '试试其他关键词，或清除筛选。' : '新建卡组，或导入你想温习的知识。'}</p>{route !== 'archived' && !keyword && !hasFilters && <button className="m-secondary" onClick={() => setSheet({ kind: 'add' })}>添加知识</button>}</div>}
          </>}
          {route === 'stats' && <MemoryStats/>}
          {route === 'settings' && <div className="m-settings"><p className="m-note">按照你的节奏，安排下一次温习。</p><div><span><strong>复习计划</strong><small>{reviewPlan.mode === 'smart' ? `智能调度 · ${Math.round(store.settings.desiredRetention * 100)}% 目标记忆率` : '固定间隔 · 自定义四档'}</small></span><button className="m-secondary" onClick={() => setSheet({ kind: 'review-plan' })}>配置</button></div><div><strong>阅读字号</strong><button className="m-secondary" onClick={() => setSheet({ kind: 'font' })}>{font}</button></div><div><span><strong>数据备份与恢复</strong><small>推荐完整带图备份；仅文字备份不包含图片文件。</small></span><button className="m-secondary" onClick={() => setSheet({ kind: 'backup' })}>备份</button></div><div><span><strong>已归档</strong><small>保留原文和进度，不安排复习。</small></span><button className="m-secondary" onClick={() => navigate('archived')}>查看 {store.cards.length - available.length}</button></div><div><strong>导入知识</strong><button className="m-secondary" onClick={() => navigate('import')}>打开</button></div><div><span><strong>云同步与设备</strong><small>授权与设备管理，同步状态显示在抽屉下方。</small></span><button className="m-secondary" onClick={() => setSheet({ kind: 'cloud' })}>管理云同步</button></div><div><span><strong>更多设置</strong><small>主题和其他选项。</small></span><button className="m-secondary" onClick={() => navigate('advanced')}>查看</button></div></div>}
          {route === 'advanced' && <><details className="m-panel"><summary>显示诊断（高级）</summary><MemoryDisplayDiagnostics/></details><Settings/></>}
          {route === 'compat' && (compatReceipt ? <MemoryImportCompletion source={compatReceipt.source} added={compatReceipt.added} updated={compatReceipt.updated} skipped={compatReceipt.skipped} locations={memoryImportLocations(store.decks, compatReceipt.deckIds)} onView={() => { const destination = compatReceipt.deckIds.length === 1 ? compatReceipt.deckIds[0] : null; setCompatReceipt(null); openFolder(store.decks.some(deck => deck.id === destination) ? destination : null); }} onContinue={() => setCompatReceipt(null)}/> : <ImportHub onClose={() => navigate('import')} onComplete={setCompatReceipt}/>)}
          {route === 'weread' && (localWereadFile ? <MemoryWereadLocalImport initialFile={localWereadFile} onClose={() => { setLocalWereadFile(null); navigate('import'); }} onComplete={deckIds => { setLocalWereadFile(null); setDrawer(false); setSheet(null); setFolder(deckIds.find(id => useRecallStore.getState().decks.some(deck => deck.id === id)) || null); setRoute('folders'); setQuery(''); setSort('old'); setError(''); }} onBusy={setBusy}/> : <MemoryWereadImport onClose={() => navigate('import')} onComplete={deckIds => { setDrawer(false); setSheet(null); setFolder(deckIds.find(id => useRecallStore.getState().decks.some(deck => deck.id === id)) || null); setRoute('folders'); setQuery(''); setSort('old'); setError(''); }} onBusy={setBusy} onBackChange={registerWereadBack}/>)}
          {route === 'import' && <>
            {(plan || receipt) && <div className="m-step">选择 / 校验 / 完成</div>}
            {plan && <MediaPackagePreview assets={importAssets}/>}
            {!plan && !receipt && <MemoryImportChoices busy={busy} onFile={file => { void loadFile(file); }} onWeread={() => { setLocalWereadFile(null); navigate('weread'); }} onManual={() => setSheet({ kind: 'card' })} onOther={() => navigate('compat')} onHelp={() => setSheet({ kind: 'help' })} onExample={() => downloadMemoryText(template, 'Recall-知识卡片示例.md')}/>}
            {plan && <>
              <section className="m-panel"><strong>{filename}</strong><MemoryFolderSelector decks={store.decks} value={plan.parentId || ''} label="导入到" rootLabel="根目录" disabled={busy} onChange={id => { try { setPlan(planMemoryImport(useRecallStore.getState(), plan.document, id || null)); setSelected(new Set()); setError(''); } catch (failure) { setError(String(failure)); } }}/></section>
              <p className="m-counts">新增 {plan.rows.filter(row => row.status === 'new').length} · 重复 {plan.rows.filter(row => row.status === 'duplicate').length} · 变更 {plan.rows.filter(row => row.status === 'change').length}</p>
              {plan.rows.map(row => <article key={row.entry.id} className="m-panel"><div className="m-spread"><strong>{row.status === 'new' ? '新增' : row.status === 'duplicate' ? '跳过重复' : '检测到变化'}</strong>{row.status === 'change' && <label className="m-check"><input type="checkbox" checked={selected.has(row.entry.id)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(row.entry.id); else next.delete(row.entry.id); return next; })}/>更新</label>}</div><small>{row.entry.path.join(' / ')}</small><h3>{row.entry.front || row.entry.bookTitle || '阅读摘录'}</h3><p>{row.entry.back.slice(0, 240)}</p>{row.existing && row.status === 'change' && <details><summary>查看差异</summary><p>当前：</p><pre>{row.existing.front + '\n' + row.existing.back}</pre><p>文件：</p><pre>{row.entry.front + '\n' + row.entry.back}</pre><small>保留首次导入时间、归档状态与复习进度。</small></details>}</article>)}
              <div className="m-import-footer"><button className="m-secondary" disabled={busy} onClick={() => { setPlan(null); setImportAssets([]); }}>取消</button><button className="m-primary" disabled={busy} onClick={() => void confirmImport()}>确认导入</button></div>
              {error.includes('重新校验') && <button className="m-secondary" onClick={() => { setPlan(planMemoryImport(useRecallStore.getState(), plan.document, plan.parentId)); setSelected(new Set()); setError(''); }}>重新校验</button>}
            </>}
            {receipt && <MemoryImportCompletion source={`${importFormat} · ${filename}`} added={receipt.added} updated={receipt.updated} skipped={receipt.skipped} locations={memoryImportLocations(store.decks, receipt.deckIds)} onView={() => { const destination = receipt.deckIds.length === 1 ? receipt.deckIds[0] : receipt.parentId; setReceipt(null); openFolder(store.decks.some(deck => deck.id === destination) ? destination : null); }} onContinue={() => setReceipt(null)}><button className="m-secondary" type="button" onClick={() => downloadMemoryText(receipt.text, filename.replace(/\.(?:md|json)$/i, '').replace(/\.recall-media$/i, '').replace(/-带编号$/, '') + '-带编号.md')}>保存带编号的 Markdown</button></MemoryImportCompletion>}
          </>}
          {route === 'read' && <MemoryReader key={readerKey} ids={queue} scopeIds={reviewScope} onQueueChange={setQueue} onContinue={completedIds => read(store.cards.filter(card => reviewScope.includes(card.id) && !completedIds.includes(card.id)), true)} initialIndex={index} reviewMode={reviewMode} onEdit={id => setSheet({ kind: 'card', id })} onOptions={id => setSheet({ kind: 'reader-options', id })} onArchive={archiveCard} restoreRequest={restoreRequest} archiveNotice={archiveNotice} fontSize={font} onIndex={setIndex} onExit={exitReading} onBusy={setBusy}/>}
          </Suspense>
        </main>
        {['folders', 'cards'].includes(route) && libraryPool.length > 0 && <div className="m-library-dock"><button className="m-secondary" disabled={!matching.length || busy} onClick={() => read(matching, false)}>浏览<span>{matching.length}</span></button><button className="m-primary" disabled={!libraryRecommendation.cards.length || busy} onClick={() => read(matching, true)}>本轮温习<span>{libraryRecommendation.cards.length}</span><ChevronRight size={16}/></button></div>}
      </div>
      {route !== 'read' && archiveNotice}
      {drawer && <button className="m-dismiss" aria-label="关闭菜单" onPointerDown={drawerDown} onPointerMove={drawerMove} onPointerUp={drawerUp} onPointerCancel={() => { drawerGesture.current = null; if (shellRef.current) { shellRef.current.style.transform = ''; shellRef.current.style.transition = ''; } }} onClick={() => { if (!dragged.current) { setDrawer(false); brand.current?.focus(); } }}/>}</div>
    {sheet && <div className="m-sheet-wrap" onClick={event => { if (event.target === event.currentTarget) closeSheet(); }}><section className={`m-sheet ${sheet.kind === 'review-deck' ? 'm-picker-sheet' : ''}`} ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="memory-sheet-title"><div className="m-grab"/><header><h2 id="memory-sheet-title">{sheetTitle}</h2><button className="m-sheet-close" disabled={busy} aria-label="关闭面板" onClick={closeSheet}><X size={18} strokeWidth={1.5}/></button></header>{error && <p role="alert" className="m-error">{error}</p>}<Suspense fallback={loadingView}>{renderSheet()}</Suspense></section></div>}
  </div>;
}
