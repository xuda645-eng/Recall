import { useRef, useState } from 'react';
import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { mediaBackup, parseMediaPackage } from '@/services/media-package';
import { saveMedia } from '@/services/media-storage';
import { commitMemory, downloadMemoryText } from '@/services/memory-actions';
import { mergeImportPayload } from '@/services/import-export';
import { validateImportSnapshot } from '@/services/repository';
import { buildExportPayload } from '@/services/import-export';

export function MediaBackupControls({ onBusy, onRestorePlain }: { onBusy?: (busy: boolean) => void; onRestorePlain?: () => void } = {}): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); onBusy?.(true); setError('');
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : '带图备份操作失败'); }
    finally { setBusy(false); onBusy?.(false); }
  }
  return <section className="m-panel"><h3>完整备份（推荐）</h3><p className="m-note">包含图片文件、卡片与复习进度。缺图时不会生成不完整备份。最多 16 MB / 包、100 张图片，超出时可在卡组管理中分批备份。</p><button type="button" className="m-primary" disabled={busy} onClick={() => void run(async () => downloadMemoryText(await mediaBackup(dataState(useRecallStore.getState())), `Recall-带图备份-${Date.now()}.recall-media.json`, 'application/json'))}>备份（含来源图片）</button><p className="m-note">仅文字备份不包含图片文件，只有文字、图片引用与进度；需要图片时请选择上面的完整备份。</p><button type="button" className="m-secondary" disabled={busy} onClick={() => downloadMemoryText(JSON.stringify(buildExportPayload(dataState(useRecallStore.getState())), null, 2), `Recall-仅文字-${Date.now()}.recall`, 'application/json')}>仅文字与进度备份</button><button type="button" className="m-secondary" disabled={busy} onClick={() => input.current?.click()}>恢复带图备份（合并）</button><input ref={input} type="file" accept=".json" hidden onChange={event => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    void run(async () => {
      if (file.size > 16 * 1024 * 1024) throw new Error('备份文件不能超过 16 MB');
      const parsed = await parseMediaPackage(await file.text());
      const backup = parsed.package.backup;
      if (!backup) throw new Error('这是制卡导入包，请使用导入入口');
      if (!window.confirm(`合并恢复 ${backup.cards.length} 张卡片及 ${parsed.assets.length} 张图片？已有卡片和本机设置保留，不清空数据。`)) return;
      validateImportSnapshot(mergeImportPayload(dataState(useRecallStore.getState()), backup));
      await saveMedia(parsed.assets);
      await commitMemory(current => { const next = mergeImportPayload(current, backup); validateImportSnapshot(next); return next; });
    });
  }}/>{onRestorePlain && <button type="button" className="m-secondary" disabled={busy} onClick={onRestorePlain}>恢复普通文字备份</button>}{busy && <p role="status">正在处理带图备份</p>}{error && <p className="m-error" role="alert">{error}</p>}</section>;
}
