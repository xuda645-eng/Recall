import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { folderPath } from '@/lib/memory-folders';
import { memoryStudyDecks } from '@/services/memory-study-decks';
import { selectMemoryStudyCards } from '@/services/memory-study';
import type { Card, Deck, MemoryStudyPreferences, RecallSettings } from '@/types';

interface Props {
  decks: Deck[];
  cards: Card[];
  preferences: MemoryStudyPreferences;
  settings: RecallSettings;
  lastDeck: string;
  onStart: (cards: Card[], review: boolean, deckId: string) => void;
}

export function MemoryReviewDeckPicker({ decks, cards, preferences, settings, lastDeck, onStart }: Props): JSX.Element {
  const [now, setNow] = useState(() => new Date());
  const data = memoryStudyDecks(decks, cards, now);
  const [choice, setChoice] = useState(() => lastDeck === '__all' || data.decks.some(item => item.deck.id === lastDeck)
    ? lastDeck : data.decks.find(item => item.total && !data.decks.some(child => child.deck.parentId === item.deck.id))?.deck.id || data.decks.find(item => item.total)?.deck.id || data.decks[0]?.deck.id || '');
  const [expanded, setExpanded] = useState(() => new Set(choice && choice !== '__all' ? folderPath(decks, choice).slice(0, -1).map(deck => deck.id) : []));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const selected = choice === '__all' ? data.all : data.decks.find(item => item.deck.id === choice);
  const round = selectMemoryStudyCards(selected?.cards || [], preferences, now, settings);
  const action = !selected?.total ? '暂无卡片' : round.cards.length ? round.oldCount ? '确认开始复习' : '开始学习新卡' : '自由浏览（不评分）';

  function confirm(): void {
    const latest = memoryStudyDecks(decks, cards);
    const scope = choice === '__all' ? latest.all : latest.decks.find(item => item.deck.id === choice);
    if (!scope?.total) return;
    const next = selectMemoryStudyCards(scope.cards, preferences, new Date(), settings);
    if (round.cards.length && !next.cards.length) { setNow(new Date()); return; }
    onStart(scope.cards, round.cards.length > 0, choice);
  }
  function rows(parentId: string | null, depth = 0): JSX.Element[] {
    return data.decks.filter(item => (item.deck.parentId || null) === parentId).map(item => {
      const hasChildren = data.decks.some(child => child.deck.parentId === item.deck.id);
      const open = expanded.has(item.deck.id);
      return <div className="m-picker-branch" key={item.deck.id}>
        <div className="m-picker-row">
          <button className="m-picker-choice" aria-pressed={choice === item.deck.id} aria-label={`选择卡组：${item.deck.name}`} onClick={() => setChoice(item.deck.id)}>
            <span className="m-picker-name"><Folder size={19}/><strong>{item.deck.name}</strong>{lastDeck === item.deck.id && <small>上次选择</small>}<span className="m-picker-check">{choice === item.deck.id && <Check size={18}/>}</span></span>
            <span className="m-picker-metrics"><span><b>{item.due}</b>待复习</span><span><b>{item.fresh}</b>新卡</span><span><b>{item.total}</b>未归档</span></span>
          </button>
          {hasChildren && <button className="m-picker-expand" aria-label={`${open ? '收起' : '展开'}${item.deck.name}的子卡组`} aria-expanded={open} aria-controls={`review-children-${item.deck.id}`} onClick={() => setExpanded(previous => {
            const next = new Set(previous); if (open) next.delete(item.deck.id); else next.add(item.deck.id); return next;
          })}>{open ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>}
        </div>
        {hasChildren && <div id={`review-children-${item.deck.id}`} className="m-picker-children" style={{ marginLeft: depth < 3 ? 12 : 0 }} hidden={!open}>{rows(item.deck.id, depth + 1)}</div>}
      </div>;
    });
  }
  return <div className="m-review-picker">
    <div className="m-picker-heading"><small>未归档 · {data.decks.length} 个卡组</small><small>一次专注一组</small></div>
    <div className="m-picker-body">
      <div className="m-picker-list" role="group" aria-label="未归档卡组">{rows(null)}</div>
      {!data.decks.length && <p className="m-note">还没有未归档卡组。关闭面板后，新建卡组或导入知识即可开始。</p>}
      {data.decks.length > 0 && <details className="m-picker-other" open={choice === '__all' ? true : undefined}><summary>其他复习方式</summary><button className="m-picker-choice" aria-pressed={choice === '__all'} onClick={() => setChoice('__all')}><span className="m-picker-name"><strong>混合全部卡组</strong></span><span className="m-picker-metrics"><span><b>{data.all.due}</b>待复习</span><span><b>{data.all.fresh}</b>新卡</span><span><b>{data.all.total}</b>未归档</span></span></button></details>}
      <details className="m-picker-definition"><summary>这些数字怎么算？</summary><p>待复习只计现在已到期的已学卡，新卡单列。上级卡组包含下级，已归档内容不计入；混合总数不重复累计父子卡组。每轮按复习计划分配，不要求一次清空。</p></details>
    </div>
    <footer className="m-picker-footer">
      <button className="m-primary" disabled={!selected?.total} onClick={confirm}>{action}{round.cards.length > 0 && `（${round.cards.length}）`}</button>
    </footer>
  </div>;
}
