import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const at = '2026-10-01T00:00:00.000Z';
const longFront = '为什么主动回忆有帮助？\n\n' + '先隐藏答案，尝试用自己的话说明原理与条件。\n\n'.repeat(40);
const longBack = '因为复述会暴露遗漏。\n\n' + '对照原文，找到概念之间的关系，再重新表达。\n\n'.repeat(45);
function fixture() {
  const seed = createSeedSnapshot();
  const decks = [
    { ...seed.decks[0], id: 'root', name: '回忆方法', parentId: null, importedAt: at },
    { ...seed.decks[1], id: 'leaf', name: '阅读练习', parentId: 'root', importedAt: at },
  ];
  const cards = [
    { ...seed.cards[0], id: 'first', deckId: 'leaf', cardType: 'basic' as const, contentKind: 'qa' as const, front: longFront, back: longBack, state: 'new' as const, lastReviewDate: null, nextReviewDate: at, stability: 0, difficulty: 0, reps: 0, lapses: 0, learningSteps: 0, scheduledDays: 0, importedAt: at },
    { ...seed.cards[0], id: 'second', deckId: 'leaf', cardType: 'basic' as const, contentKind: 'qa' as const, front: '如何检查理解？', back: '合上材料，独立解释。', difficulty: 5, nextReviewDate: at, importedAt: at },
    { ...seed.cards[0], id: 'archived', deckId: 'leaf', cardType: 'basic' as const, contentKind: 'qa' as const, front: '归档示例', back: '仍保留原文。', difficulty: 5, nextReviewDate: at, archivedAt: at, importedAt: at },
  ];
  return { ...seed, decks, cards, reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true, studyPreferences: { newCardRatio: 1, batchSize: 10, sessionMinutes: 30 }, reviewPlan: { mode: 'fixed' as const, intervals: { again: 60000, hard: 86400000, good: 2592000000, easy: 15552000000 } } } };
}
function folderArchiveFixture() {
  const seed = fixture();
  const decks = [...seed.decks, { ...seed.decks[1], id: 'deep', name: '深层练习', parentId: 'leaf' }, { ...seed.decks[0], id: 'outside', name: '其他卡组' }];
  const cards = [
    { ...seed.cards[0], deckId: 'root' },
    seed.cards[1], seed.cards[2],
    { ...seed.cards[1], id: 'deep-card', deckId: 'deep', front: '深层问题' },
    { ...seed.cards[1], id: 'outside-card', deckId: 'outside', front: '其他问题' },
  ];
  return { ...seed, decks, cards };
}
async function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));
}
async function readinessState(page: Page) {
  const state = await page.evaluate(async () => {
    const supported = 'serviceWorker' in navigator;
    const registration = supported ? await navigator.serviceWorker.getRegistration() : undefined;
    const cacheNames = 'caches' in window ? await caches.keys() : [];
    const cacheEntries = await Promise.all(cacheNames.map(async name => (await caches.open(name)).keys()));
    const cachedPaths = new Set(cacheEntries.flat().map(request => new URL(request.url)).filter(url => url.origin === location.origin).map(url => url.pathname));
    const loadedAssets = performance.getEntriesByType('resource').map(entry => entry.name);
    const shellAssets = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"], link[rel="modulepreload"]')).map(element => element instanceof HTMLScriptElement ? element.src : element.href);
    const requiredPaths = new Set([
      new URL('index.html', new URL('./', location.href)).pathname,
      ...[...shellAssets, ...loadedAssets].map(value => new URL(value, location.href)).filter(url => url.origin === location.origin && /\/assets\/.*\.(?:js|css)$/.test(url.pathname)).map(url => url.pathname),
    ]);
    return {
      documentReadyState: document.readyState,
      serviceWorker: {
        supported,
        registered: !!registration,
        installing: registration?.installing?.state ?? null,
        waiting: registration?.waiting?.state ?? null,
        active: registration?.active?.state ?? null,
        controller: supported ? navigator.serviceWorker.controller?.state ?? null : null,
      },
      cacheEntryCounts: cacheEntries.map(entries => entries.length),
      requiredShellEntries: requiredPaths.size,
      missingShellEntries: [...requiredPaths].filter(path => !cachedPaths.has(path)).length,
    };
  });
  return { ...state, appVisible: await page.locator('.memory-app').isVisible() };
}
async function waitForReadiness(page: Page, phase: string, ready: (state: Awaited<ReturnType<typeof readinessState>>) => boolean, timeout?: number) {
  let diagnostics: Awaited<ReturnType<typeof readinessState>> | undefined;
  await test.step(`Readiness: ${phase}`, async () => {
    try {
      await expect.poll(async () => {
        diagnostics = await readinessState(page);
        return ready(diagnostics);
      }, { message: `Readiness: ${phase}`, ...(timeout === undefined ? {} : { timeout: Math.min(timeout, test.info().timeout) }) }).toBe(true);
    } catch (error) {
      await test.info().attach(`readiness-${phase}`, { body: JSON.stringify({ phase, diagnostics: diagnostics ?? 'No readiness sample completed' }), contentType: 'application/json' });
      throw error;
    }
  });
}
async function waitForAppReady(page: Page) {
  await waitForReadiness(page, 'visible-app', state => state.appVisible);
  await waitForReadiness(page, 'sw-control', state => state.serviceWorker.controller === 'activated', test.info().timeout);
  await waitForReadiness(page, 'cache-ready', state => state.requiredShellEntries > 1 && state.missingShellEntries === 0, test.info().timeout);
}
async function seedPage(page: Page, data = fixture(), hash = 'home', entry = './') {
  await page.goto(entry, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.evaluate(({ value, route }) => { localStorage.clear(); localStorage.setItem('recall.snapshot.v1', JSON.stringify(value)); window.location.hash = route; }, { value: data, route: hash });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
}
async function serveIsolatedBuild(basePath: string, overrides = new Map<string, string>()) {
  const root = resolve(process.cwd(), 'dist');
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (!pathname.startsWith(basePath)) { response.writeHead(404).end(); return; }
      const file = resolve(root, pathname === basePath ? 'index.html' : decodeURIComponent(pathname.slice(basePath.length)));
      if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
      const contents = overrides.get(pathname.slice(basePath.length)) ?? await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(contents);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('隔离服务器未能启动');
  let stopped = false;
  return {
    url: `http://127.0.0.1:${address.port}${basePath}`,
    stop: async () => { if (stopped) return; stopped = true; server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); },
  };
}
async function navigate(page: Page, label: string) {
  const drawer = page.locator('#memory-drawer');
  if (await page.getByRole('button', { name: '打开项目菜单', exact: true }).isVisible()) await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await drawer.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function startReading(page: Page) {
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await expect(page.getByRole('button', { name: '显示答案', exact: true })).toBeVisible();
}
async function saveShot(page: Page, name: string) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), scale: 'css' });
}
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /Error:|Minified React error|Maximum update depth/.test(message.text())) errors.push(message.text()); });
});
test.afterEach(async ({ page }) => {
  if (await page.getByRole('heading', { name: '遇到一个问题', exact: true }).isVisible()) throw new Error(await page.locator('details').last().textContent() || '应用错误边界被触发');
  expect(runtimeErrors.get(page)).toEqual([]);
});

test('新用户从空卡组开始，不自动展示个人或示例数据', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await expect(page.getByRole('heading', { name: '今天，温习一点。' })).toBeVisible();
  expect((await snapshot(page)).cards).toEqual([]);
  expect((await snapshot(page)).decks).toEqual([]);
  await noOverflow(page);
});

test('正式应用仅iPhone主屏幕启用系统安全框，标签页和其他设备保留cover', async ({ page }) => {
  test.skip(!!process.env.RECALL_URL, 'Device identity emulation and reload stress are local-only');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const context = page.context();
  for (const identity of [
    { userAgent: 'iPhone Safari', standalone: true, fit: 'auto' },
    { userAgent: 'iPhone Safari', standalone: false, fit: 'cover' },
    { userAgent: 'iPad Safari', standalone: true, fit: 'cover' },
    { userAgent: 'Android Chrome', standalone: true, fit: 'cover' },
    { userAgent, standalone: false, fit: 'cover' },
  ]) {
    const candidate = await context.newPage();
    try {
      await candidate.addInitScript(identity => {
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: identity.userAgent });
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: identity.standalone });
      }, identity);
      await candidate.goto('./#home');
      await waitForAppReady(candidate);
      await expect(candidate.locator('meta[name="viewport"]')).toHaveAttribute('content', new RegExp(`viewport-fit=${identity.fit}`));
      await noOverflow(candidate);
    } finally { await candidate.close(); }
  }
});

test('iPhone系统安全框首帧、抽屉、缩短视口和原版更新离线重开保留合成数据', async ({ page, context, browserName }) => {
  test.skip(!!process.env.RECALL_URL, 'Synthetic old-to-new/offline mutation test is local-only');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.memory-bar')) return;
      document.documentElement.setAttribute('data-first-viewport', document.querySelector('meta[name="viewport"]')!.getAttribute('content')!);
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const originalHtml = await readFile(resolve('dist/index.html'), 'utf8');
  const oldHtml = originalHtml.replace(/<script src="[^"\n]*pwa-viewport\.js"><\/script>/, '');
  const currentWorker = await readFile(resolve('dist/sw.js'), 'utf8');
  const oldWorker = currentWorker.replace(/url:"index.html",revision:"[^"]+"/, 'url:"index.html",revision:"legacy-cover"').replace(/\{url:"pwa-viewport\.js",revision:"[^"]+"\},?/, '');
  expect(oldWorker).not.toBe(currentWorker);
  expect(oldWorker).not.toContain('url:"pwa-viewport.js"');
  const oldOverrides = new Map([['index.html', oldHtml], ['sw.js', oldWorker]]);
  const oldServer = await serveIsolatedBuild('/', oldOverrides);
  try {
    await seedPage(page, fixture(), 'home', oldServer.url);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    const before = await snapshot(page);
    oldOverrides.set('index.html', originalHtml);
    oldOverrides.set('sw.js', currentWorker);
    await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.getByRole('button', { name: '检查更新并刷新', exact: true }).click()]);
    await waitForAppReady(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=auto/);
    await expect(page.locator('html')).toHaveAttribute('data-first-viewport', /viewport-fit=auto/);
    expect(await snapshot(page)).toEqual(before);
    for (const inset of [0, 20, 59, 96]) {
      await page.locator('.memory-app').evaluate((element, value) => {
        (element as HTMLElement).style.setProperty('--safe-inset-top', `${value}px`);
        (element as HTMLElement).style.setProperty('--safe-bottom', '34px');
      }, inset);
      expect((await page.locator('.m-brand').boundingBox())!).toMatchObject({ y: inset + 10, width: 48, height: 48 });
      await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
      await expect(page.locator('.memory-shell')).toHaveClass(/is-open/);
      expect((await page.locator('.m-brand').boundingBox())!.y).toBe(inset + 10);
      await page.getByRole('button', { name: '关闭项目菜单', exact: true }).click();
      await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    }
    for (const dimensions of [{ width: 393, height: 793 }, { width: 852, height: 393 }, { width: 393, height: 852 }]) {
      await page.setViewportSize(dimensions);
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=auto/);
      await saveShot(page, `system-frame-${dimensions.width}-${dimensions.height}`);
      await expect.poll(() => page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1 })), { message: `${dimensions.width}x${dimensions.height} system-frame layout` }).toEqual({ width: dimensions.width, overflow: false });
      await noOverflow(page);
    }
    await navigate(page, '设置与数据');
    await page.getByRole('button', { name: '显示运行信息' }).click();
    await expect(page.getByLabel('显示诊断结果')).toContainText('viewport-fit=auto');
    if (browserName === 'webkit') await oldServer.stop();
    else await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=auto/);
    expect(await snapshot(page)).toEqual(before);
  } finally { await context.setOffline(false); await oldServer.stop(); }
});

test('系统安全框引导脚本公开可用，原应用和诊断往返保留正常视口', async ({ page }) => {
  await page.goto('./#settings', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  const script = page.locator('script[src$="pwa-viewport.js"]');
  expect(await script.count()).toBe(1);
  const scriptUrl = new URL((await script.getAttribute('src'))!, page.url());
  expect(scriptUrl.origin).toBe(new URL(page.url()).origin);
  expect((await page.context().request.get(scriptUrl.href)).status()).toBe(200);
  const content = await page.locator('meta[name="viewport"]').getAttribute('content');
  const expected = await page.evaluate(() => /iPhone/.test(navigator.userAgent) && ((navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches) ? 'auto' : 'cover');
  expect(content).toContain(`viewport-fit=${expected}`);
  await page.getByRole('button', { name: '显示运行信息' }).click();
  await expect(page.getByLabel('显示诊断结果')).toContainText(`viewport-fit=${expected}`);
  await page.getByRole('link', { name: '打开原安装内对照页' }).click();
  await expect(page.getByRole('heading', { name: '静态页还模糊吗？' })).toBeVisible();
  await page.getByRole('link', { name: '返回 Recall', exact: true }).click();
  await waitForAppReady(page);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', new RegExp(`viewport-fit=${expected}`));
});

test('原安装显示诊断往返不改变合成卡片，静态页不加载应用或API', async ({ page }) => {
  test.skip(!!process.env.RECALL_URL, 'Persistence mutation checks use only the local synthetic fixture');
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
  await seedPage(page);
  const before = await snapshot(page);
  await navigate(page, '设置与数据');
  await page.getByRole('button', { name: '显示运行信息' }).click();
  const report = await page.getByLabel('显示诊断结果').textContent();
  expect(report).toContain('"navigator": true');
  expect(report).not.toContain(longFront);
  expect(report).not.toContain('recall.snapshot');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.getByRole('link', { name: '打开原安装内对照页' }).click();
  await expect(page.getByRole('heading', { name: '静态页还模糊吗？' })).toBeVisible();
  await expect(page.locator('#mode')).toContainText('主屏幕 PWA');
  expect(await page.locator('.memory-app').count()).toBe(0);
  expect(requests.some(url => /\/(api|assets)\//.test(new URL(url).pathname))).toBe(false);
  for (const inset of [0, 20, 59, 96]) {
    await page.evaluate(value => {
      document.documentElement.style.setProperty('--safe-top', `${value}px`);
      document.documentElement.style.setProperty('--safe-bottom', '34px');
    }, inset);
    await page.getByRole('button', { name: '重新读取显示信息' }).click();
    expect((await page.locator('.brand').boundingBox())!.y).toBe(inset + 10);
    expect((await page.locator('.brand').boundingBox())!.height).toBe(48);
    await noOverflow(page);
  }
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '59px'));
  await saveShot(page, 'installed-context-diagnostics');
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('link', { name: '返回 Recall', exact: true }).click();
  await waitForAppReady(page);
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'settings');
  expect(await snapshot(page)).toEqual(before);
});

test('原安装静态诊断离线进入并返回，未访问过的页面已预缓存', async ({ page, context, browserName, baseURL }) => {
  test.skip(!!process.env.RECALL_URL, 'Offline synthetic fixture runs locally, not against production');
  const basePath = new URL('./', baseURL || 'http://127.0.0.1:4193/').pathname;
  const isolated = browserName === 'webkit' ? await serveIsolatedBuild(basePath) : null;
  try {
  await seedPage(page, fixture(), 'home', isolated?.url || './');
  const before = await snapshot(page);
  await navigate(page, '设置与数据');
  if (isolated) await isolated.stop();
  else await context.setOffline(true);
  await page.getByRole('link', { name: '打开原安装内对照页' }).click();
  await expect(page.getByRole('heading', { name: '静态页还模糊吗？' })).toBeVisible();
  await expect(page.locator('#report')).toContainText('installed-context-20261101-r3');
  for (const variant of ['b', 'c', 'a']) {
    await page.locator(`[data-case-link="${variant}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-case', variant);
    await expect(page.locator('#report')).toContainText(`"variant": "${variant.toUpperCase()}"`);
  }
  await page.locator('[data-case-link="f"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-case', 'f');
  await expect(page.locator('#report')).toContainText('viewport-fit=auto');
  await page.locator('[data-case-link="a"]').click();
  await expect(page.locator('#report')).toContainText('viewport-fit=cover');
  await page.getByRole('link', { name: '返回 Recall', exact: true }).click();
  await waitForAppReady(page);
  expect(await snapshot(page)).toEqual(before);
  } finally { await context.setOffline(false); await isolated?.stop(); }
});

test('原安装显示诊断公开只读入口、静态加载与返回', async ({ page }) => {
  await page.goto('./#settings', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.getByRole('button', { name: '显示运行信息' }).click();
  await expect(page.getByLabel('显示诊断结果')).toContainText('safeArea');
  const origin = new URL(page.url()).origin;
  await page.getByRole('link', { name: '打开原安装内对照页' }).click();
  await expect(page.getByRole('heading', { name: '静态页还模糊吗？' })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(origin);
  await expect(page.locator('#report')).toContainText('installed-context-20261101-r3');
  for (const variant of ['b', 'c', 'a']) {
    await page.locator(`[data-case-link="${variant}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-case', variant);
    await expect(page.locator('#report')).toContainText(`"variant": "${variant.toUpperCase()}"`);
    expect(new URL(page.url()).origin).toBe(origin);
  }
  await page.locator('[data-case-link="f"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-case', 'f');
  await expect(page.locator('#report')).toContainText('viewport-fit=auto');
  expect(new URL(page.url()).origin).toBe(origin);
  await page.getByRole('link', { name: '返回 Recall', exact: true }).click();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'settings');
});

test('原安装方案保持控件几何、触摸和滚动，切换不读写存储或调用API', async ({ page }) => {
  test.skip(!!process.env.RECALL_URL, 'Storage guards and inset stress use local isolated contexts');
  await seedPage(page);
  const before = await snapshot(page);
  await page.addInitScript(() => {
    if (!location.pathname.includes('/status-diagnostics/')) return;
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
      Object.defineProperty(Storage.prototype, method, { value: () => { throw new Error('Diagnostic storage access'); } });
    }
    window.fetch = () => { throw new Error('Diagnostic network request'); };
  });
  await page.goto('./status-diagnostics/?status-case=invalid');
  await expect(page.locator('html')).toHaveAttribute('data-case', 'a');
  for (const variant of ['a', 'b', 'c', 'f']) {
    await page.locator('html').evaluate(element => element.setAttribute('data-previous-document', 'true'));
    await page.locator(`[data-case-link="${variant}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-case', variant);
    expect(await page.locator('html').getAttribute('data-previous-document')).toBeNull();
    await expect(page.locator(`[data-case-link="${variant}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#mode')).toContainText(`PWA · ${variant.toUpperCase()}`);
    const viewportMetadata = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMetadata).toContain(variant === 'f' ? 'viewport-fit=auto' : 'viewport-fit=cover');
    for (const inset of [0, 20, 59, 96]) {
      await page.evaluate(value => {
        document.documentElement.style.setProperty('--safe-top', `${value}px`);
        document.documentElement.style.setProperty('--safe-bottom', '34px');
      }, inset);
      await page.getByRole('button', { name: '重新读取显示信息' }).click();
      const logo = (await page.locator('.brand').boundingBox())!;
      expect(logo).toMatchObject({ y: inset + 10, width: 48, height: 48 });
      expect(await page.locator('.brand').evaluate(element => getComputedStyle(element).borderRadius)).toBe('14px');
      expect(await page.locator('.bar').evaluate(element => getComputedStyle(element).gap)).toBe('8px');
      const report = JSON.parse((await page.locator('#report').textContent())!);
      expect(report.barPosition).toBe(variant === 'c' ? 'sticky' : 'fixed');
      if (variant === 'b') {
        expect(report.sampler).toMatchObject({ height: inset + 10, backgroundClip: 'border-box', pointerEvents: 'none' });
        expect(await page.locator('.brand').evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        })).toBe(true);
      }
      if (variant === 'c') expect(report.sampler.display).toBe('none');
      await noOverflow(page);
    }
    for (const width of [320, 393, 760, 761, 852]) {
      await page.setViewportSize({ width, height: width === 852 ? 393 : 852 });
      await noOverflow(page);
      for (const target of ['.brand', '#refresh', '.cases a']) {
        for (const element of await page.locator(target).all()) {
          const box = (await element.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '59px');
      const scrolling = document.documentElement.dataset.case === 'c' ? document.scrollingElement : document.querySelector('.content');
      scrolling!.scrollTop = 240;
    });
    await page.getByRole('button', { name: '重新读取显示信息' }).click();
    const scrolledReport = JSON.parse((await page.locator('#report').textContent())!);
    expect(scrolledReport.scrollOwner).toBe(variant === 'c' ? 'document' : 'content');
    expect(scrolledReport.scrollTop).toBeGreaterThan(0);
    expect((await page.locator('.brand').boundingBox())!.y).toBe(69);
    await saveShot(page, `installed-case-${variant}`);
    await page.setViewportSize({ width: 393, height: 793 });
    await page.evaluate(() => {
      Object.defineProperty(screen, 'height', { configurable: true, value: 852 });
    });
    await page.getByRole('button', { name: '重新读取显示信息' }).click();
    const shorterReport = JSON.parse((await page.locator('#report').textContent())!);
    expect(shorterReport.screen).toEqual([393, 852]);
    expect(shorterReport.viewport).toEqual([393, 793]);
    expect(shorterReport.logoTop).toBe(69);
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '0px'));
    await page.getByRole('button', { name: '重新读取显示信息' }).click();
    expect((await page.locator('.brand').boundingBox())!.y).toBe(10);
    await noOverflow(page);
  }
  await page.getByRole('link', { name: '返回 Recall', exact: true }).click();
  await waitForAppReady(page);
  expect(await snapshot(page)).toEqual(before);
});

test('抽屉显示固定构建版本，刷新图标在移动窄屏与桌面均可触达', async ({ page }) => {
  await seedPage(page);
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  const version = page.locator('[data-app-version]');
  const text = (await version.textContent())!;
  expect(text).toMatch(/^1\.0-\d{8}-\d{4}$/);
  const metadata = await page.evaluate(async () => (await fetch(new URL('version.json', location.href), { credentials: 'omit', cache: 'no-store' })).json());
  expect(metadata.version).toBe(text);
  expect(metadata.timezone).toBe('Asia/Shanghai');
  await saveShot(page, 'drawer-version');
  for (const width of [393, 320, 760, 761, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    await expect(version).toHaveText(text);
    const refresh = page.getByRole('button', { name: '检查更新并刷新', exact: true });
    await expect(refresh).toBeInViewport();
    const box = (await refresh.boundingBox())!;
    expect(Math.round(box.width * 1000) / 1000).toBeGreaterThanOrEqual(44);
    expect(Math.round(box.height * 1000) / 1000).toBeGreaterThanOrEqual(44);
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(geometry.scroll, `${width}px viewport: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.width + 1);
  }
});

test('版本刷新检查后重新加载，离线失败不误报最新也不改变本机数据', async ({ page, context }) => {
  await seedPage(page);
  const before = await snapshot(page);
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  const version = await page.locator('[data-app-version]').textContent();
  await context.setOffline(true);
  await page.getByRole('button', { name: '检查更新并刷新', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '无法检查更新' })).toBeVisible();
  await expect(page.getByRole('button', { name: '检查更新并刷新', exact: true })).toBeEnabled();
  expect(await snapshot(page)).toEqual(before);
  await context.setOffline(false);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.getByRole('button', { name: '检查更新并刷新', exact: true }).click()]);
  await waitForAppReady(page);
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await expect(page.locator('[data-app-version]')).toHaveText(version!);
  expect(await snapshot(page)).toEqual(before);
});

test('版本刷新激活新发现的Service Worker后重开且保留归档和复习数据', async ({ page }) => {
  const overrides = new Map<string, string>();
  const server = await serveIsolatedBuild('/', overrides);
  try {
    await seedPage(page, fixture(), 'home', server.url);
    const before = await snapshot(page);
    overrides.set('sw.js', (await readFile(resolve(process.cwd(), 'dist/sw.js'), 'utf8')) + '\nself.addEventListener("message", event => { if (event.data === "recall-refresh-test") event.ports[0]?.postMessage("updated"); });');
    await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
    let reloads = 0;
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) reloads++; });
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.getByRole('button', { name: '检查更新并刷新', exact: true }).click()]);
    await waitForAppReady(page);
    const active = await page.evaluate(() => new Promise<string>(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = event => resolve(event.data);
      navigator.serviceWorker.controller!.postMessage('recall-refresh-test', [channel.port2]);
    }));
    expect(active).toBe('updated');
    expect(reloads).toBe(1);
    expect(await snapshot(page)).toEqual(before);
  } finally { await server.stop(); }
});

test('Service Worker注册先于懒加载memory-workspace脚本完成', async ({ page, baseURL }) => {
  const base = new URL(baseURL || 'http://127.0.0.1:4193/');
  test.skip(!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Synthetic chunk delay is local-only; never intercept public app assets');
  const workspaceAsset = (url: URL) => url.origin === base.origin && /\/assets\/memory-workspace-[^/]+\.js$/.test(url.pathname);
  let releaseWorkspace: () => void = () => {};
  const workspaceReleased = new Promise<void>(release => { releaseWorkspace = release; });
  let heldRequests = 0;
  await page.route(workspaceAsset, async route => {
    heldRequests += 1;
    await workspaceReleased;
    await route.continue();
  });
  try {
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await waitForReadiness(page, 'held-workspace-request', () => heldRequests > 0);
    await expect(page.locator('.memory-app')).not.toBeVisible();
    await waitForReadiness(page, 'sw-registration-before-workspace', state => state.serviceWorker.registered);
    await expect(page.locator('.memory-app')).not.toBeVisible();
  } finally {
    releaseWorkspace();
    await page.unrouteAll({ behavior: 'wait' });
  }
  await waitForAppReady(page);
});

test('iPhone15首页、48px共享Logo、静止抽屉和快速关闭恢复', async ({ page }) => {
  await seedPage(page);
  await saveShot(page, 'home');
  const logo = page.locator('.m-brand');
  const closed = await logo.boundingBox();
  expect(closed?.width).toBe(48);
  expect(closed?.height).toBe(48);
  await logo.click();
  await expect(page.locator('.memory-shell')).toHaveClass(/is-open/);
  await expect.poll(async () => (await logo.boundingBox())!.x).toBeGreaterThan(300);
  const drawer = await page.locator('#memory-drawer').boundingBox();
  expect(drawer?.x).toBe(0);
  expect(393 - drawer!.width).toBeGreaterThanOrEqual(64);
  await saveShot(page, 'drawer');
  await page.keyboard.press('Escape');
  await expect.poll(async () => Math.round((await logo.boundingBox())!.x)).toBe(Math.round(closed!.x));
  await expect(logo).toBeFocused();
  for (let count = 0; count < 4; count++) { await logo.click(); await page.keyboard.press('Escape'); }
  await expect.poll(async () => Math.round((await logo.boundingBox())!.x)).toBe(Math.round(closed!.x));
  await noOverflow(page);
});

test('主屏幕WebKit顶部采样层独立固定，不绘制遮罩或拦截Logo触摸', async ({ page, browserName }) => {
  await seedPage(page);
  await expect(page.locator('.m-status-edge')).toHaveCSS('display', 'none');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  const edge = page.locator('.m-status-edge');
  await expect(edge).toHaveAttribute('data-standalone', 'true');
  if (browserName !== 'webkit') {
    await expect(edge).toHaveCSS('display', 'none');
    return;
  }
  if (!await page.evaluate(() => CSS.supports('-webkit-touch-callout', 'none'))) {
    const rules = await page.evaluate(() => Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules)).filter(rule => rule instanceof CSSSupportsRule && rule.conditionText.includes('-webkit-touch-callout') && rule.cssText.includes('.m-status-edge')).map(rule => Array.from((rule as CSSSupportsRule).cssRules).map(child => child.cssText).join('\n')).join('\n'));
    expect(rules).toContain('.m-status-edge');
    await page.addStyleTag({ content: rules });
    test.info().annotations.push({ type: 'simulation', description: 'macOS WebKit lacks iOS touch-callout; activate the shipped conditional rules to check geometry, not native system-blur suppression.' });
  }
  for (const inset of [0, 20, 59, 96]) {
    await page.locator('.memory-app, .m-status-edge').evaluateAll((elements, value) => {
      for (const element of elements) (element as HTMLElement).style.setProperty('--safe-inset-top', `${value}px`);
    }, inset);
    const samplingBox = (await edge.boundingBox())!;
    expect(samplingBox.y).toBe(0);
    expect(samplingBox.height).toBe(inset + 11);
    expect(samplingBox.y + samplingBox.height).toBeGreaterThan(inset + 4);
    expect((await page.locator('.m-brand').boundingBox())!.y).toBe(inset + 10);
  }
  await page.locator('.memory-app, .m-status-edge').evaluateAll(elements => {
    for (const element of elements) (element as HTMLElement).style.setProperty('--safe-inset-top', '59px');
  });
  for (const dark of [false, true]) {
    await page.locator('html').evaluate((element, value) => element.classList.toggle('dark', value), dark);
    const surface = await edge.evaluate(element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { parentIsBody: element.parentElement === document.body, childCount: element.childNodes.length, display: style.display, position: style.position, color: style.backgroundColor, clip: style.backgroundClip, pointerEvents: style.pointerEvents, zIndex: style.zIndex, filter: style.filter, backdrop: style.backdropFilter, x: box.x, y: box.y, width: box.width, height: box.height, ancestorTransforms: [document.body, document.documentElement].map(ancestor => getComputedStyle(ancestor).transform) };
    });
    expect(surface).toEqual({ parentIsBody: true, childCount: 0, display: 'block', position: 'fixed', color: dark ? 'rgb(36, 36, 32)' : 'rgb(246, 245, 239)', clip: 'text', pointerEvents: 'none', zIndex: '2147483647', filter: 'none', backdrop: 'none', x: 0, y: 0, width: 393, height: 70, ancestorTransforms: ['none', 'none'] });
    const withSampler = await page.screenshot({ clip: { x: 0, y: 0, width: 393, height: 170 }, animations: 'disabled' });
    await edge.evaluate(element => { (element as HTMLElement).style.visibility = 'hidden'; });
    const withoutSampler = await page.screenshot({ clip: { x: 0, y: 0, width: 393, height: 170 }, animations: 'disabled' });
    expect(withSampler.equals(withoutSampler)).toBe(true);
    await edge.evaluate(element => { (element as HTMLElement).style.visibility = ''; });
  }
  await page.locator('html').evaluate(element => element.classList.remove('dark'));
  const logo = page.locator('.m-brand');
  expect((await logo.boundingBox())!.y).toBe(69);
  await logo.click();
  await expect.poll(async () => (await logo.boundingBox())!.x).toBeGreaterThan(300);
  expect((await edge.boundingBox())!.x).toBe(0);
  await page.keyboard.press('Escape');
  await expect(logo).toBeFocused();
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
  await page.locator('.m-top-action').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('status-edge-safe-area.png') });
  await page.setViewportSize({ width: 761, height: 852 });
  await expect(edge).toHaveCSS('display', 'none');
});

test('状态栏安全区与Logo行保留10px间距，滚动和抽屉不改变同行位置', async ({ page }) => {
  await seedPage(page);
  const logo = page.locator('.m-brand');
  const context = page.locator('.memory-bar .m-context');
  const action = page.locator('.m-top-action');
  for (const inset of [0, 59, 80]) {
    await page.locator('.memory-app').evaluate((element, value) => {
      (element as HTMLElement).style.setProperty('--safe-inset-top', `${value}px`);
    }, inset);
    const logoBox = (await logo.boundingBox())!;
    const contextBox = (await context.boundingBox())!;
    const actionBox = (await action.boundingBox())!;
    expect(logoBox.y).toBe(inset + 10);
    expect(logoBox.width).toBe(48);
    expect(logoBox.height).toBe(48);
    expect(contextBox.y).toBe(logoBox.y);
    expect(contextBox.height).toBe(48);
    expect(actionBox.y).toBe(logoBox.y);
    expect(actionBox.width).toBe(48);
    expect(actionBox.height).toBe(48);
    expect(contextBox.x - logoBox.x - logoBox.width).toBe(8);
    expect(actionBox.x - contextBox.x - contextBox.width).toBe(8);
    const barBox = (await page.locator('.memory-bar').boundingBox())!;
    expect(barBox.y).toBe(0);
    expect(barBox.x).toBe(0);
    expect(barBox.width).toBe(393);
    expect(barBox.height).toBe(inset + 72);
    expect((await page.locator('.memory-content').boundingBox())!.y).toBe(barBox.height);
    expect((await page.locator('.m-intro').boundingBox())!.y).toBeGreaterThan(logoBox.y + logoBox.height);
    await noOverflow(page);
    if (inset === 59) await saveShot(page, 'home-status-bar-gap');
  }
  await page.locator('.memory-content').evaluate(element => { element.scrollTop = 180; });
  expect(await page.locator('.memory-content').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await logo.boundingBox())!.y).toBe(90);
  const firstFrame = await logo.evaluate(button => new Promise<{ logoTop: number; logoLeft: number; contextTop: number; actionTop: number; drawerVisible: boolean }>(resolveFrame => {
    const shell = button.closest('.memory-shell')!;
    const captureFrame = () => {
      if (shell.getBoundingClientRect().x <= 0) { requestAnimationFrame(captureFrame); return; }
      const logoBox = button.getBoundingClientRect();
      resolveFrame({
        logoTop: logoBox.y,
        logoLeft: logoBox.x,
        contextTop: shell.querySelector('.m-context')!.getBoundingClientRect().y,
        actionTop: shell.querySelector('.m-top-action')!.getBoundingClientRect().y,
        drawerVisible: getComputedStyle(document.querySelector('#memory-drawer')!).visibility === 'visible',
      });
    };
    (button as HTMLButtonElement).click();
    requestAnimationFrame(captureFrame);
  }));
  expect(firstFrame.logoTop).toBe(90);
  expect(firstFrame.contextTop).toBe(90);
  expect(firstFrame.actionTop).toBe(90);
  expect(firstFrame.logoLeft).toBeGreaterThan(14);
  expect(firstFrame.logoLeft).toBeLessThan(300);
  expect(firstFrame.drawerVisible).toBe(true);
  await expect(page.locator('.memory-shell')).toHaveClass(/is-open/);
  await expect.poll(async () => (await logo.boundingBox())!.x).toBeGreaterThan(300);
  expect((await logo.boundingBox())!.y).toBe(90);
  expect((await context.boundingBox())!.y).toBe(90);
  expect((await action.boundingBox())!.y).toBe(90);
  await saveShot(page, 'drawer-status-bar-gap');
  await page.getByRole('button', { name: '关闭项目菜单', exact: true }).click();
  await expect.poll(async () => (await logo.boundingBox())!.x).toBe(14);
  expect((await logo.boundingBox())!.y).toBe(90);
  await expect(logo).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await logo.click();
  expect(await page.locator('.memory-shell').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  expect((await logo.boundingBox())!.y).toBe(90);
  await page.getByRole('button', { name: '关闭菜单', exact: true }).click({ position: { x: 35, y: 220 } });
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
  await expect(logo).toBeFocused();
  expect((await logo.boundingBox())!.y).toBe(90);
  await logo.click();
  await page.mouse.move(365, 250);
  await page.mouse.down();
  await page.mouse.move(220, 250, { steps: 6 });
  expect((await logo.boundingBox())!.y).toBe(90);
  await page.mouse.up();
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
  await expect(logo).toBeFocused();
  await navigate(page, '统计');
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'stats');
  expect((await logo.boundingBox())!.y).toBe(90);
  await logo.click();
  await page.setViewportSize({ width: 761, height: 852 });
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
  await noOverflow(page);
});

test('不透明固定顶栏与正文滚动分离，设置页、暗色和阅读保持安全区', async ({ page }) => {
  await seedPage(page);
  await page.locator('.memory-app').evaluate(element => {
    (element as HTMLElement).style.setProperty('--safe-inset-top', '59px');
    (element as HTMLElement).style.setProperty('--safe-bottom', '34px');
  });
  for (const [route, label] of [['home', '今日复习'], ['folders', '卡组目录'], ['settings', '设置与数据'], ['advanced', '设置与数据'], ['stats', '统计'], ['import', '导入']]) {
    await navigate(page, label);
    if (route === 'advanced') await page.locator('.m-top-action').click();
    await expect(page.locator('.memory-content')).toHaveAttribute('data-route', route);
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    for (const dark of [false, true]) {
      await page.locator('html').evaluate((element, value) => element.classList.toggle('dark', value), dark);
      const surface = await page.locator('.memory-bar').evaluate(element => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const app = document.querySelector('.memory-app')!;
        return {
          position: style.position,
          background: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          filter: style.filter,
          backdropFilter: style.backdropFilter,
          edgeInBar: element.contains(document.elementFromPoint(innerWidth / 2, 1)),
          appPosition: getComputedStyle(app).position,
          ancestorTransforms: (() => {
            const transforms: string[] = [];
            for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) transforms.push(getComputedStyle(ancestor).transform);
            return transforms;
          })(),
          contentTop: document.querySelector('.memory-content')!.getBoundingClientRect().y,
          bottom: box.bottom,
        };
      });
      expect(surface.position).toBe('fixed');
      expect(surface.appPosition).toBe('fixed');
      expect(surface.ancestorTransforms.every(transform => transform === 'none')).toBe(true);
      expect(surface.background).toBe(dark ? 'rgb(36, 36, 32)' : 'rgb(246, 245, 239)');
      expect(surface.backgroundImage).toBe('none');
      expect(surface.filter).toBe('none');
      expect(surface.backdropFilter).toBe('none');
      expect(surface.edgeInBar).toBe(true);
      expect(surface.contentTop).toBe(surface.bottom);
      expect(surface.bottom).toBe(131);
      expect((await page.locator('.m-brand').boundingBox())!.y).toBe(69);
      await page.locator('.memory-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect((await page.locator('.memory-content').boundingBox())!.y).toBe(131);
      expect((await page.locator('.m-brand').boundingBox())!.y).toBe(69);
      await noOverflow(page);
      if (route === 'advanced') await saveShot(page, `settings-top-surface-${dark ? 'dark' : 'light'}`);
    }
  }
  await page.locator('html').evaluate(element => element.classList.remove('dark'));
  await navigate(page, '今日复习');
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'home');
  await startReading(page);
  expect((await page.locator('.m-study').boundingBox())!.y).toBe(131);
  const readingBox = (await page.locator('.m-reading[data-active="true"]').boundingBox())!;
  expect(readingBox.y).toBeGreaterThanOrEqual(131);
  expect(readingBox.y + readingBox.height).toBeLessThanOrEqual(852 - 34);
  await noOverflow(page);
});

test('紧凑卡组目录、子树搜索、唯一筛选面板和底部复习入口', async ({ page }) => {
  await seedPage(page, fixture(), 'folders');
  const search = page.getByRole('searchbox', { name: '搜索当前范围及下级内容' });
  expect((await search.boundingBox())!.y).toBeLessThan(95);
  await page.locator('.m-folder-open').first().click();
  await search.fill('独立解释');
  await expect(page.locator('.memory-card-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '筛选与排序', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '筛选与排序', exact: true }).click();
  await page.getByRole('combobox', { name: '复习状态', exact: true }).selectOption('待复习');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.m-library-dock')).toBeVisible();
  await saveShot(page, 'library');
  await noOverflow(page);
});

test('手动创建卡组与卡片，编辑不重置复习字段', async ({ page }) => {
  await seedPage(page, fixture(), 'folders');
  await page.getByRole('button', { name: '添加', exact: true }).first().click();
  await page.getByRole('button', { name: '新建卡组', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('新的知识');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).decks.length).toBe(3);
  await page.getByRole('button', { name: '添加', exact: true }).first().click();
  await page.getByRole('button', { name: '添加卡片', exact: true }).click();
  await page.getByLabel('问题', { exact: true }).fill('新的问题');
  await page.getByLabel('答案', { exact: true }).fill('新的答案');
  await page.getByRole('button', { name: '保存卡片', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).cards.length).toBe(4);
  await navigate(page, '全部卡片');
  await page.getByRole('button', { name: '管理卡片：如何检查理解？', exact: true }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await page.getByRole('textbox', { name: '答案', exact: true }).fill('更新正文，但保留进度。');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  const updated = (await snapshot(page)).cards.find((card: { id: string }) => card.id === 'second');
  expect(updated.reps).toBe(fixture().cards[1].reps);
  expect(updated.nextReviewDate).toBe(at);
});

test('长正反面仅卡片内部滚动，纵向手势不翻面或评分', async ({ page, browserName, context }) => {
  await seedPage(page);
  await startReading(page);
  const face = page.locator('.m-reading[data-active="true"]');
  expect(await face.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  if (browserName === 'chromium') {
    const client = await context.newCDPSession(page);
    const box = (await face.boundingBox())!;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 100, y: box.y + box.height - 40 }] });
    for (let step = 1; step < 9; step++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 100, y: box.y + box.height - 40 - step * 24 }] }); await page.waitForTimeout(25); }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await face.evaluate(element => { const box = element.getBoundingClientRect(); element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: box.x + 60, clientY: box.y + 250 })); element.scrollTop = 200; element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: box.x + 62, clientY: box.y + 50 })); element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: box.x + 62, clientY: box.y + 50 })); });
  }
  await expect.poll(async () => face.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '显示答案', exact: true })).toBeVisible();
  expect((await snapshot(page)).reviewLogs).toHaveLength(0);
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  expect(await face.evaluate(element => element.scrollTop)).toBe(0);
  expect(await face.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await saveShot(page, 'reader');
  await noOverflow(page);
});

test('固定四档预览、按点击时间调度、撤销评分与刷新持久化', async ({ page }) => {
  await seedPage(page);
  await startReading(page);
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  for (const [rating, text] of [['again', '1 分钟'], ['hard', '1 天'], ['good', '30 天'], ['easy', '180 天']]) {
    await expect(page.locator(`[data-rating="${rating}"]`)).toContainText(text);
    const box = (await page.locator(`[data-rating="${rating}"]`).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.waitForTimeout(1000);
  const clickedAt = Date.now();
  await page.locator('[data-rating="again"]').click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(1);
  const card = (await snapshot(page)).cards.find((item: { id: string }) => item.id === 'first');
  expect(Date.parse(card.nextReviewDate) - clickedAt).toBeGreaterThanOrEqual(59000);
  expect(Date.parse(card.nextReviewDate) - clickedAt).toBeLessThan(64000);
  await page.getByRole('button', { name: '撤销上次评分', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(0);
  expect((await snapshot(page)).cards.find((item: { id: string }) => item.id === 'first').reps).toBe(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  expect((await snapshot(page)).settings.reviewPlan.mode).toBe('fixed');
});

test('复习计划配置保留既有排期，只改变未来评分', async ({ page }) => {
  await seedPage(page, fixture(), 'settings');
  await page.getByRole('button', { name: '配置', exact: true }).click();
  await saveShot(page, 'review-plan');
  await page.getByRole('radio', { name: /智能/ }).check();
  await page.getByRole('button', { name: /保存/ }).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).settings.reviewPlan.mode).toBe('smart');
  expect((await snapshot(page)).cards[0].nextReviewDate).toBe(at);
});

test('本机备份和迁移副本不携带同步密钥，保留卡片与复习计划', async ({ page }) => {
  const data = fixture();
  const testKey = 'a'.repeat(64);
  data.settings.syncCode = testKey;
  data.settings.syncEnabled = false;
  data.settings.syncRelayUrl = 'https://example.invalid/test-relay';
  data.cards[2].sourceRef = { provider: 'weread', bookId: 'test-book', bookmarkId: 'test-mark' };
  await seedPage(page, data, 'settings');
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '备份', exact: true }).click();
  const download = await pendingDownload;
  const file = await download.path();
  expect(file).not.toBeNull();
  const text = await readFile(file!, 'utf8');
  const exported = JSON.parse(text);
  expect(text).not.toContain(testKey);
  expect(exported.settings.syncCode).toBeNull();
  expect(exported.settings.syncEnabled).toBe(false);
  expect(exported.settings.syncRelayUrl).toBe('');
  expect(exported.settings.reviewPlan).toEqual(data.settings.reviewPlan);
  expect(exported.cards[2].archivedAt).toBe(at);
  expect(exported.cards[2].sourceRef).toEqual(data.cards[2].sourceRef);
  await navigate(page, '今日复习');
  await startReading(page);
  await page.getByRole('button', { name: '归档当前卡片', exact: true }).click();
  await expect.poll(async () => !!(await snapshot(page)).cards[0].archivedAt).toBe(true);
  const backup = await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.pre-folders.v1') || 'null'));
  expect(backup.settings.syncCode).toBeNull();
  expect(backup.settings.syncEnabled).toBe(false);
  expect(backup.settings.syncRelayUrl).toBe('');
});

test('旧卡片无效排期仅阻止评分，仍能阅读与归档且不改写进度', async ({ page }) => {
  const data = fixture();
  data.cards[1].difficulty = 0.8;
  await seedPage(page, data);
  await startReading(page);
  await page.getByRole('button', { name: '下一张', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('暂不能评分');
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await expect(page.locator('.m-reading[data-active="true"]')).toContainText('合上材料，独立解释');
  await expect(page.locator('[data-rating="good"]')).toBeDisabled();
  await page.getByRole('button', { name: '归档当前卡片', exact: true }).click();
  await expect.poll(async () => !!(await snapshot(page)).cards[1].archivedAt).toBe(true);
  expect((await snapshot(page)).cards[1].difficulty).toBe(0.8);
  expect((await snapshot(page)).reviewLogs).toHaveLength(0);
});

test('归档切到下一张，3秒内撤销回到原卡且保留进度历史', async ({ page }) => {
  await seedPage(page);
  await startReading(page);
  await page.getByRole('button', { name: '归档当前卡片', exact: true }).click();
  await expect.poll(async () => !!(await snapshot(page)).cards[0].archivedAt).toBe(true);
  await expect(page.locator('.m-reading[data-active="true"]')).toContainText('如何检查理解');
  await page.getByRole('button', { name: /撤销归档，剩余/ }).click();
  await expect(page.locator('.m-reading[data-active="true"]')).toContainText('为什么主动回忆');
  expect((await snapshot(page)).cards[0].archivedAt).toBeUndefined();
  expect((await snapshot(page)).cards[0].reps).toBe(0);
  expect((await snapshot(page)).reviewLogs).toHaveLength(0);
});

test('整组归档先确认范围，取消和关闭不写入且保护未保存修改', async ({ page }) => {
  await seedPage(page, folderArchiveFixture());
  const before = await snapshot(page);
  await page.getByRole('button', { name: '管理回忆方法', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('包含所有子卡组，共 3 张在学卡片');
  await saveShot(page, 'folder-archive-manage');
  await page.getByRole('button', { name: '归档整个卡组', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('已归档卡片不受影响');
  await page.getByRole('button', { name: '取消，返回管理', exact: true }).click();
  await page.getByLabel('名称', { exact: true }).fill('未保存的名称');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '归档整个卡组', exact: true }).click();
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('未保存的名称');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '归档整个卡组', exact: true }).click();
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await expect(page.getByRole('button', { name: '管理回忆方法', exact: true })).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
  await noOverflow(page);
});

test('整组归档包含深层卡片且仅一次撤销本批，原归档与其他卡组保留', async ({ page }) => {
  await seedPage(page, folderArchiveFixture());
  const before = await snapshot(page);
  await page.getByRole('button', { name: '管理回忆方法', exact: true }).click();
  await page.getByRole('button', { name: '归档整个卡组', exact: true }).click();
  await saveShot(page, 'folder-archive-confirm');
  await page.getByRole('button', { name: '确认归档 3 张卡片', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toHaveCount(0);
  const archived = await snapshot(page);
  for (const index of [0, 1, 3]) expect(archived.cards[index]).toEqual({ ...before.cards[index], archivedAt: archived.cards[0].archivedAt });
  expect(archived.cards[2]).toEqual(before.cards[2]);
  expect(archived.cards[4]).toEqual(before.cards[4]);
  expect(archived.decks).toEqual(before.decks);
  expect(archived.reviewLogs).toEqual(before.reviewLogs);
  await page.getByRole('button', { name: /撤销归档，剩余/ }).click();
  await expect.poll(async () => (await snapshot(page)).cards).toEqual(before.cards);
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toHaveCount(1);
  const restored = await snapshot(page);
  expect(restored.decks).toEqual(before.decks);
  expect(restored.reviewLogs).toEqual(before.reviewLogs);
  expect(restored.studySessions).toEqual(before.studySessions);
  expect(restored.settings).toMatchObject(before.settings);
  await noOverflow(page);
});

test('整组归档刷新后移到归档目录，可切换仅卡片逐张恢复', async ({ page }) => {
  await seedPage(page, folderArchiveFixture());
  const before = await snapshot(page);
  await page.getByRole('button', { name: '管理回忆方法', exact: true }).click();
  await page.getByRole('button', { name: '归档整个卡组', exact: true }).click();
  await page.getByRole('button', { name: '确认归档 3 张卡片', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.m-archive-undo')).toBeVisible();
  await expect(page.locator('.m-archive-undo')).toHaveCount(0, { timeout: 5000 });
  const archived = await snapshot(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  expect(await snapshot(page)).toEqual(archived);
  await expect(page.getByRole('button', { name: '管理回忆方法', exact: true })).toHaveCount(0);
  await navigate(page, '已归档');
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toHaveCount(1);
  await expect(page.locator('.memory-card-row')).toHaveCount(0);
  await page.getByRole('button', { name: '筛选与排序', exact: true }).click();
  await page.getByLabel('内容', { exact: true }).selectOption('仅卡片');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.memory-card-row')).toHaveCount(4);
  await page.locator('[data-card-id="second"]').getByRole('button', { name: '移出归档', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).cards[1]).toEqual(before.cards[1]);
  const restored = await snapshot(page);
  expect(restored.cards[1]).toEqual(before.cards[1]);
  expect(restored.cards[0]).toEqual(archived.cards[0]);
  await navigate(page, '今日复习');
  await page.getByRole('button', { name: '管理回忆方法', exact: true }).click();
  await expect(page.getByRole('button', { name: '归档整个卡组', exact: true })).toBeEnabled();
  await noOverflow(page);
});

test('归档目录兼容已有整组归档，保留空卡组并按层级浏览和整组恢复', async ({ page }) => {
  const data = folderArchiveFixture();
  data.cards = data.cards.map(card => card.deckId === 'outside' ? card : { ...card, archivedAt: '2026-11-02T00:00:00.000Z' });
  data.decks.push({ ...data.decks[0], id: 'empty', name: '空卡组', parentId: 'outside' });
  data.decks.push({ ...data.decks[0], id: 'archived-empty', name: '归档空子卡组', parentId: 'root' });
  await seedPage(page, data, 'folders');
  const before = await snapshot(page);
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toHaveCount(0);
  await page.locator('.m-folder[data-folder-id="outside"] .m-folder-open').click();
  await expect(page.locator('.m-folder[data-folder-id="empty"]')).toBeVisible();
  await page.getByRole('button', { name: '管理空卡组', exact: true }).click();
  await expect(page.getByRole('button', { name: '归档整个卡组', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await navigate(page, '今日复习');
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toHaveCount(0);
  await navigate(page, '已归档');
  await expect(page.locator('.m-folder')).toHaveCount(1);
  await expect(page.locator('.memory-card-row')).toHaveCount(0);
  await page.getByRole('searchbox').fill('深层问题');
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toHaveCount(1);
  await expect(page.locator('.memory-card-row')).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('searchbox').fill('归档空子卡组');
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await page.locator('.m-folder[data-folder-id="root"] .m-folder-open').click();
  await expect(page.locator('.m-folder[data-folder-id="archived-empty"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '移出归档卡组：归档空子卡组', exact: true })).toBeDisabled();
  await expect(page.locator('.m-folder[data-folder-id="leaf"]')).toBeVisible();
  await expect(page.locator('[data-card-id="first"]')).toBeVisible();
  await page.locator('.m-folder[data-folder-id="leaf"] .m-folder-open').click();
  await expect(page.locator('.m-folder[data-folder-id="deep"]')).toBeVisible();
  await expect(page.locator('.memory-card-row')).toHaveCount(2);
  await page.locator('.m-folder[data-folder-id="deep"] .m-folder-open').click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.m-context')).toHaveText('阅读练习');
  await page.getByRole('button', { name: '整组移出归档', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('3 张归档卡片');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '全部归档', exact: true }).click();
  await page.getByRole('button', { name: '移出归档卡组：回忆方法', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('4 张归档卡片');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '移出归档卡组：回忆方法', exact: true }).click();
  await page.getByRole('button', { name: '确认移出归档 4 张卡片', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const restored = await snapshot(page);
  expect(restored.decks).toEqual(before.decks);
  expect(restored.reviewLogs).toEqual(before.reviewLogs);
  expect(restored.cards[4]).toEqual(before.cards[4]);
  for (const index of [0, 1, 2, 3]) {
    const expected = { ...before.cards[index] };
    delete expected.archivedAt;
    expect(restored.cards[index]).toEqual(expected);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  expect(await snapshot(page)).toEqual(restored);
  await navigate(page, '卡组目录');
  await expect(page.locator('.m-folder[data-folder-id="root"]')).toBeVisible();
  await noOverflow(page);
  await saveShot(page, 'archive-folder-restored');
});

test('归档复用内容筛选排序，默认分组不重复卡片并使用归档时间', async ({ page }) => {
  const data = folderArchiveFixture();
  data.cards = data.cards.map(card => card.deckId === 'outside' ? card : { ...card, archivedAt: '2026-11-02T00:00:00.000Z' });
  data.decks.push({ ...data.decks[0], id: 'older', name: '较早归档', parentId: null, importedAt: '2030-01-01T00:00:00.000Z' });
  data.cards.push({ ...data.cards[4], id: 'older-card', deckId: 'older', archivedAt: '2026-11-01T00:00:00.000Z' },
                  { ...data.cards[4], id: 'loose', front: '单独归档卡片', archivedAt: '2026-11-03T00:00:00.000Z' });
  await seedPage(page, data, 'archived');
  await expect(page.locator('.m-folder')).toHaveCount(2);
  await expect(page.locator('.m-folder').first()).toHaveAttribute('data-folder-id', 'root');
  await expect(page.locator('.memory-card-row')).toHaveCount(1);
  await expect(page.locator('[data-card-id="loose"]')).toBeVisible();
  await page.getByRole('button', { name: '筛选与排序', exact: true }).click();
  await expect(page.getByLabel('复习状态', { exact: true })).toBeVisible();
  await page.getByLabel('内容', { exact: true }).selectOption('仅卡组');
  await page.getByLabel('排序', { exact: true }).selectOption('old');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.memory-card-row')).toHaveCount(0);
  await expect(page.locator('.m-folder').first()).toHaveAttribute('data-folder-id', 'older');
  await page.getByRole('button', { name: '筛选与排序', exact: true }).click();
  await page.getByLabel('内容', { exact: true }).selectOption('仅卡片');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.m-folder')).toHaveCount(0);
  await expect(page.locator('.memory-card-row')).toHaveCount(6);
  await expect(page.locator('.memory-card-row').first()).toHaveAttribute('data-card-id', 'older-card');
  await expect(page.locator('.memory-card-row').last()).toHaveAttribute('data-card-id', 'loose');
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page.locator('.m-folder')).toHaveCount(2);
  await expect(page.locator('.memory-card-row')).toHaveCount(1);
  await noOverflow(page);
  await saveShot(page, 'archive-folder-catalog');
});

test('归档复习状态筛选使用保留进度和排期，不恢复或评分卡片', async ({ page }) => {
  const data = fixture();
  data.cards = data.cards.map(card => ({ ...card, archivedAt: at }));
  data.cards[1] = { ...data.cards[1], state: 'learning' };
  data.cards[2] = { ...data.cards[2], state: 'review', nextReviewDate: '2100-01-01T00:00:00.000Z' };
  await seedPage(page, data, 'archived');
  const before = await snapshot(page);
  for (const [status, expected] of [['待学习', 'first'], ['待复习', 'second'], ['已熟悉', 'archived']]) {
    await page.getByRole('button', { name: '筛选与排序', exact: true }).click();
    await page.getByLabel('内容', { exact: true }).selectOption('仅卡片');
    await page.getByLabel('复习状态', { exact: true }).selectOption(status);
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.memory-card-row')).toHaveCount(1);
    await expect(page.locator('.memory-card-row')).toHaveAttribute('data-card-id', expected);
  }
  await page.getByRole('button', { name: '筛选与排序', exact: true }).click();
  await page.getByLabel('内容', { exact: true }).selectOption('仅卡组');
  await page.getByLabel('复习状态', { exact: true }).selectOption('待复习');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.m-folder')).toHaveCount(1);
  await expect(page.locator('.memory-card-row')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  await noOverflow(page);
});

test('归档卡组筛选与恢复在安全区窄屏断点和横屏保持可触达', async ({ page }) => {
  const data = folderArchiveFixture();
  data.cards = data.cards.map(card => card.deckId === 'outside' ? card : { ...card, archivedAt: '2026-11-02T00:00:00.000Z' });
  await seedPage(page, data, 'archived');
  for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 852 }, { width: 760, height: 852 }, { width: 761, height: 852 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-top', '59px'); (element as HTMLElement).style.setProperty('--safe-bottom', '34px'); });
    for (const name of ['筛选与排序', '移出归档卡组：回忆方法']) {
      const button = page.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await button.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: '关闭面板', exact: true }).click();
      await expect(button).toBeFocused();
    }
    await noOverflow(page);
  }
});

test('整组归档面板在安全区、窄屏和断点保持可读可触达', async ({ page }) => {
  await seedPage(page, folderArchiveFixture());
  for (const width of [393, 320, 760, 761]) {
    await page.setViewportSize({ width, height: 852 });
    await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-top', '59px'); (element as HTMLElement).style.setProperty('--safe-bottom', '34px'); });
    await page.getByRole('button', { name: '管理回忆方法', exact: true }).click();
    const button = page.getByRole('button', { name: '归档整个卡组', exact: true });
    await expect(button).toBeInViewport();
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(page.getByRole('button', { name: '确认归档 3 张卡片', exact: true })).toBeInViewport();
    await noOverflow(page);
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  }
});

test('后悔药到期后通过独立归档库查看原文并恢复', async ({ page }) => {
  await seedPage(page);
  await startReading(page);
  await page.getByRole('button', { name: '归档当前卡片', exact: true }).click();
  await expect(page.locator('.m-archive-undo')).toBeVisible();
  await expect(page.locator('.m-archive-undo')).toHaveCount(0, { timeout: 5000 });
  await navigate(page, '已归档');
  await expect(page.locator('.memory-card-row')).toHaveCount(2);
  await page.locator('[data-card-id="first"] .m-card-open').click();
  await expect(page.getByRole('dialog')).toContainText('因为复述会暴露遗漏');
  await page.getByRole('dialog').getByRole('button', { name: '移出归档', exact: true }).click();
  await expect.poll(async () => !!(await snapshot(page)).cards[0].archivedAt).toBe(false);
  expect((await snapshot(page)).cards[0].nextReviewDate).toBe(at);
  await saveShot(page, 'archive');
});

test('连续归档仅撤销最近一张，最后一张归档后可恢复', async ({ page }) => {
  await seedPage(page);
  await startReading(page);
  await page.getByRole('button', { name: '归档当前卡片', exact: true }).click();
  await expect(page.locator('.m-reading[data-active="true"]')).toContainText('如何检查理解');
  await page.getByRole('button', { name: '归档当前卡片', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本轮完成' })).toBeVisible();
  await page.getByRole('button', { name: /撤销归档，剩余/ }).click();
  await expect(page.locator('.m-reading[data-active="true"]')).toContainText('如何检查理解');
  expect((await snapshot(page)).cards[0].archivedAt).toBeTruthy();
  expect((await snapshot(page)).cards[1].archivedAt).toBeUndefined();
});

test('归档后继续评分再撤销归档，不覆盖新评分记录', async ({ page }) => {
  await seedPage(page);
  await startReading(page);
  await page.getByRole('button', { name: '归档当前卡片', exact: true }).click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await page.locator('[data-rating="good"]').click();
  await page.getByRole('button', { name: /撤销归档，剩余/ }).click();
  await expect.poll(async () => (await snapshot(page)).cards[0].archivedAt).toBeUndefined();
  const data = await snapshot(page);
  expect(data.cards[0].archivedAt).toBeUndefined();
  expect(data.reviewLogs).toHaveLength(1);
  expect(data.reviewLogs[0].cardId).toBe('second');
});

test('Markdown预览、增量更新与归档状态和排期保留', async ({ page }) => {
  await seedPage(page, fixture(), 'import');
  const file = (back: string) => ({ name: 'test.md', mimeType: 'text/markdown', buffer: Buffer.from(`# 测试书\n\n<!-- recall:card {"id":"markdown-card"} -->\n问题：测试问题\n\n${back}\n\n<!-- recall:end -->\n`) });
  await page.locator('input[type="file"]').setInputFiles(file('原始正文'));
  await expect(page.getByText('原始正文', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  expect((await snapshot(page)).cards).toHaveLength(4);
  const stored = await snapshot(page);
  const imported = stored.cards.find((card: { front: string }) => card.front === '测试问题');
  imported.archivedAt = at; imported.reps = 7; imported.nextReviewDate = '2027-01-01T00:00:00.000Z';
  await seedPage(page, stored, 'import');
  await page.locator('input[type="file"]').setInputFiles(file('更新正文'));
  await expect(page.getByText('检测到变化', { exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  const updated = (await snapshot(page)).cards.find((card: { id: string }) => card.id === imported.id);
  expect(updated.back).toBe('更新正文'); expect(updated.reps).toBe(7); expect(updated.archivedAt).toBe(at); expect(updated.nextReviewDate).toBe('2027-01-01T00:00:00.000Z');
});

test('微信读书按书导入、章节元数据、原文不改写及重复导入保留状态', async ({ page }) => {
  await seedPage(page, fixture(), 'weread');
  await page.getByRole('button', { name: '其他导入方式', exact: true }).click();
  const markText = '  原文第一行。\n\n原文第二行。  ';
  const file = { name: 'weread.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ bookId: 'book-test', title: '测试书', highlights: [{ bookmarkId: 'highlight-1', markText, chapterUid: 'chapter-1', chapterTitle: '第一章', question: '这个结论的条件是什么？', recallKind: 'qa' }] }] })) };
  async function load() {
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '预览并编辑回忆卡', exact: true }).click();
    await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
    await saveShot(page, 'weread-preview');
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'folders');
  }
  await load();
  const stored = await snapshot(page);
  const imported = stored.cards.find((card: { sourceRef?: { bookId: string } }) => card.sourceRef?.bookId === 'book-test');
  expect(imported.back).toBe(markText); expect(imported.chapter).toBe('第一章');
  expect(stored.decks.filter((deck: { name: string }) => deck.name === '第一章')).toHaveLength(0);
  imported.archivedAt = at; imported.reps = 8;
  await seedPage(page, stored, 'weread');
  await page.getByRole('button', { name: '其他导入方式', exact: true }).click();
  await load();
  const updated = (await snapshot(page)).cards.find((card: { id: string }) => card.id === imported.id);
  expect(updated.back).toBe(markText); expect(updated.archivedAt).toBe(at); expect(updated.reps).toBe(8);
  expect((await snapshot(page)).cards).toHaveLength(4);
});

test('带凭证的微信读书文件被拒绝，不落库', async ({ page }) => {
  await seedPage(page, fixture(), 'weread');
  await page.getByRole('button', { name: '其他导入方式', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'recall-weread-export-v1', apiKey: 'test-only-not-a-real-key', books: [] })) });
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await snapshot(page)).cards).toHaveLength(3);
});

test('安全区、窄屏、760断点、横屏和桌面无溢出或固定控件覆盖', async ({ page }) => {
  await seedPage(page);
  await startReading(page);
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-inset-top', '59px'); (element as HTMLElement).style.setProperty('--safe-bottom', '34px'); });
  const button = (await page.locator('[data-rating="good"]').boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(852 - 34);
  expect((await page.locator('.m-brand').boundingBox())!.y).toBe(69);
  await saveShot(page, 'safe-areas');
  for (const size of [{ width: 320, height: 568 }, { width: 760, height: 852 }, { width: 761, height: 852 }, { width: 852, height: 393 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await noOverflow(page);
    const footer = (await page.locator('.m-study-footer').boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(size.height + 1);
    expect((await page.locator('.m-card-window').boundingBox())!.height).toBeGreaterThan(40);
  }
});

test('表单焦点约束、Escape关闭和来源字号保留', async ({ page }) => {
  await seedPage(page);
  await startReading(page);
  await page.getByRole('button', { name: '卡片与复习选项', exact: true }).click();
  await page.getByRole('button', { name: '阅读字号', exact: true }).click();
  await page.getByRole('combobox', { name: '正文字号', exact: true }).selectOption('22');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '卡片与复习选项', exact: true })).toBeFocused();
  expect(await page.locator('.m-reading[data-active="true"]').evaluate(element => getComputedStyle(element).fontSize)).toBe('22px');
});

test('PWA部署路径manifest、Service Worker及断网重开和复习持久化', async ({ page, context, browserName, baseURL }) => {
  const basePath = new URL('./', baseURL || 'http://127.0.0.1:4193/').pathname;
  const isolated = browserName === 'webkit' ? await serveIsolatedBuild(basePath) : null;
  try {
  const offlineFixture = fixture();
  offlineFixture.cards[0].front += '\n\n$$\\frac{x^2}{2} + \\sqrt{y}$$';
  await seedPage(page, offlineFixture, 'home', isolated?.url || './');
  const url = new URL(await page.locator('link[rel="manifest"]').getAttribute('href') || '', page.url());
  const response = await context.request.get(url.href);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone'); expect(manifest.theme_color).toBe('#353532');
  const base = new URL('./', page.url()).pathname;
  expect(manifest.start_url).toBe(base); expect(manifest.scope).toBe(base);
  for (const icon of manifest.icons) expect((await context.request.get(new URL(icon.src, page.url()).href)).status()).toBe(200);
  await waitForReadiness(page, 'sw-active-before-offline', state => state.serviceWorker.active === 'activated', 20000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /\/assets\/(?:memory-reader|memory-stats|settings|import-hub)-[^/]+\.js$/.test(new URL(entry.name).pathname)).length)).toBe(0);
  if (isolated) {
    await isolated.stop();
    await expect(context.request.get(isolated.url + 'uncached-offline-probe', { timeout: 1000 })).rejects.toThrow();
  } else await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await expect(page.getByRole('heading', { name: '今天，温习一点。' })).toBeVisible();
  await startReading(page);
  await expect(page.locator('.m-reading[data-active="true"] .katex')).toHaveCount(1);
  expect(await page.evaluate(async () => { await document.fonts.ready; return Array.from(document.fonts).some(font => font.family === 'KaTeX_Math' && font.status === 'loaded'); })).toBe(true);
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await page.locator('[data-rating="good"]').click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(1);
  await saveShot(page, 'offline');
  await navigate(page, '设置与数据');
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'settings');
  await expect(page.getByRole('button', { name: '备份', exact: true })).toBeVisible();
  await page.locator('.m-top-action').click();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'advanced');
  await expect(page.locator('.memory-content').getByRole('heading', { level: 1 })).toBeVisible();
  await navigate(page, '导入');
  await expect(page.getByRole('button', { name: '选择 Markdown 文件', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '其他导入：CSV / Anki / Recall', exact: true }).click();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'compat');
  await expect(page.locator('.memory-content').getByRole('heading', { level: 1 })).toBeVisible();
  await navigate(page, '统计');
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'stats');
  await expect(page.getByRole('heading', { name: '复习量', exact: true })).toBeVisible();
  expect((await snapshot(page)).reviewLogs).toHaveLength(1);
  await noOverflow(page);
  } finally { await context.setOffline(false); await isolated?.stop(); }
});
