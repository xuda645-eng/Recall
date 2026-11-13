import { useRef, useState } from 'react';
import { Cloud, Loader2 } from 'lucide-react';
import { APP_BUILD } from '@/lib/app-build';
import { enablePersonalSync, pausePersonalSync, resolvePersonalConflicts, synchronizePersonal, usePersonalSync } from '@/services/personal-sync';

export function MiaodaPersonalDrawer({ disabled, onManage }: { disabled: boolean; onManage: () => void }): JSX.Element {
  const status = usePersonalSync();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const labels = { local: '尚未连接', syncing: '正在同步', synced: '已同步', conflict: '有冲突待处理', offline: '离线', error: '同步未完成' };
  async function refresh(): Promise<void> {
    if (disabled || status.running || lock.current) return;
    if (!status.enabled || status.phase === 'conflict') { onManage(); return; }
    lock.current = true;
    setRefreshing(true);
    setError('');
    try {
      await synchronizePersonal();
      const result = usePersonalSync.getState();
      if (!result.enabled || result.phase !== 'synced') throw new Error(result.error || '同步尚未完成，本机数据保留，请重试。');
      window.location.reload();
    } catch (failure) {
      lock.current = false;
      setRefreshing(false);
      setError(failure instanceof Error ? failure.message : '同步未完成，本机数据保留，请重试。');
    }
  }
  const label = !status.enabled ? '连接飞书同步' : status.phase === 'conflict' ? '处理同步冲突' : '同步并刷新';
  return <><section className="m-drawer-sync" aria-label="飞书同步状态">
    <div className="m-drawer-sync-status"><span className="m-drawer-sync-icon" aria-hidden="true"><Cloud size={22}/></span><span role="status">飞书同步 · {status.enabled ? labels[status.phase] : '尚未连接'}</span></div>
    <small>最近同步：{status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '尚无记录'}</small>
  </section><div className="m-app-version is-compact"><small aria-label="当前版本">V<span data-app-version={APP_BUILD.version}>{APP_BUILD.version}</span></small>
    <button className="m-version-refresh" type="button" aria-label={refreshing || status.running ? '正在同步' : label} title={label} disabled={disabled || refreshing || status.running} onClick={() => void refresh()}>
      {refreshing || status.running ? <Loader2 size={18} className="animate-spin" aria-hidden="true"/> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19.5 8A8 8 0 1 0 20 14M19.5 3.5V8H15"/></svg>}
    </button></div>{(error || status.error) && <small className="m-version-message" role="status">{error || status.error}</small>}</>;
}

export function MiaodaPersonalSync(): JSX.Element | null {
  const status = usePersonalSync();
  const [confirm, setConfirm] = useState(false);
  if (!status.available) return null;
  return <section className="m-local-preview" aria-label="飞书个人同步">
    <h2>飞书个人同步</h2>
    <p>仅供你自己使用，同一飞书账号的手机和电脑共享卡片、来源图片与进度。图片加密保存；离线安装和自动更新仍未接入。同步不是备份。</p>
    {!status.enabled && !confirm && <button className="m-primary" onClick={() => setConfirm(true)}>连接个人同步</button>}
    {confirm && <><p>确认后会将当前卡片、来源图片和进度同步到此妙搭应用，并在本机保留同步前的文字备份。请先导出完整带图备份；缺图或上传失败会暂停同步，不会丢弃图片继续上传。</p>
      <button className="m-primary" onClick={() => { setConfirm(false); void enablePersonalSync(); }}>确认连接并同步</button>
      <button className="m-secondary" onClick={() => setConfirm(false)}>取消</button></>}
    {status.enabled && <><button className="m-primary" disabled={status.running} onClick={() => void synchronizePersonal()}>{status.running ? '正在同步' : '立即同步'}</button>
      <button className="m-secondary" onClick={pausePersonalSync}>暂停个人同步</button></>}
    {status.lastSyncedAt && <p role="status">已同步 · {new Date(status.lastSyncedAt).toLocaleTimeString()}</p>}
    {status.phase === 'conflict' && <><button className="m-secondary" onClick={() => void resolvePersonalConflicts('local')}>保留本机冲突版本</button>
      <button className="m-secondary" onClick={() => void resolvePersonalConflicts('remote')}>保留云端冲突版本</button></>}
    {status.error && <p className="m-error" role="alert">{status.error}</p>}
  </section>;
}
