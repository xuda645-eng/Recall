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
  return { ...seed, decks, cards, reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true, reviewPlan: { mode: 'fixed' as const, intervals: { again: 60000, hard: 86400000, good: 2592000000, easy: 15552000000 } } } };
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
async function serveIsolatedBuild(basePath: string) {
  const root = resolve(process.cwd(), 'dist');
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (!pathname.startsWith(basePath)) { response.writeHead(404).end(); return; }
      const file = resolve(root, pathname === basePath ? 'index.html' : decodeURIComponent(pathname.slice(basePath.length)));
      if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
      const contents = await readFile(file);
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
  await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-inset-top', '59px'); });
  for (const dark of [false, true]) {
    await page.locator('html').evaluate((element, value) => element.classList.toggle('dark', value), dark);
    const surface = await edge.evaluate(element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { parentIsBody: element.parentElement === document.body, childCount: element.childNodes.length, display: style.display, position: style.position, color: style.backgroundColor, clip: style.backgroundClip, pointerEvents: style.pointerEvents, zIndex: style.zIndex, filter: style.filter, backdrop: style.backdropFilter, x: box.x, y: box.y, width: box.width, height: box.height, ancestorTransforms: [document.body, document.documentElement].map(ancestor => getComputedStyle(ancestor).transform) };
    });
    expect(surface).toEqual({ parentIsBody: true, childCount: 0, display: 'block', position: 'fixed', color: dark ? 'rgb(36, 36, 32)' : 'rgb(246, 245, 239)', clip: 'text', pointerEvents: 'none', zIndex: '2147483647', filter: 'none', backdrop: 'none', x: 0, y: 0, width: 393, height: 11, ancestorTransforms: ['none', 'none'] });
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
  for (const [route, label] of [['home', '今日复习'], ['folders', '我的卡组'], ['settings', '设置与数据'], ['advanced', '设置与数据'], ['stats', '统计'], ['import', '导入']]) {
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
  await page.getByLabel('问题或段落标题（摘录可空）', { exact: true }).fill('新的问题');
  await page.getByLabel('正文', { exact: true }).fill('新的答案');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).cards.length).toBe(4);
  await navigate(page, '全部卡片');
  await page.getByRole('button', { name: '管理卡片：如何检查理解？', exact: true }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await page.getByRole('textbox', { name: '正文', exact: true }).fill('更新正文，但保留进度。');
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
  await load();
  const updated = (await snapshot(page)).cards.find((card: { id: string }) => card.id === imported.id);
  expect(updated.back).toBe(markText); expect(updated.archivedAt).toBe(at); expect(updated.reps).toBe(8);
  expect((await snapshot(page)).cards).toHaveLength(4);
});

test('带凭证的微信读书文件被拒绝，不落库', async ({ page }) => {
  await seedPage(page, fixture(), 'weread');
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
