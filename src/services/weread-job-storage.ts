import { validateWereadJob, type WereadJob } from '@/lib/weread-job';
import { AI_DAILY_MODEL_ATTEMPTS } from '../../shared/weread-ai';

let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器不支持任务草稿保存，请使用手动文件导入')); return; }
    let rejected = false;
    const request = indexedDB.open('recall-weread-drafts', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('jobs', { keyPath: 'id' }); };
    request.onerror = () => { rejected = true; connection = undefined; reject(new Error('任务草稿存储无法打开，请使用手动文件导入')); };
    request.onblocked = () => { rejected = true; connection = undefined; reject(new Error('其他页面阻止草稿存储打开，请关闭旧页面后重试')); };
    request.onsuccess = () => { if (rejected) { request.result.close(); return; } request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
  });
  return connection;
}
async function transact<Value>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<Value>): Promise<Value> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('jobs', mode);
    const request = operation(transaction.objectStore('jobs'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(new Error('任务草稿保存失败，请保持页面并重试；不会继续调用 AI'));
  });
}

export async function loadWereadJob(): Promise<WereadJob | null> {
  const value = await transact('readonly', store => store.get('active'));
  if (!value) return null;
  const job = validateWereadJob(value);
  if (job.expiresAt <= Date.now()) throw new Error('任务草稿已超过 7 天，请先查看或取消后重新选择；不会自动执行');
  return { ...job, status: ['generating', 'importing'].includes(job.status) ? 'paused' : job.status };
}
export async function saveWereadJob(job: WereadJob): Promise<void> {
  await transact('readwrite', store => store.put(validateWereadJob(job)));
}
export async function discardWereadJob(): Promise<void> {
  await transact('readwrite', store => store.delete('active'));
}
export async function withWereadJobLock(work: () => Promise<void>): Promise<void> {
  if (!navigator.locks) throw new Error('当前浏览器不支持安全任务锁，请更新 Safari 或使用手动文件导入');
  await navigator.locks.request('recall-weread-job', { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('另一个页面正在处理微信读书任务，请稍后重试');
    await work();
  });
}
export async function checkWereadBudget(required: number, signal: AbortSignal): Promise<void> {
  if (!required) return;
  const response = await fetch('/api/weread/budget', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal });
  if (!response.ok) throw new Error(response.status === 401 ? '请先授权当前设备，再生成问题' : 'AI 额度暂时无法检查，请稍后重试；尚未发送原文');
  const value = await response.json();
  if (!Number.isSafeInteger(value.remaining) || value.remaining < 0 || value.remaining > AI_DAILY_MODEL_ATTEMPTS) throw new Error('AI 额度响应无效，尚未发送原文');
  if (required > value.remaining) throw new Error(`今日最多还可尝试 ${value.remaining} 个问题，请缩小范围或明天继续；尚未发送原文`);
}
