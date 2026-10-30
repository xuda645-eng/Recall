import { BookOpen, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { subtreeIds } from '@/lib/memory-folders';
import { isCardDue } from '@/lib/stats';
import type { Card, Deck } from '@/types';

interface Props {
  list: Deck[];
  decks: Deck[];
  cards: Card[];
  onOpen: (id: string) => void;
  onManage: (id: string) => void;
  home?: boolean;
}

export function MemoryFolderRows({ list, decks, cards, onOpen, onManage, home }: Props): JSX.Element {
  const { t } = useTranslation();
  return <>{list.map(deck => {
    const ids = subtreeIds(decks, deck.id);
    const available = cards.filter(card => !card.archivedAt && ids.has(card.deckId));
    const due = available.filter(card => isCardDue(card)).length;
    const children = decks.filter(child => child.parentId === deck.id);
    return <article className="m-folder" key={deck.id}>
      <button className="m-folder-open" onClick={() => onOpen(deck.id)}>
        <span className="m-book-icon"><BookOpen size={21}/></span>
        <span className="m-folder-copy"><strong>{deck.name}</strong><small>{children.length ? t('memory.folderChildren', '{{count}} 个子卡组 · ', { count: children.length }) : ''}{t('memory.cardCount', '{{count}} 张卡片', { count: available.length })}</small></span>
        <span className={`m-folder-due ${due ? '' : 'is-clear'}`}>{due ? <><b>{due}</b><small>{t('memory.due', '待复习')}</small></> : <small>{t('memory.noDue', '暂无到期')}</small>}</span>
      </button>
      <button className="m-folder-more" aria-label={t('memory.manageFolder', '管理{{name}}', { name: deck.name })} onClick={() => onManage(deck.id)}><MoreHorizontal size={20}/></button>
      {home && children.length > 0 && <div className="m-subfolders">{children.map(child => <button key={child.id} onClick={() => onOpen(child.id)}>{child.name}<ChevronRight size={14}/></button>)}</div>}
    </article>;
  })}</>;
}
