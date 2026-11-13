import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { folderPath } from '@/lib/memory-folders';
import type { Deck } from '@/types';
import './memory-folder-selector.css';

export interface MemoryFolderSelectorProps {
  decks: Deck[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  rootLabel: string;
  missingLabel?: string;
  disabled?: boolean;
}

function timestamp(value: string | undefined): number | undefined {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : undefined;
}

export function MemoryFolderSelector({ decks, value, onChange, label, rootLabel, missingLabel, disabled = false }: MemoryFolderSelectorProps): JSX.Element {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef(new Map<string, HTMLLIElement>());
  const path = useMemo(() => {
    try { return folderPath(decks, value || null); }
    catch { return []; }
  }, [decks, value]);
  const children = useMemo(() => {
    const result = new Map<string, Deck[]>();
    const preferred = new Set(path.map(deck => deck.id));
    const sorted = [...decks].sort((first, second) =>
      Number(preferred.has(second.id)) - Number(preferred.has(first.id))
      || (timestamp(second.importedAt) ?? timestamp(second.createdAt) ?? 0) - (timestamp(first.importedAt) ?? timestamp(first.createdAt) ?? 0)
      || (timestamp(second.createdAt) ?? 0) - (timestamp(first.createdAt) ?? 0)
      || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
    for (const deck of sorted) {
      const parent = deck.parentId || '';
      const siblings = result.get(parent) || [];
      siblings.push(deck);
      result.set(parent, siblings);
    }
    return result;
  }, [decks, path]);
  const selectedId = path.length ? value : '';
  const missingSelection = !!value && !path.length && !!missingLabel;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set(path.slice(0, -1).map(deck => deck.id)));
  const [focusedId, setFocusedId] = useState(selectedId);

  useEffect(() => {
    setExpanded(previous => new Set([...previous, ...path.slice(0, -1).map(deck => deck.id)]));
  }, [path]);

  const visibleIds = [''];
  function collect(parent: string): void {
    for (const deck of children.get(parent) || []) {
      visibleIds.push(deck.id);
      if (expanded.has(deck.id)) collect(deck.id);
    }
  }
  collect('');
  const tabStop = visibleIds.includes(focusedId) ? focusedId : visibleIds.includes(selectedId) ? selectedId : '';
  const panelOpen = open && !disabled;

  function focusItem(deckId: string): void {
    setFocusedId(deckId);
    items.current.get(deckId)?.focus();
  }
  function close(): void {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(deckId: string): void {
    if (disabled) return;
    onChange(deckId);
    close();
  }
  function toggle(deckId: string): void {
    if (disabled) return;
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
    focusItem(deckId);
  }
  function navigate(event: KeyboardEvent<HTMLLIElement>, deckId: string): void {
    if ((event.target as HTMLElement).closest('[role="treeitem"]') !== event.currentTarget || disabled) return;
    const index = visibleIds.indexOf(deckId);
    const descendants = children.get(deckId) || [];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault(); focusItem(visibleIds[Math.min(index + 1, visibleIds.length - 1)]); break;
      case 'ArrowUp':
        event.preventDefault(); focusItem(visibleIds[Math.max(index - 1, 0)]); break;
      case 'Home':
        event.preventDefault(); focusItem(''); break;
      case 'End':
        event.preventDefault(); focusItem(visibleIds[visibleIds.length - 1]); break;
      case 'ArrowRight':
        event.preventDefault();
        if (deckId && descendants.length) {
          if (expanded.has(deckId)) focusItem(descendants[0].id);
          else toggle(deckId);
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (deckId && descendants.length && expanded.has(deckId)) toggle(deckId);
        else focusItem(decks.find(deck => deck.id === deckId)?.parentId || '');
        break;
      case 'Enter':
      case ' ':
        if (event.target === event.currentTarget) { event.preventDefault(); choose(deckId); }
        break;
    }
  }
  function branch(deckId: string, name: string, level: number, position: number, size: number): JSX.Element {
    const descendants = deckId ? children.get(deckId) || [] : [];
    const hasChildren = descendants.length > 0;
    const branchOpen = expanded.has(deckId);
    const nameId = `${id}-name-${deckId}`;
    const groupId = `${id}-children-${deckId}`;
    return <li key={deckId} role="treeitem" aria-labelledby={nameId} aria-selected={!missingSelection && selectedId === deckId}
      aria-expanded={hasChildren ? branchOpen : undefined} aria-level={level} aria-posinset={position} aria-setsize={size}
      tabIndex={tabStop === deckId ? 0 : -1}
      ref={element => { if (element) items.current.set(deckId, element); else items.current.delete(deckId); }}
      onFocus={event => { if ((event.target as HTMLElement).closest('[role="treeitem"]') === event.currentTarget) setFocusedId(deckId); }}
      onKeyDown={event => navigate(event, deckId)}>
      <div className="m-folder-selector-row" style={{ '--folder-indent': `${Math.min(level - 1, 4) * 10}px` } as CSSProperties}>
        <button type="button" className="m-folder-selector-select" tabIndex={-1} disabled={disabled}
          aria-label={`选择目录：${name}`} aria-pressed={!missingSelection && selectedId === deckId} onClick={() => choose(deckId)}>
          <Folder size={18} aria-hidden="true"/><span id={nameId}>{name}</span>
          {!missingSelection && selectedId === deckId && <Check size={18} aria-hidden="true"/>}
        </button>
        {hasChildren && <button type="button" className="m-folder-selector-expand" tabIndex={-1} disabled={disabled}
          aria-label={`${branchOpen ? '收起' : '展开'}${name}的子目录`} aria-expanded={branchOpen} aria-controls={groupId}
          onClick={() => toggle(deckId)}>{branchOpen ? <ChevronDown size={18} aria-hidden="true"/> : <ChevronRight size={18} aria-hidden="true"/>}</button>}
      </div>
      {hasChildren && <ul role="group" id={groupId} hidden={!branchOpen}>
        {branchOpen && descendants.map((deck, index) => branch(deck.id, deck.name, level + 1, index + 1, descendants.length))}
      </ul>}
    </li>;
  }
  const roots = children.get('') || [];
  return <div className="m-folder-selector" onKeyDown={event => {
    if (event.key === 'Escape' && panelOpen) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <span id={`${id}-label`} className="m-folder-selector-label">{label}</span>
    <button type="button" ref={trigger} className="m-folder-selector-trigger" disabled={disabled}
      aria-labelledby={`${id}-label ${id}-value`} aria-expanded={panelOpen} aria-controls={`${id}-panel`}
      onClick={() => {
        setExpanded(previous => new Set([...previous, ...path.slice(0, -1).map(deck => deck.id)]));
        setFocusedId(selectedId);
        setOpen(previous => !previous);
      }}>
      <span id={`${id}-value`}>{path.length ? path.map(deck => deck.name).join(' / ') : missingSelection ? missingLabel : rootLabel}</span>
      {panelOpen ? <ChevronDown size={18} aria-hidden="true"/> : <ChevronRight size={18} aria-hidden="true"/>}
    </button>
    <div id={`${id}-panel`} className="m-folder-selector-panel" hidden={!panelOpen}>
      {panelOpen && <ul role="tree" aria-labelledby={`${id}-label`}>
        {branch('', rootLabel, 1, 1, roots.length + 1)}
        {roots.map((deck, index) => branch(deck.id, deck.name, 1, index + 2, roots.length + 1))}
      </ul>}
    </div>
  </div>;
}
