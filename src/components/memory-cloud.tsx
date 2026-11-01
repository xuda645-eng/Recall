import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Cloud, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  issueDeviceCode, listTrustedDevices, logoutDevice, pairDevice, resolveCloudConflicts,
  revokeDevice, synchronizeCloud, useCloudSync,
} from '@/services/cloud-sync';
import { readJournal, type CloudConflict, type CloudJournal } from '@/services/cloud-cache';
import { buildExportPayload } from '@/services/import-export';
import { downloadMemoryText } from '@/services/memory-actions';
import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { applyEntities, canonical, cloudSettingKeys, entityKey, snapshotEntities, type CloudEntity, type TrustedDevice } from '../../shared/cloud';
import type { RecallStateSnapshot } from '@/types';
import './memory-cloud.css';
import { synchronizeMedia, useMediaSync } from '@/services/media-sync';

type CloudStatus = ReturnType<typeof useCloudSync.getState>;
type ConflictChoice = 'local' | 'remote';
interface MemoryCloudProps { className?: string; onManage?: () => void }

const phaseLabels: Record<CloudStatus['phase'], string> = {
  checking: '正在检查授权', local: '仅保存在本机', unauthorized: '需要设备授权',
  syncing: '正在同步', synced: '已同步', offline: '离线，保留本机数据',
  pending: '有更改待同步', conflict: '有冲突待处理', error: '同步未完成',
};

function authorized(status: CloudStatus): boolean {
  return status.session !== null && !['checking', 'local', 'unauthorized'].includes(status.phase);
}

function formatTime(value: string | number | null): string {
  if (value === null) return '尚无成功同步记录';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '时间未知';
}

function useCloudAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const run = useCallback(async <Result,>(task: () => Promise<Result>, onSuccess?: (result: Result) => void): Promise<void> => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await task();
      if (mounted.current) onSuccess?.(result);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : '操作未完成，请重试。本机数据仍保留。');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

function exportLocalBackup(): void {
  const payload = buildExportPayload(dataState(useRecallStore.getState()));
  downloadMemoryText(JSON.stringify(payload, null, 2), `Recall-本机备份-${Date.now()}.recall`, 'application/json');
}

function CloudSummary({ onManage }: Pick<MemoryCloudProps, 'onManage'>) {
  const status = useCloudSync();
  const media = useMediaSync();
  const action = useCloudAction();
  const hasConflicts = status.conflicts > 0 || status.phase === 'conflict';
  const label = hasConflicts && status.phase === 'synced' ? phaseLabels.conflict
    : status.pending > 0 && status.phase === 'synced' ? phaseLabels.pending : phaseLabels[status.phase];
  return <div className="m-cloud-summary">
    <div className="m-cloud-heading">
      <Cloud size={20} aria-hidden="true" />
      <div role="status" aria-live="polite" aria-atomic="true">
        <strong>云同步 · {label}</strong>
        <p className="m-cloud-note">{status.session?.device.label ? `本机：${status.session.device.label}。` : ''}本机阅读、编辑和复习不受影响。</p>
      </div>
    </div>
    <div className="m-cloud-counts">
      <span>待同步 {status.pending} 项</span><span>冲突 {status.conflicts} 项</span>
    </div>
    <p className="m-cloud-note">上次成功同步：{formatTime(status.lastSyncedAt)}</p>
    {(media.pending > 0 || media.running || media.completed > 0) && <p className="m-cloud-note" role="status">来源图片：{media.running ? '正在单独同步' : media.pending ? '尚未完成' : '已同步'}，待传 {media.pending} 张。文字与复习记录优先同步。</p>}
    {media.error && <p className="m-cloud-warning" role="status">{media.error}{authorized(status) && <button type="button" className="m-secondary" disabled={media.running} onClick={() => void synchronizeMedia(status.session!.spaceId)}>重试图片同步</button>}</p>}
    {hasConflicts && <p className="m-cloud-warning">冲突不会自动覆盖。请在云同步设置中预览双方、导出备份，再明确选择保留版本。</p>}
    {status.error && <p className="m-error" role="alert">{status.error}</p>}
    {action.error && <p className="m-error" role="alert">{action.error}</p>}
    {(authorized(status) || onManage) && <div className="m-cloud-actions">
      {authorized(status) && <button type="button" className="m-secondary" disabled={action.busy || status.phase === 'syncing' || hasConflicts}
        onClick={() => void action.run(synchronizeCloud)}><RefreshCw size={16} aria-hidden="true" />{action.busy || status.phase === 'syncing' ? '正在同步' : status.phase === 'error' || status.phase === 'offline' ? '重试同步' : '立即同步'}</button>}
      {onManage && <button type="button" className="m-secondary" onClick={onManage}>{hasConflicts ? '处理冲突' : '管理云同步'}</button>}
    </div>}
  </div>;
}

function PairingForm() {
  const status = useCloudSync();
  const cardCount = useRecallStore(state => state.cards.length);
  const deckCount = useRecallStore(state => state.decks.length);
  const id = useId();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [visible, setVisible] = useState(false);
  const action = useCloudAction();
  const needsPairing = !status.session || status.phase === 'unauthorized' || status.phase === 'local';
  if (!needsPairing) return null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!code.trim() || !label.trim() || status.phase === 'checking' || status.phase === 'syncing') return;
    const submittedCode = code.trim();
    setCode('');
    setVisible(false);
    void action.run(() => pairDevice(submittedCode, label.trim()));
  }

  return <form className="m-cloud-pair" onSubmit={submit} autoComplete="off" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>授权这台设备</h3>
    <p className="m-cloud-note">首次使用可输入你持有的强授权 / 恢复码；已有受信任设备可生成一次性设备码，新设备码 15 分钟内有效且只能使用一次。</p>
    {(cardCount > 0 || deckCount > 0) && <p className="m-cloud-warning">本机已有 {cardCount} 张卡片、{deckCount} 个卡组。首次授权会先自动保存本机迁移备份，再与云端合并，保留原有编号和复习记录；不同版本的冲突需你明确选择，不会自动覆盖。建议另存一份文件备份。</p>}
    <label htmlFor={`${id}-label`}>设备名称
      <input id={`${id}-label`} value={label} onChange={event => setLabel(event.target.value)} placeholder="例如：我的 iPhone" maxLength={80} required disabled={action.busy} />
    </label>
    <div className="m-cloud-field">
      <label htmlFor={`${id}-code`}>授权 / 恢复码</label>
      <span className="m-cloud-code-input">
        <input id={`${id}-code`} type={visible ? 'text' : 'password'} value={code} onChange={event => setCode(event.target.value)}
          autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={256} required disabled={action.busy} aria-describedby={`${id}-privacy`} />
        <button type="button" className="m-secondary" aria-pressed={visible} aria-label={visible ? '隐藏授权码' : '显示授权码'} disabled={action.busy} onClick={() => setVisible(current => !current)}>{visible ? '隐藏' : '显示'}</button>
      </span>
    </div>
    <p id={`${id}-privacy`} className="m-cloud-note">授权码不会写入导出文件，提交后会清空本屏输入。暂不授权也可以继续使用本机卡片。</p>
    {action.error && <p className="m-error" role="alert">{action.error}</p>}
    <div className="m-cloud-actions">
      <button type="submit" className="m-primary" disabled={action.busy || !code.trim() || !label.trim() || status.phase === 'checking' || status.phase === 'syncing'}>{action.busy ? '正在授权' : '授权并合并'}</button>
      {(cardCount > 0 || deckCount > 0) && <button type="button" className="m-secondary" disabled={action.busy} onClick={() => void action.run(async () => exportLocalBackup())}>备份本机数据</button>}
    </div>
  </form>;
}

function loadJournal(): { journal: CloudJournal | null; error: string } {
  try { return { journal: readJournal(), error: '' }; }
  catch (failure) { return { journal: null, error: failure instanceof Error ? failure.message : '冲突队列无法读取，请先备份本机数据。' }; }
}

function liveConflicts(snapshot: RecallStateSnapshot, journal: CloudJournal): CloudConflict[] {
  const local = new Map(snapshotEntities(snapshot).map(entity => [entityKey(entity), entity]));
  return journal.conflicts.map(conflict => {
    for (const entity of [conflict.local, conflict.remote]) {
      if (entity.kind === 'setting' && !(cloudSettingKeys as readonly string[]).includes(entity.id)) {
        throw new Error('冲突包含不可导出的设备设置，已停止覆盖。请先备份本机数据。');
      }
    }
    return { ...conflict, local: local.get(conflict.key) ?? { ...conflict.local, value: null } };
  });
}

function conflictSignature(snapshot: RecallStateSnapshot, journal: CloudJournal): string {
  return canonical({ local: buildExportPayload(snapshot, new Date(0)), conflicts: liveConflicts(snapshot, journal), revision: journal.base.revision, pending: journal.pending });
}

function entityPreview(entity: CloudEntity): string {
  return entity.value === null ? '此版本已删除。选择此版本会保留删除结果。' : JSON.stringify(entity.value, null, 2);
}

function ConflictManagement() {
  const status = useCloudSync();
  const snapshot = dataState(useRecallStore());
  const [journalState, setJournalState] = useState(loadJournal);
  const [backupSignature, setBackupSignature] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [choice, setChoice] = useState<ConflictChoice | null>(null);
  const action = useCloudAction();
  const id = useId();
  useEffect(() => {
    const refresh = () => setJournalState(loadJournal());
    refresh();
    window.addEventListener('recall-cache-saved', refresh);
    return () => window.removeEventListener('recall-cache-saved', refresh);
  }, [status.conflicts]);

  let conflicts: CloudConflict[] = [];
  let signature = '';
  let error = journalState.error;
  try {
    if (journalState.journal) {
      conflicts = liveConflicts(snapshot, journalState.journal);
      signature = conflictSignature(snapshot, journalState.journal);
    }
  } catch (failure) { error = failure instanceof Error ? failure.message : '冲突无法读取，已停止覆盖。'; }
  const backupReady = signature !== '' && backupSignature === signature;
  const disabled = action.busy || status.phase === 'syncing' || !authorized(status);

  async function backup(): Promise<void> {
    setAcknowledged(false);
    setBackupSignature('');
    const journal = readJournal();
    if (!journal?.conflicts.length) throw new Error('冲突已变化，请刷新预览后重试。');
    const current = dataState(useRecallStore.getState());
    const variants = liveConflicts(current, journal);
    const payload = {
      version: 1, exportedAt: new Date().toISOString(),
      local: buildExportPayload(current),
      remote: buildExportPayload(applyEntities(current, variants.map(conflict => conflict.remote))),
      conflicts: variants,
    };
    downloadMemoryText(JSON.stringify(payload, null, 2), `Recall-冲突双方备份-${Date.now()}.json`, 'application/json');
    setJournalState({ journal, error: '' });
    setBackupSignature(conflictSignature(current, journal));
  }

  async function resolve(): Promise<void> {
    if (!choice || !acknowledged || !backupReady || !authorized(useCloudSync.getState()) || useCloudSync.getState().phase === 'syncing') return;
    const journal = readJournal();
    const current = dataState(useRecallStore.getState());
    if (!journal?.conflicts.length || conflictSignature(current, journal) !== backupSignature) {
      setAcknowledged(false);
      setBackupSignature('');
      setJournalState(loadJournal());
      throw new Error('本机数据或冲突已变化，请重新预览并导出双方备份。');
    }
    const chosenLabel = choice === 'local' ? '本机' : '云端';
    if (!window.confirm(`确认对全部 ${journal.conflicts.length} 项冲突保留${chosenLabel}版本？另一方的冲突内容会被覆盖（包括删除结果）。请确认双方备份已保存。`)) return;
    await resolveCloudConflicts(choice);
    setBackupSignature('');
    setAcknowledged(false);
    setChoice(null);
    setJournalState(loadJournal());
  }

  return <section className="m-panel m-cloud-conflicts" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>先保留双方，再处理冲突</h3>
    <p className="m-cloud-note">这里的选择会应用到全部 {conflicts.length || status.conflicts} 项冲突，不是逐项选择。未冲突的数据继续保留；本机与云端预览均包含内容和复习记录，删除也可能是一个版本。</p>
    {error && <p className="m-error" role="alert">{error}</p>}
    {!error && !conflicts.length && <p className="m-cloud-warning">当前没有可读取的冲突详情，不能执行覆盖。请刷新详情或重试同步。</p>}
    {conflicts.map(conflict => <details className="m-cloud-conflict" key={conflict.key}>
      <summary>查看双方版本：{conflict.key}</summary>
      <div className="m-cloud-variants">
        <div><h4>本机版本</h4><pre tabIndex={0} aria-label={`${conflict.key} 本机版本`}>{entityPreview(conflict.local)}</pre></div>
        <div><h4>云端版本</h4><pre tabIndex={0} aria-label={`${conflict.key} 云端版本`}>{entityPreview(conflict.remote)}</pre></div>
      </div>
    </details>)}
    <div className="m-cloud-actions">
      <button type="button" className="m-secondary" disabled={action.busy || !!error || !conflicts.length} onClick={() => void action.run(backup)}>导出冲突双方备份</button>
      <button type="button" className="m-secondary" disabled={action.busy} onClick={() => { setJournalState(loadJournal()); setAcknowledged(false); setBackupSignature(''); }}>刷新冲突详情</button>
    </div>
    {backupSignature && !backupReady && <p className="m-cloud-warning" role="status">数据已变化，需要重新导出双方备份。</p>}
    {backupReady && <p className="m-cloud-note" role="status">已发起备份下载。文件含完整本机数据、采用云端冲突版本的数据，以及双方冲突明细，不含设备授权凭据。请在“文件”中确认保存；此 JSON 需保留供恢复参考，其中 local / remote 为 Recall 备份。</p>}
    <label className="m-cloud-check"><input type="checkbox" disabled={!backupReady || action.busy} checked={acknowledged && backupReady} onChange={event => setAcknowledged(event.target.checked)} />我已保存包含本机和云端双方版本的备份文件</label>
    <fieldset className="m-cloud-choices" disabled={disabled || !backupReady || !acknowledged || !!error || !conflicts.length}>
      <legend>明确选择全部冲突的保留版本</legend>
      <label className="m-cloud-check"><input type="radio" name={`${id}-choice`} checked={choice === 'local'} onChange={() => setChoice('local')} />保留本机版本，覆盖云端冲突</label>
      <label className="m-cloud-check"><input type="radio" name={`${id}-choice`} checked={choice === 'remote'} onChange={() => setChoice('remote')} />使用云端版本，覆盖本机冲突</label>
    </fieldset>
    {action.error && <p className="m-error" role="alert">{action.error}</p>}
    <button type="button" className="m-primary" disabled={disabled || !choice || !backupReady || !acknowledged || !!error || !conflicts.length} onClick={() => void action.run(resolve)}>{action.busy ? '正在处理' : choice === 'local' ? '确认保留本机版本' : choice === 'remote' ? '确认使用云端版本' : '备份并选择版本后继续'}</button>
  </section>;
}

function confirmDisconnect(label: string, current: boolean, logout = false): boolean {
  const status = useCloudSync.getState();
  if (status.phase === 'syncing' || status.phase === 'checking') return false;
  const warning = current && (status.pending > 0 || status.conflicts > 0)
    ? `本机还有 ${status.pending} 项待同步、${status.conflicts} 项冲突。建议先同步或导出备份；继续后这些数据不会上传，需重新授权。\n\n` : '';
  return window.confirm(`${warning}${logout ? '退出' : '撤销'}“${label}”的云端授权？${current ? '这是当前设备，之后需重新授权。' : ''}撤销不能清除设备已有的离线数据，本机卡片和缓存也不会被删除。`);
}

function DeviceManagement() {
  const status = useCloudSync();
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(null);
  const [notice, setNotice] = useState('');
  const action = useCloudAction();
  const { run } = action;
  const id = useId();
  useEffect(() => { void run(listTrustedDevices, setDevices); }, [run]);
  useEffect(() => {
    if (!issued) return;
    const expire = () => {
      if (Date.now() >= issued.expiresAt) { setIssued(null); setNotice('设备码已过期，需要时请重新生成。'); }
    };
    const timer = setTimeout(expire, Math.max(0, issued.expiresAt - Date.now()));
    document.addEventListener('visibilitychange', expire);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', expire); };
  }, [issued]);
  const disabled = action.busy || status.phase === 'syncing';
  const trusted = devices?.filter(device => device.revokedAt === null);

  function generate(): void {
    setIssued(null);
    setNotice('');
    void action.run(async () => {
      const result = await issueDeviceCode();
      if (!result.code || !Number.isFinite(result.expiresAt) || !Number.isFinite(new Date(result.expiresAt).getTime()) || result.expiresAt <= Date.now()) throw new Error('设备码有效期无效，请重试生成。');
      return result;
    }, setIssued);
  }

  return <section className="m-panel m-cloud-devices" aria-labelledby={`${id}-title`}>
    <div className="m-cloud-heading"><ShieldCheck size={20} aria-hidden="true" /><h3 id={`${id}-title`}>受信任设备</h3></div>
    <p className="m-cloud-note">正常授权不要求每年重新登录；清理网站数据、浏览器缓存被回收或授权被撤销后，可能需要再次授权。撤销只阻止云端访问，不能远程擦除设备的离线数据。</p>
    <div className="m-cloud-actions">
      <button type="button" className="m-secondary" disabled={disabled} onClick={generate}>生成新设备码</button>
      <button type="button" className="m-secondary" disabled={disabled} onClick={() => void action.run(listTrustedDevices, setDevices)}>刷新设备列表</button>
    </div>
    {issued && <div className="m-cloud-issued">
      <strong>仅供新设备授权一次</strong>
      <code className="m-cloud-secret">{issued.code}</code>
      <p className="m-cloud-note">15 分钟内有效，截止 <time dateTime={new Date(issued.expiresAt).toISOString()}>{formatTime(issued.expiresAt)}</time>。这是授权凭据，请私下传给自己的设备，不要公开分享。</p>
      <div className="m-cloud-actions">
        <button type="button" className="m-secondary" disabled={action.busy} onClick={() => void action.run(async () => {
          if (Date.now() >= issued.expiresAt) { setIssued(null); throw new Error('设备码已过期，请重新生成。'); }
          if (!navigator.clipboard?.writeText) throw new Error('此浏览器无法直接复制，请长按设备码选择复制。');
          await navigator.clipboard.writeText(issued.code);
        }, () => setNotice('设备码已复制，请仅粘贴到你自己的设备。'))}>复制设备码</button>
        <button type="button" className="m-secondary" onClick={() => { setIssued(null); setNotice('本屏已隐藏设备码，但它仍有效至过期或首次使用。'); }}>隐藏设备码</button>
      </div>
      <p className="m-cloud-note">只在本屏临时显示，离开设置即清空显示；隐藏不会撤销已生成的码。</p>
    </div>}
    {notice && <p className="m-cloud-note" role="status">{notice}</p>}
    {devices === null ? <p className="m-cloud-note">{action.busy ? '正在读取设备列表' : '设备列表尚未取得，请重试刷新。'}</p>
      : !trusted?.length ? <p className="m-cloud-note">本次查询没有受信任设备。</p>
      : <ul className="m-cloud-device-list">{trusted.map(device => {
        const current = device.id === status.session?.device.id;
        return <li key={device.id}>
          <div><strong>{device.label}</strong>{current && <span className="m-cloud-current">当前设备</span>}<small>最近访问：{formatTime(device.lastSeenAt)}</small></div>
          <button type="button" className="m-secondary" aria-label={`撤销 ${device.label}${current ? '（当前设备）' : ''}`} disabled={disabled} onClick={() => {
            if (!confirmDisconnect(device.label, current)) return;
            void action.run(() => revokeDevice(device.id), () => {
              setDevices(previous => previous?.filter(item => item.id !== device.id) ?? null);
              setNotice(`已撤销“${device.label}”的云端授权，离线数据仍保留。`);
            });
          }}>撤销</button>
        </li>;
      })}</ul>}
    {action.error && <p className="m-error" role="alert">{action.error}</p>}
    {(status.pending > 0 || status.conflicts > 0) && <p className="m-cloud-warning">本机仍有待同步或冲突数据。退出 / 撤销本机授权前，请先同步或导出备份；未上传的内容不会自动送达其他设备。</p>}
    <div className="m-cloud-actions">
      <button type="button" className="m-secondary" disabled={action.busy} onClick={() => void action.run(async () => exportLocalBackup())}>备份本机数据</button>
      <button type="button" className="m-secondary" disabled={disabled} onClick={() => {
        if (confirmDisconnect(status.session?.device.label ?? '本机', true, true)) void action.run(logoutDevice);
      }}>退出本机授权</button>
    </div>
  </section>;
}

export function MemoryCloudStatus({ className = '', onManage }: MemoryCloudProps = {}) {
  return <section className={`m-cloud m-panel m-cloud-status ${className}`} aria-label="云同步状态">
    <CloudSummary onManage={onManage} />
    {!onManage && <PairingForm />}
  </section>;
}

export function MemoryCloudSettings({ className = '' }: Pick<MemoryCloudProps, 'className'> = {}) {
  const status = useCloudSync();
  return <section className={`m-cloud m-cloud-settings ${className}`} aria-label="云同步管理">
    <MemoryCloudStatus />
    {(status.conflicts > 0 || status.phase === 'conflict') && <ConflictManagement />}
    {authorized(status) && status.session && <DeviceManagement key={`${status.session.spaceId}:${status.session.device.id}`} />}
  </section>;
}
