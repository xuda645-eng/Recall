function withTimeout<Value>(promise: Promise<Value>, timeout: number): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('更新检查超时，请稍后重试。')), timeout);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

function waitForWorker(worker: ServiceWorker, target: 'installed' | 'activated', activate?: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error); else resolve();
    };
    const changed = () => {
      if (worker.state === target || worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('新版下载失败，请稍后重试。'));
    };
    const timer = setTimeout(() => finish(new Error('更新尚未完成，请稍后重试。')), 20000);
    worker.addEventListener('statechange', changed);
    changed();
    if (activate) void Promise.resolve().then(activate).catch(finish);
  });
}

export async function refreshMemoryPWA(updateServiceWorker: (reloadPage?: boolean) => Promise<void>, currentVersion: string, reloadPage = () => window.location.reload()): Promise<void> {
  const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('无法检查最新版本，请稍后重试。');
  const latest: unknown = await response.json();
  if (!latest || typeof latest !== 'object' || !('version' in latest) || typeof latest.version !== 'string' || !/^1\.0-\d{8}-\d{4}$/.test(latest.version)) throw new Error('版本信息无效，请稍后重试。');
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL) : undefined;
  if (registration) {
    await withTimeout(registration.update(), 20000);
    if (!registration.waiting && registration.installing) await waitForWorker(registration.installing, 'installed');
    if (registration.waiting) {
      await waitForWorker(registration.waiting, 'activated', () => updateServiceWorker(true));
      reloadPage();
      return;
    }
    if (latest.version !== currentVersion) throw new Error('新版尚未就绪，请稍后再次刷新。');
  }
  reloadPage();
}
