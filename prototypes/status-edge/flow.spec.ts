import { expect, test } from '@playwright/test';

for (const variant of ['a', 'b', 'c']) {
  test(`${variant}: geometry, scroll, drawer, diagnostics and isolated requests`, async ({ page, baseURL }) => {
    const failures: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
    await page.goto(`/?case=${variant}`);
    await expect(page.locator('#case-title')).toContainText(variant.toUpperCase());
    await expect(page.locator('#mode')).toContainText('主屏幕 PWA');
    await expect(page.locator('body')).toHaveAttribute('data-cache-ready', 'true');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    for (const inset of [0, 20, 59, 96]) {
      await page.evaluate(value => {
        document.documentElement.style.setProperty('--safe-top', `${value}px`);
        document.documentElement.style.setProperty('--safe-bottom', '34px');
      }, inset);
      const geometry = await page.locator('.bar').evaluate(bar => {
        const boxes = [...bar.children].map(child => child.getBoundingClientRect().toJSON());
        const edge = document.querySelector('.status-edge')!.getBoundingClientRect();
        return { boxes, edgeBottom: edge.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      for (const box of geometry.boxes) {
        expect(box.y).toBe(inset + 10);
        expect(box.height).toBe(48);
      }
      expect(geometry.boxes[0].width).toBe(48);
      expect(geometry.boxes[1].x - geometry.boxes[0].right).toBe(8);
      expect(geometry.boxes[2].x - geometry.boxes[1].right).toBe(8);
      expect(geometry.overflow).toBe(false);
      if (variant === 'b') expect(geometry.edgeBottom).toBe(geometry.boxes[0].y);
    }
    await page.evaluate(selected => {
      if (selected === 'c') window.scrollTo(0, 250);
      else document.querySelector('.content')!.scrollTop = 250;
    }, variant);
    const scroll = await page.evaluate(() => ({ root: scrollY, content: document.querySelector('.content')!.scrollTop }));
    expect(variant === 'c' ? scroll.root : scroll.content).toBe(250);
    expect(variant === 'c' ? scroll.content : scroll.root).toBe(0);
    await expect.poll(() => page.locator('#brand').evaluate(element => element.getBoundingClientRect().top)).toBe(106);
    await page.getByRole('button', { name: '打开对照菜单' }).click();
    await expect(page.locator('#brand')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#close-drawer')).toBeFocused();
    await expect.poll(() => page.locator('#brand').evaluate(element => element.getBoundingClientRect().left)).toBeCloseTo(336.25, 0);
    await expect(page.locator('.content')).toHaveAttribute('inert', '');
    await page.locator('#brand').click();
    await expect(page.locator('#brand')).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: '打开对照菜单' }).click();
    await page.getByRole('button', { name: '返回对照页' }).click();
    await expect(page.locator('#brand')).toBeFocused();
    await page.getByRole('button', { name: '打开对照菜单' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#brand')).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: '打开对照菜单' }).click();
    await page.getByRole('button', { name: '关闭对照菜单', exact: true }).last().click();
    await expect(page.locator('#brand')).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: '显示测试说明' }).click();
    await expect(page.locator('#mode')).toContainText('加号触摸正常');
    await page.getByText('查看本机诊断信息').click();
    await expect(page.locator('#diagnostics')).toContainText('"navigatorStandalone": true');
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(requests.every(url => url.startsWith(baseURL!))).toBe(true);
    expect(requests.some(url => new URL(url).pathname.startsWith('/api'))).toBe(false);
    expect(failures).toEqual([]);
  });

  test(`${variant}: first animation frame and rapid toggles keep the same Logo with the foreground`, async ({ page }) => {
    await page.goto(`/?case=${variant}`);
    const first = await page.evaluate(async () => {
      const brand = document.querySelector<HTMLButtonElement>('#brand')!;
      brand.click();
      await new Promise(requestAnimationFrame);
      const shell = document.querySelector('.shell')!.getBoundingClientRect();
      return { relativeLogoLeft: brand.getBoundingClientRect().left - shell.left, logoTop: brand.getBoundingClientRect().top, drawerVisible: getComputedStyle(document.querySelector('.drawer')!).visibility };
    });
    expect(first.relativeLogoLeft).toBeCloseTo(14, 1);
    expect(first.logoTop).toBe(10);
    expect(first.drawerVisible).toBe('visible');
    await page.evaluate(() => {
      const brand = document.querySelector<HTMLButtonElement>('#brand')!;
      for (let count = 0; count < 7; count += 1) brand.click();
    });
    await expect(page.locator('#brand')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => page.locator('.shell').evaluate(element => getComputedStyle(element).transform)).toBe('none');
    await expect(page.locator('#brand')).toBeFocused();
  });
}

test('browser-mode warning, full navigation and narrow/landscape/reduced-motion layouts', async ({ page }) => {
  await page.goto('/?case=invalid');
  await expect(page.locator('#case-title')).toContainText('A');
  await expect(page.locator('#mode')).toContainText('浏览器标签页');
  for (const width of [320, 393, 760, 761, 852]) {
    await page.setViewportSize({ width, height: width === 852 ? 393 : 852 });
    for (const variant of ['a', 'b', 'c']) {
      await page.goto(`/?case=${variant}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('#brand').evaluate(element => element.getBoundingClientRect().width)).toBe(48);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '打开对照菜单' }).click();
  expect(await page.locator('.shell').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.getByRole('button', { name: '返回对照页' }).click();
  await page.locator('[data-case-link="b"]').click();
  await expect(page).toHaveURL(/case=b/);
  await expect(page.locator('#case-title')).toContainText('B');
  await expect(page.locator('html')).toHaveAttribute('data-case', 'b');
});

test('manifest identity, offline navigation and screenshots (Chromium)', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'macOS WebKit offline emulation is not physical iOS offline acceptance');
  await page.goto('/?case=a');
  await expect(page.locator('body')).toHaveAttribute('data-cache-ready', 'true');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  expect(manifest.id).toBe('/recall-status-edge-20261101');
  expect(manifest.display).toBe('standalone');
  expect(manifest.name).toBe('Recall 顶部对照');
  await context.setOffline(true);
  for (const variant of ['a', 'b', 'c']) {
    await page.goto(`/?case=${variant}`);
    await expect(page.locator('#case-title')).toContainText(variant.toUpperCase());
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '59px'));
    await page.screenshot({ path: `test-results/status-edge/${variant}.png` });
  }
});
