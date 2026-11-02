import { useRef, useState } from 'react';
import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { mediaBackup, parseMediaPackage } from '@/services/media-package';
import { saveMedia } from '@/services/media-storage';
import { commitMemory, downloadMemoryText } from '@/services/memory-actions';
import { mergeImportPayload } from '@/services/import-export';
import { validateImportSnapshot } from '@/services/repository';

export function MediaBackupControls(): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : '带图备份操作失败'); }
    finally { setBusy(false); }
  }
  return <section className="m-panel"><h3>来源图片与备份</h3><p className="m-note">普通 .recall 备份只有文字和图片引用。带图备份包含图片、卡片与进度；缺图时不生成不完整备份。最多 16 MB / 包、100 张图片，超出时可在卡组管理中分批备份。</p><button type="button" className="m-secondary" disabled={busy} onClick={() => void run(async () => downloadMemoryText(await mediaBackup(dataState(useRecallStore.getState())), `Recall-带图备份-${Date.now()}.recall-media.json`, 'application/json'))}>备份（含来源图片）</button><button type="button" className="m-secondary" disabled={busy} onClick={() => input.current?.click()}>恢复带图备份（合并）</button><input ref={input} type="file" accept=".json" hidden onChange={event => {
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
  }}/>{busy && <p role="status">正在处理带图备份</p>}{error && <p className="m-error" role="alert">{error}</p>}</section>;
}
