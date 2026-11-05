import { validateImportSnapshot } from '@/services/repository';
import type { RecallExportPayload, RecallStateSnapshot } from '@/types';

export function isLocalPreview(): boolean {
  return import.meta.env.VITE_RECALL_LOCAL_PREVIEW === '1'
    && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export function localPreviewSnapshot(current: RecallStateSnapshot, incoming: RecallExportPayload): RecallStateSnapshot {
  if (!isLocalPreview()) throw new Error('完整副本只可载入本地隔离预览');
  if (current.cards.length || current.decks.length || current.reviewLogs.length || current.studySessions.length) throw new Error('请使用新的空白本地预览，不覆盖已有内容');
  validateImportSnapshot(incoming);
  return {
    decks: incoming.decks,
    cards: incoming.cards,
    reviewLogs: incoming.reviewLogs,
    studySessions: incoming.studySessions,
    settings: { ...incoming.settings, onboardingComplete: true, syncCode: null, syncEnabled: false, syncRelayUrl: '', syncFolder: null, syncLastAt: null, syncAutoInterval: 0, backupFolder: null, backupSchedule: 'never', lastBackupAt: null, notificationsEnabled: false },
  };
}
