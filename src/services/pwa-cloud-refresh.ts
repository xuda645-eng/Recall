import { isLocalPreview } from '@/lib/local-preview';
import { synchronizeCloud, useCloudSync } from '@/services/cloud-sync';

export async function synchronizeBeforePWARefresh(): Promise<void> {
  if (isLocalPreview()) return;
  const current = useCloudSync.getState();
  if (!current.session || current.phase === 'local' || current.phase === 'unauthorized') return;
  if (current.phase === 'checking') throw new Error('正在检查设备授权，请稍后再同步和更新。');
  if (current.conflicts > 0 || current.phase === 'conflict') throw new Error('有同步冲突，请在“设置与数据”中管理云同步。本机数据保留，本次暂不刷新。');
  await synchronizeCloud();
  const result = useCloudSync.getState();
  if (result.phase !== 'synced' || result.pending > 0 || result.conflicts > 0) {
    throw new Error(`${result.error || '同步尚未完成，请在“设置与数据”中检查云同步。'} 本机数据保留，本次暂不刷新。`);
  }
}
