import { useRef, useState } from 'react';
import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { localPreviewSnapshot } from '@/lib/local-preview';
import { parseMediaPackage } from '@/services/media-package';
import { commitMemory } from '@/services/memory-actions';
import { saveMedia } from '@/services/media-storage';

type ParsedBackup = Awaited<ReturnType<typeof parseMediaPackage>>;

export function MemoryLocalPreview(): JSX.Element {
  const empty = useRecallStore(state => !state.cards.length && !state.decks.length && !state.reviewLogs.length && !state.studySessions.length);
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const backup = parsed?.package.backup;

  async function select(file: File): Promise<void> {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setParsed(null);
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error('完整备份不能超过 16 MB');
      const result = await parseMediaPackage(await file.text());
      if (!result.package.backup) throw new Error('请选择完整带图备份，不是制卡导入包');
      localPreviewSnapshot(dataState(useRecallStore.getState()), result.package.backup);
      setParsed(result);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '备份解析失败'); }
    finally { locked.current = false; setBusy(false); }
  }

  async function restore(): Promise<void> {
    if (locked.current || !backup || !parsed) return;
    locked.current = true; setBusy(true); setError('');
    try {
      localPreviewSnapshot(dataState(useRecallStore.getState()), backup);
      await saveMedia(parsed.assets);
      await commitMemory(current => localPreviewSnapshot(current, backup));
      setParsed(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '副本载入失败'); }
    finally { locked.current = false; setBusy(false); }
  }

  return <section className="m-local-preview" aria-label="本地验收副本">
    <h2>本地验收副本</h2>
    <p>只写当前本地浏览器，云同步已关闭。保留卡片、图片和进度，不去重、不发布；微信读书书籍首次整理到同名根卡组下。</p>
    {empty ? <><button className="m-secondary" disabled={busy} onClick={() => input.current?.click()}>选择完整备份副本</button><input ref={input} type="file" accept=".json" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void select(file); }}/>
      {backup && <div className="m-local-preview-confirm"><p>{backup.decks.length} 个卡组 · {backup.cards.length} 张卡片 · {backup.reviewLogs.length} 条复习记录 · {parsed!.assets.length} 张图片</p><button className="m-primary" disabled={busy} onClick={() => void restore()}>确认载入本地副本</button><button className="m-text" disabled={busy} onClick={() => setParsed(null)}>取消</button></div>}</> : <p role="status">已载入内容。此入口不覆盖已有卡库；后续评分和编辑仅影响本地副本。</p>}
    {busy && <p role="status">正在校验和载入，请稍候。</p>}{error && <p className="m-error" role="alert">{error}</p>}
  </section>;
}
