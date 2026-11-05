import { test, expect } from '@playwright/test';

test('底部所有文字同字号和字重，右侧只有一个小图标，原型不请求真实服务', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { requests.push(request.url()); expect(request.method()).toBe('GET'); expect(new URL(request.url()).origin).toBe('http://127.0.0.1:4424'); });
  await page.goto('/');
  for (const dimensions of [{ width: 393, height: 852 }, { width: 525, height: 824 }, { width: 320, height: 852 }]) {
    await page.setViewportSize(dimensions);
    const action = page.getByRole('button', { name: '同步并检查更新', exact: true });
    await expect(action).toBeInViewport();
    expect(await page.locator('.health button').count()).toBe(1);
    const geometry = await action.evaluate(element => { const bounds = element.getBoundingClientRect(); const icon = element.querySelector('svg')!.getBoundingClientRect(); const footer = element.closest('.drawer-footer')!.getBoundingClientRect(); return { width: bounds.width, height: bounds.height, icon: icon.width, rightGap: footer.right - bounds.right, hit: element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)) }; });
    expect(geometry).toMatchObject({ width: 44, height: 44, icon: 18, rightGap: 12, hit: true });
    const typography = await page.evaluate(() => ['.settings', '.sync-line > span', '.sync-time', '.version-line', '.feedback'].map(selector => { const style = getComputedStyle(document.querySelector(selector)!); return { size: style.fontSize, weight: style.fontWeight, family: style.fontFamily, lineHeight: style.lineHeight }; }));
    for (const style of typography) {
      expect(style).toEqual(typography[0]);
      expect(style).toMatchObject({ size: '13px', weight: '400', lineHeight: '20px' });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`footer-${dimensions.width}.png`), scale: 'css' });
    if (dimensions.width === 525) await page.locator('.drawer-footer').screenshot({ path: test.info().outputPath('footer-detail.png'), scale: 'css' });
  }
  expect(requests.every(url => ['/', '/style.css', '/preview.js', '/favicon.ico'].includes(new URL(url).pathname))).toBe(true);
});

test('离线、冲突、深色和放大文字下信息不盖住唯一按钮', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '局部原型', exact: true }).click();
  for (const state of ['pending', 'offline', 'conflict']) {
    await page.getByLabel('预览状态').selectOption(state);
    await page.getByLabel('外观').selectOption('dark');
    await page.getByRole('button', { name: '局部原型', exact: true }).click();
    await page.evaluate(() => { const stage = document.querySelector<HTMLElement>('.stage')!; stage.style.setProperty('--safe-top', '59px'); stage.style.setProperty('--safe-bottom', '34px'); document.querySelector<HTMLElement>('.drawer-footer')!.style.setProperty('--footer-font-size', '20px'); });
    expect(await page.locator('.drawer-footer').evaluate(element => ['.settings', '.sync-line > span', '.sync-time', '.version-line', '.feedback'].map(selector => getComputedStyle(element.querySelector(selector)!).fontSize))).toEqual(Array(5).fill('20px'));
    const action = page.getByRole('button', { name: '同步并检查更新', exact: true });
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
    expect(await action.evaluate(element => { const bounds = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)); })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`footer-${state}-dark.png`), scale: 'css' });
    await page.getByRole('button', { name: '局部原型', exact: true }).click();
  }
});

test('点击仅演示反馈，不连接卡库；冲突不展示虚假同步成功', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '同步并检查更新', exact: true }).dblclick();
  await expect(page.getByRole('status')).toHaveText('演示完成，未操作真实数据');
  await page.getByRole('button', { name: '局部原型', exact: true }).click();
  await page.getByLabel('预览状态').selectOption('conflict');
  await page.getByRole('button', { name: '局部原型', exact: true }).click();
  await page.getByRole('button', { name: '同步并检查更新', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('请先在设置中处理冲突');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.sync-action svg').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  expect(failures).toEqual([]);
});
