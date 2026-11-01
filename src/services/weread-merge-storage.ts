import { validateMergeSession, type WereadMergeSession } from '@/lib/weread-merge-session';

let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器无法保存合并草稿，请使用逐条导入')); return; }
    const request = indexedDB.open('recall-weread-merge-drafts', 1);
    let rejected = false;
    request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath: 'id' });
    request.onerror = request.onblocked = () => { rejected = true; connection = undefined; reject(new Error('合并草稿存储无法打开，请关闭旧页面后重试')); };
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  });
  return connection;
}
async function transact<Value>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<Value>): Promise<Value> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sessions', mode);
    const request = work(transaction.objectStore('sessions'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(new Error('合并草稿保存失败，请保持页面并重试；不会继续调用 AI'));
  });
}
export async function loadMergeSession(): Promise<WereadMergeSession | null> {
  const value = await transact('readonly', store => store.get('active'));
  if (!value) return null;
  const session = await validateMergeSession(value);
  if (session.expiresAt <= Date.now()) throw new Error('合并草稿已超过 7 天，请取消后重新选择；不会自动执行');
  return { ...session, status: ['generating', 'importing'].includes(session.status) ? 'paused' : session.status };
}
export async function saveMergeSession(session: WereadMergeSession): Promise<void> {
  const validated = await validateMergeSession(session);
  await transact('readwrite', store => store.put(validated));
}
export async function discardMergeSession(): Promise<void> {
  await transact('readwrite', store => store.delete('active'));
}
