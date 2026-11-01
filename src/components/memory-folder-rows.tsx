import { BookOpen, ChevronRight, MoreHorizontal, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { folderPath, subtreeIds } from '@/lib/memory-folders';
import { isCardDue } from '@/lib/stats';
import { isMemoryNewCard } from '@/services/memory-study';
import type { Card, Deck } from '@/types';

interface Props {
  list: Deck[];
  decks: Deck[];
  cards: Card[];
  onOpen: (id: string) => void;
  onManage: (id: string) => void;
  home?: boolean;
  archived?: boolean;
  archiveTimes?: Map<string, string>;
}

export function MemoryFolderRows({ list, decks, cards, onOpen, onManage, home, archived, archiveTimes }: Props): JSX.Element {
  const { t } = useTranslation();
  return <>{list.map(deck => {
    const ids = subtreeIds(decks, deck.id);
    const available = cards.filter(card => !!card.archivedAt === !!archived && ids.has(card.deckId));
    const due = available.filter(card => !isMemoryNewCard(card) && isCardDue(card)).length;
    const fresh = available.filter(card => isMemoryNewCard(card)).length;
    const children = decks.filter(child => child.parentId === deck.id);
    return <article className="m-folder" key={deck.id} data-folder-id={deck.id}>
      <button className="m-folder-open" onClick={() => onOpen(deck.id)}>
        <span className="m-book-icon"><BookOpen size={21}/></span>
        <span className="m-folder-copy"><strong>{deck.name}</strong>{archived && <small>{folderPath(decks, deck.id).map(item => item.name).join(' / ')}</small>}<small>{children.length ? t('memory.folderChildren', '{{count}} 个子卡组 · ', { count: children.length }) : ''}{t('memory.cardCount', '{{count}} 张卡片', { count: available.length })}</small>{archived && !available.length && <small>随上级卡组恢复</small>}</span>
        <span className={`m-folder-due ${!archived && (due || fresh) ? '' : 'is-clear'}`}>{archived ? <><small>已归档</small>{Number.isFinite(Date.parse(archiveTimes?.get(deck.id) || '')) && <small>{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(archiveTimes!.get(deck.id)!))}</small>}</> : due ? <><b>{due}</b><small>{t('memory.due', '待复习')}</small>{fresh > 0 && <small>{fresh} 待学习</small>}</> : fresh ? <><b>{fresh}</b><small>待学习</small></> : <small>{t('memory.noDue', '暂无到期')}</small>}</span>
      </button>
      <button className="m-folder-more" disabled={archived && !available.length} aria-label={archived ? `移出归档卡组：${deck.name}` : t('memory.manageFolder', '管理{{name}}', { name: deck.name })} onClick={() => onManage(deck.id)}>{archived ? <Undo2 size={20}/> : <MoreHorizontal size={20}/>}</button>
      {home && children.length > 0 && <div className="m-subfolder-region"><div className="m-subfolders" role="region" aria-label={`${deck.name}的子卡组`} tabIndex={0}>{children.map(child => <button key={child.id} onClick={() => onOpen(child.id)}><span className="m-subfolder-label">{child.name}</span><ChevronRight size={14}/></button>)}</div>{children.length > 1 && <small className="m-subfolder-hint">子卡组可左右滑动</small>}</div>}
    </article>;
  })}</>;
}
