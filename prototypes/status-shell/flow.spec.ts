import { expect, test } from '@playwright/test';

for (const variant of ['d', 'e']) {
  test(`${variant}: real shell, mode, geometry, drawer and network fence`, async ({ page, baseURL }) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
    await page.goto(`/?case=${variant}#home`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.memory-app')).toBeVisible();
    await expect(page.locator('.shell-probe')).toContainText('当前：主屏幕 PWA');
    await expect(page.locator(`[data-probe-case="${variant}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: '今天，温习一点。', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '合成对照组 1 6 张卡片 6 待学习', exact: true })).toBeVisible();
    await page.evaluate(() => document.querySelector<HTMLElement>('.memory-app')!.style.setProperty('--safe-inset-top', '59px'));
    expect(await page.locator('.m-brand').evaluate(element => element.getBoundingClientRect().top)).toBe(69);
    expect(await page.locator('.m-brand').evaluate(element => element.getBoundingClientRect().width)).toBe(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).overscrollBehaviorY)).toBe('none');
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe(variant === 'e' ? 'rgb(246, 245, 239)' : 'rgb(249, 250, 251)');
    await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
    await expect(page.locator('.memory-shell')).toHaveClass(/is-open/);
    await page.getByRole('button', { name: '关闭项目菜单', exact: true }).click();
    await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
    const fence = await page.evaluate(async () => ({
      local: (await fetch('/api/auth/session')).status,
      external: (await fetch('https://recall-memory.pages.dev/api/auth/session')).status,
    }));
    expect(fence).toEqual({ local: 503, external: 503 });
    expect(requests.every(url => new URL(url).origin === new URL(baseURL!).origin)).toBe(true);
    expect(requests.some(url => new URL(url).pathname.startsWith('/api/'))).toBe(false);
    expect(errors).toEqual([]);
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    await page.screenshot({ path: `test-results/status-shell/${variant}.png` });
  });
}

test('separate installation identity, D/E navigation and full offline shell', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'macOS WebKit offline emulation does not prove physical iPhone behavior');
  await page.goto('/?case=d#home', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.shell-probe')).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)).json());
  expect(manifest.id).toBe('/recall-shell-probe-20261101');
  expect(manifest.display).toBe('standalone');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: process.env.STATUS_SHELL_URL ? 240000 : 20000 }).toBe(true);
  await context.setOffline(true);
  await page.locator('[data-probe-case="e"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-shell-probe', 'e');
  await expect(page.locator('.memory-app')).toBeVisible();
  await page.locator('[data-probe-case="d"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-shell-probe', 'd');
  await expect(page.locator('.memory-app')).toBeVisible();
});
