import { create } from 'zustand';
import { useRecallStore } from '@/stores/recall-store';
import { localMedia, saveMedia, downloadMedia } from '@/services/media-storage';
import { mediaRefs } from '../../shared/media';

export const useMediaSync = create<{ pending: number; running: boolean; error: string; completed: number }>(() => ({ pending: 0, running: false, error: '', completed: 0 }));
let active: Promise<void> | undefined;
let spaceId: string | null = null;
let requestedSpace: string | null = null;
export function pauseMediaSync(): void { spaceId = null; requestedSpace = null; }
export function synchronizeMedia(space: string): Promise<void> {
  spaceId = space;
  requestedSpace = space;
  if (active) return active;
  const run = async (currentSpace: string) => {
    const refs = mediaRefs(useRecallStore.getState().cards.flatMap(card => [card.front, card.back, card.hint]));
    useMediaSync.setState({ pending: refs.length, running: true, error: '', completed: 0 });
    let offset = 0;
    let failed = false;
    const worker = async () => {
      while (offset < refs.length && spaceId === currentSpace) {
        const id = refs[offset++];
        try {
          let asset = await localMedia(id);
          if (!asset) {
            asset = await downloadMedia(id);
            if (spaceId === currentSpace) await saveMedia([asset], currentSpace);
          } else if (asset.uploadedSpace !== currentSpace) {
            const options = { credentials: 'same-origin' as const, cache: 'no-store' as const, signal: AbortSignal.timeout(20000) };
            let response = await fetch(`/api/media/${id}`, { ...options, method: 'HEAD' });
            if (response.status === 404 && spaceId === currentSpace) response = await fetch(`/api/media/${id}`, { ...options, signal: AbortSignal.timeout(20000), method: 'PUT', headers: { 'Content-Type': asset.mime }, body: asset.bytes });
            if (response.status === 401) { pauseMediaSync(); throw new Error('图片同步需要重新授权，本机图片仍保留'); }
            if (!response.ok) throw new Error(`图片同步未完成 (${response.status})，本机图片仍保留`);
            if (spaceId === currentSpace) await saveMedia([asset], currentSpace);
          }
          useMediaSync.setState(state => ({ pending: Math.max(0, state.pending - 1), completed: state.completed + 1 }));
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'status' in error && error.status === 401) pauseMediaSync();
          failed = true;
          useMediaSync.setState({ error: error instanceof Error ? error.message : '图片同步失败，文字同步不受影响' });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    useMediaSync.setState({ running: false, ...(failed ? {} : { error: '' }) });
  };
  active = (async () => {
    try {
      while (requestedSpace !== null) {
        const nextSpace = requestedSpace;
        requestedSpace = null;
        await run(nextSpace);
      }
    } finally { active = undefined; }
  })();
  return active;
}
