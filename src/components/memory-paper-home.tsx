import { ArrowRight, BarChart3, ChevronRight, Upload } from 'lucide-react';
import { MemoryPaperArt } from '@/components/memory-paper-art';
import { MemoryFolderRows } from '@/components/memory-folder-rows';
import { folderPath } from '@/lib/memory-folders';
import { isCardDue } from '@/lib/stats';
import { isMemoryNewCard } from '@/services/memory-study';
import type { Card, Deck } from '@/types';

interface Props {
  decks: Deck[];
  allDecks: Deck[];
  roots: Deck[];
  cards: Card[];
  recent: Card[];
  recentReviewed: boolean;
  today: number;
  longTerm: number;
  variant: number;
  onFolder: (id: string | null) => void;
  onManage: (id: string) => void;
  onCreate: () => void;
  onRead: (card: Card) => void;
  onImport: () => void;
  onStats: () => void;
}

export function MemoryPaperHome({ decks, allDecks, roots, cards, recent, recentReviewed, today, longTerm, variant, onFolder, onManage, onCreate, onRead, onImport, onStats }: Props): JSX.Element {
  const available = cards.filter(card => !card.archivedAt);
  const due = available.filter(card => !isMemoryNewCard(card) && isCardDue(card)).length;
  const fresh = available.filter(isMemoryNewCard).length;
  return <>
    <header className="m-intro m-paper-intro"><p>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p><h1>今天，温习一点。</h1><span>让读过的好内容，真正成为自己的。</span></header>
    <div className="m-home-columns m-paper-home">
      <div className="m-paper-home-lead">
        <div className="m-paper-review-card">
        <section className="m-hero m-paper-hero" aria-label="开始按卡组复习" data-illustration={variant}><h2 className="m-hero-title">慢慢读，认真记。</h2><MemoryPaperArt variant={variant}/><p className="m-hero-copy">每次一小轮，按自己的节奏来。</p></section>
        <div className="m-paper-today" aria-label="当前学习任务"><div><strong>{due}</strong><span>张旧卡<br/>等待复习</span></div><div><strong>{fresh}</strong><span>张新卡<br/>可以开始学习</span></div></div>
        </div>
        <div className="m-home-summary"><div><b>{today}</b><small>今日总复习次数</small></div><div><b>{longTerm}</b><small>全部长期复习</small></div><div><b>{available.length}</b><small>全部在学卡片</small></div></div>
        <div className="m-home-shortcuts"><button onClick={onImport}><Upload size={18} strokeWidth={1.5}/>导入知识<ArrowRight size={16}/></button><button onClick={onStats}><BarChart3 size={18} strokeWidth={1.5}/>查看统计<ArrowRight size={16}/></button></div>
      </div>
      <div className="m-paper-home-library">
        <div className="m-section-head"><h2>我的卡组</h2><button className="m-text" onClick={() => onFolder(null)}>查看全部<ChevronRight size={15}/></button></div>
        <MemoryFolderRows home list={roots} decks={decks} cards={cards} onOpen={onFolder} onManage={onManage}/>
        {!decks.length && <div className="m-empty"><p>从一个卡组，收好你的知识。</p><button className="m-secondary" onClick={onCreate}>新建卡组</button></div>}
        {recent.length > 0 && <section className="m-recent"><div className="m-section-head"><h2>{recentReviewed ? '最近温习' : '随手读一张'}</h2><small>自由浏览</small></div>{recent.map((card, position) => <button key={card.id} onClick={() => onRead(card)}><span className="m-recent-index">{String(position + 1).padStart(2, '0')}</span><span><small>{folderPath(allDecks, card.deckId).map(deck => deck.name).join(' / ')}</small><strong>{card.front || card.bookTitle || '阅读摘录'}</strong></span><ChevronRight size={17}/></button>)}</section>}
      </div>
    </div>
  </>;
}
import { useLayoutEffect, useRef } from 'react';

export function MemoryPaperHomeDock({ caption, busy, onStart, onPlan }: { caption: string; busy: boolean; onStart: () => void; onPlan: () => void }): JSX.Element {
  const dock = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = dock.current;
    const content = element?.closest<HTMLElement>('.memory-content');
    if (!element || !content) return;
    const measure = () => content.style.setProperty('--home-dock-height', `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); content.style.removeProperty('--home-dock-height'); };
  }, []);
  return <div className="m-paper-home-dock" ref={dock}><div><button className="m-primary" disabled={busy} onClick={onStart}>开始复习<ChevronRight size={18}/></button><div className="m-study-backlog"><small title={caption}>{caption}</small><button className="m-text" onClick={onPlan}>复习计划</button></div></div></div>;
}
