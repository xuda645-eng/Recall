import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { organizeWereadFolders } from '@/lib/memory-weread-folders';
import { buildExportPayload } from '@/services/import-export';
import { commitMemory } from '@/services/memory-actions';

export const WEREAD_ORGANIZATION_KEY = 'recall.weread.folders-organized.v1';
export const WEREAD_ORGANIZATION_BACKUP_KEY = 'recall.snapshot.pre-weread-folders.v1';
let pending: Promise<void> | null = null;

export function organizeExistingWereadFolders(): Promise<void> {
  if (pending) return pending;
  if (localStorage.getItem(WEREAD_ORGANIZATION_KEY) === '1') return Promise.resolve();
  const current = dataState(useRecallStore.getState());
  if (!current.cards.some(card => card.sourceRef?.provider === 'weread') && !current.decks.some(deck => deck.id.startsWith('weread-book:') && deck.description === deck.id)) return Promise.resolve();
  pending = commitMemory(snapshot => {
    const organized = organizeWereadFolders(snapshot);
    if (organized !== snapshot && !localStorage.getItem(WEREAD_ORGANIZATION_BACKUP_KEY)) localStorage.setItem(WEREAD_ORGANIZATION_BACKUP_KEY, JSON.stringify(buildExportPayload(snapshot)));
    return organized;
  }).then(() => { localStorage.setItem(WEREAD_ORGANIZATION_KEY, '1'); }).finally(() => { pending = null; });
  return pending;
}
