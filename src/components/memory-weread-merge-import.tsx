import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Pause } from 'lucide-react';
import { useRecallStore } from '@/stores/recall-store';
import { applyWereadImport, planWereadImport, type WereadDraft } from '@/lib/memory-weread';
import { buildMergedWereadDraft } from '@/lib/memory-weread-merge';
import { acceptMergeBatch, createMergeSession, nextMergeBatch, remainingMergeAttempts, validateMergeSession, type WereadMergeSession } from '@/lib/weread-merge-session';
import { discardMergeSession, loadMergeSession, saveMergeSession } from '@/services/weread-merge-storage';
import { checkWereadBudget, withWereadJobLock } from '@/services/weread-job-storage';
import { generateWereadMerge } from '@/services/weread-online';
import { commitMemory } from '@/services/memory-actions';
import { MERGE_MAX_MEMBERS } from '../../shared/weread-merge';

interface Props {
  drafts: WereadDraft[];
  onClose: () => void;
  onComplete: (ids: string[]) => void;
  onBusy?: (busy: boolean) => void;
}

export function MemoryWereadMergeImport({ drafts, onClose, onComplete, onBusy }: Props): JSX.Element {
  const [session, setSession] = useState<WereadMergeSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const current = useRef<WereadMergeSession | null>(null);
  const storedRevision = useRef<number | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const callback = useRef(onBusy);
  useEffect(() => { callback.current = onBusy; }, [onBusy]);
  const message = (value: unknown) => value instanceof Error ? value.message : '操作失败，请重试';
  const publish = (value: WereadMergeSession) => { current.current = value; if (mounted.current) setSession(value); };
  const report = (value: boolean) => { running.current = value; if (mounted.current) setBusy(value); callback.current?.(value); };

  useEffect(() => {
    mounted.current = true;
    void loadMergeSession().then(saved => {
      if (!mounted.current) return;
      if (saved) { storedRevision.current = saved.revision; publish(saved); }
      else publish(createMergeSession(useRecallStore.getState(), drafts));
    }).catch(value => { if (mounted.current) { setError(message(value)); setBlocked(true); } })
      .finally(() => { if (mounted.current) setInitializing(false); });
    return () => { mounted.current = false; controller.current?.abort(); callback.current?.(false); };
  }, [drafts]);

  async function persist(value: WereadMergeSession): Promise<WereadMergeSession> {
    const next = { ...value, revision: (current.current?.revision ?? value.revision) + 1 };
    publish(next);
    await saveMergeSession(next);
    storedRevision.current = next.revision;
    return next;
  }

  async function checkDisk(): Promise<void> {
    const disk = await loadMergeSession();
    if (disk ? disk.createdAt !== current.current?.createdAt || disk.revision !== storedRevision.current : storedRevision.current !== null) {
      throw new Error('另一个页面的合并草稿已变化或取消，请刷新后继续');
    }
  }

  async function generate(): Promise<void> {
    if (running.current || !current.current) return;
    report(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    let next = current.current;
    try {
      await withWereadJobLock(async () => {
        await checkDisk();
        await validateMergeSession(next);
        if (planWereadImport(useRecallStore.getState(), next.sources).rows.some(row => row.status !== 'new')) throw new Error('来源划线已在其他页面导入，请重新选择；旧卡不会重组');
        await checkWereadBudget(remainingMergeAttempts(next), abort.signal);
        next = await persist({ ...next, status: 'generating', error: '' });
        while (next.cursor < next.sources.length && !abort.signal.aborted && mounted.current) {
          const batch = nextMergeBatch(next)!;
          const groups = await generateWereadMerge(batch, abort.signal);
          if (abort.signal.aborted || !mounted.current) break;
          next = await acceptMergeBatch(useRecallStore.getState(), next, groups);
          next = await persist(next);
        }
        if (abort.signal.aborted || !mounted.current) next = await persist({ ...next, status: 'paused' });
      });
    } catch (value) {
      const stopped = abort.signal.aborted;
      const failed = { ...(current.current || next), status: 'paused' as const, error: stopped ? '' : message(value) };
      publish(failed);
      if (!stopped && mounted.current) setError(message(value));
    } finally { report(false); }
  }

  async function edit(work: (value: WereadMergeSession) => Promise<WereadMergeSession>): Promise<void> {
    if (running.current || !current.current) return;
    report(true); setError('');
    try {
      await withWereadJobLock(async () => {
        await checkDisk();
        const next = await work(current.current!);
        await validateMergeSession(next);
        await persist(next);
      });
    } catch (value) { setError(message(value)); }
    finally { report(false); }
  }

  async function split(index: number): Promise<void> {
    await edit(async value => {
      const card = value.cards[index];
      const members = card.members || [card.highlight];
      const replacements = await Promise.all(members.map(async member => ({ ...await buildMergedWereadDraft(useRecallStore.getState(), card.book, [member], '请回忆这条划线的具体内容。'), kind: 'task' as const })));
      return { ...value, cards: [...value.cards.slice(0, index), ...replacements, ...value.cards.slice(index + 1)] };
    });
  }

  async function combine(index: number): Promise<void> {
    await edit(async value => {
      const first = value.cards[index], second = value.cards[index + 1];
      if (!second || first.book.bookId !== second.book.bookId) throw new Error('只能合并同一本书的相邻卡片');
      const members = [...(first.members || [first.highlight]), ...(second.members || [second.highlight])];
      if (members.length > MERGE_MAX_MEMBERS) throw new Error('一张卡片最多合并 4 条划线，请保留独立考点');
      const combined = { ...await buildMergedWereadDraft(useRecallStore.getState(), first.book, members, '请回忆这组划线共同说明的具体内容。'), kind: 'task' as const };
      return { ...value, cards: [...value.cards.slice(0, index), combined, ...value.cards.slice(index + 2)] };
    });
  }

  async function importCards(): Promise<void> {
    if (running.current || !current.current) return;
    report(true); setError('');
    try {
      await withWereadJobLock(async () => {
        await checkDisk();
        let next = await validateMergeSession(current.current);
        if (next.cursor !== next.sources.length) throw new Error('分组尚未完成，未导入卡片');
        next = await persist({ ...next, status: 'importing', error: '' });
        let receipt: WereadMergeSession['receipt'];
        await commitMemory(snapshot => {
          const plan = planWereadImport(snapshot, next.cards);
          if (plan.rows.some(row => row.status === 'change')) throw new Error('已有卡片内容发生变化，请保留原卡并重新检查，未覆盖');
          const result = applyWereadImport(snapshot, plan, new Set());
          receipt = { added: result.added, updated: result.updated, skipped: result.skipped, deckIds: result.deckIds };
          return result.snapshot;
        });
        await persist({ ...next, status: 'done', receipt });
      });
    } catch (value) {
      if (current.current) publish({ ...current.current, status: 'review', error: message(value) });
      setError(`${message(value)}；导入错误可能发生在卡片保存后，重试会按来源编号检查，不重复生成`);
    } finally { report(false); }
  }

  async function cancel(): Promise<void> {
    if (running.current) return;
    if (!window.confirm('取消这份本机合并草稿？已导入卡片不会删除。')) return;
    report(true);
    try {
      await withWereadJobLock(async () => { if (!blocked) await checkDisk(); await discardMergeSession(); });
      onClose();
    } catch (value) { setError(message(value)); }
    finally { report(false); }
  }

  const complete = session && session.cursor === session.sources.length;
  return <section className="wr-workspace wr-merge" aria-label="智能合并划线" aria-busy={busy}>
    <header className="wr-heading"><span className="wr-eyebrow">CONNECTED HIGHLIGHTS</span><h1>{session?.status === 'done' ? '合并卡片已收好' : complete ? '检查你的知识单元' : '把相关划线放在一起'}</h1><p>模型只分组和提问；原文与顺序由程序保留。</p></header>
    {(error || session?.error) && <p className="m-error" role="alert">{error || session?.error}</p>}
    {initializing ? <p role="status">正在检查本机合并草稿…</p> : session ? <>
      <div className="wr-merge-summary"><strong>{session.sources.length} 条新划线 → {session.cards.length} 张{complete ? '卡片' : '已整理卡片'}</strong><p>{session.cursor} / {session.sources.length} 条已整理，尚未确认时不写入卡片库。</p></div>
      <p className="wr-consent">{session.demo ? '这是原创合成示例与预置分组，不是你的微信读书数据，也不是现场 AI 输出；没有模型调用。确认导入只保存到当前设备。' : '仅合并同章、原文有序的相邻划线；一张最多 4 条。已有卡片不重组。每批最多 12 条、6000 字，批次边界保留末组上下文。点击生成后发送所选原文到已配置的 AI，每日额度仍为全空间 300 次。'}</p>
      {!complete && <details className="wr-merge-sources"><summary>查看按原文排序的划线</summary>{session.sources.map((source, index) => <article key={source.id}><small>H{String(index + 1).padStart(3, '0')} · {source.book.title} · {source.highlight.chapterTitle}</small><p>{source.highlight.markText}</p></article>)}</details>}
      <div className="wr-merge-cards">{session.cards.map((card, index) => {
        const members = card.members || [card.highlight];
        const following = session.cards[index + 1];
        const canCombine = following && following.book.bookId === card.book.bookId && following.highlight.chapterUid === card.highlight.chapterUid
          && members.length + (following.members?.length || 1) <= MERGE_MAX_MEMBERS;
        return <article className="m-panel wr-merge-card" key={`${card.id}:${card.kind}`}><small>卡片 {index + 1} · {members.length} 条划线 · {card.book.title} · {card.highlight.chapterTitle}</small>
          <label>共同问题<textarea key={card.question} aria-label={`合并卡片 ${index + 1} 的问题`} defaultValue={card.question} maxLength={160} rows={3} disabled={busy || session.status === 'done'} onBlur={event => {
            const question = event.target.value;
            if (question !== card.question) void edit(async value => ({ ...value, cards: value.cards.map(item => item.id === card.id ? { ...item, question, kind: 'qa' } : item) }));
          }}/></label>
          {card.kind === 'task' && <p className="m-note">手动拆分或合并后的回忆任务，请检查或改成具体问题。</p>}
          <div className="wr-merge-originals" aria-label="划线原文，按原文顺序">{members.map(member => <div key={member.bookmarkId}><small>H{String(session.sources.findIndex(source => source.book.bookId === card.book.bookId && source.highlight.bookmarkId === member.bookmarkId) + 1).padStart(3, '0')}</small><p>{member.markText}</p></div>)}</div>
          {complete && session.status !== 'done' && <div className="wr-merge-actions"><button className="m-secondary" disabled={busy || members.length < 2} onClick={() => void split(index)}>拆分为单条</button>{canCombine && <button className="m-secondary" disabled={busy} onClick={() => void combine(index)}>与下一张合并</button>}</div>}
        </article>;
      })}</div>
      <div className="wr-dock">{session.status === 'done' ? <button className="m-primary" onClick={() => onComplete(session.receipt?.deckIds || [])}><Check size={17}/>查看卡组</button> : busy ? <button className="m-secondary" disabled={session.status === 'importing'} onClick={() => controller.current?.abort()}><Pause size={17}/>暂停，保留进度</button> : complete ? <button className="m-primary" onClick={() => void importCards()}>确认导入 {session.cards.length} 张卡片<ArrowRight size={17}/></button> : <button className="m-primary" onClick={() => void generate()}>{session.cursor ? '继续智能分组' : '生成分组与问题'}<ArrowRight size={17}/></button>}
        {!busy && session.status !== 'done' && <button className="m-text" onClick={() => void cancel()}>取消合并草稿</button>}
      </div>
    </> : <button className="m-secondary" onClick={() => void cancel()}>取消无法恢复的合并草稿</button>}
  </section>;
}
