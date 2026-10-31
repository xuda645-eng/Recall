import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const storageKey = 'recall.prototype.weread-selection.v1';
async function openBooks(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择想记住的书' })).toBeVisible();
}
async function state(page: Page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), storageKey);
}
async function chooseScenario(page: Page, value: string) {
  await page.getByRole('button', { name: '原型演示设置', exact: true }).click();
  await page.locator('#mobile-scenario').selectOption(value);
  await page.getByRole('button', { name: '保存演示设置' }).click();
}
async function choosePair(page: Page) {
  await page.locator('[data-book="echo"]').click();
  await page.locator('[data-book="scale"]').click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
}
async function noOverflow(page: Page) {
  const measurements = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    main: document.querySelector('#main')!.scrollWidth - document.querySelector('#main')!.clientWidth,
    sheet: document.querySelector('#sheet')!.scrollWidth - document.querySelector('#sheet')!.clientWidth,
  }));
  expect(measurements.document).toBeLessThanOrEqual(1);
  expect(measurements.main).toBeLessThanOrEqual(1);
  if (await page.locator('#sheet').isVisible()) expect(measurements.sheet).toBeLessThanOrEqual(1);
}
test('连接入口只有一个主按钮，不展示技术说明和真实用户数据', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('#main .primary')).toHaveCount(1);
  await expect(page.getByText('交互原型 · 非个人数据')).toBeVisible();
  await expect(page.locator('#main')).not.toContainText('5 MB');
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在连接' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: '选择想记住的书' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await noOverflow(page);
});
test('搜索作者、空结果恢复和筛选不丢失已选书', async ({ page }) => {
  await openBooks(page);
  await page.locator('[data-book="echo"]').click();
  await page.getByRole('searchbox').fill('陈舟');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('思考的尺度');
  await expect(page.locator('#footer')).toContainText('已选 1 本');
  await page.getByRole('searchbox').fill('没有这本书');
  await expect(page.getByRole('heading', { name: '暂时没有匹配的书' })).toBeVisible();
  await page.getByRole('button', { name: '清除搜索与筛选' }).click();
  await expect(page.locator('[data-book="echo"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '已读完', exact: true }).click();
  await expect(page.locator('.book-card')).toHaveCount(2);
  await expect(page.locator('#footer')).toContainText('已选 1 本');
});
test('进度1显示为1%，笔记总数不等于划线数，缺失字段不伪造零值', async ({ page }) => {
  await openBooks(page);
  await expect(page.locator('[data-book="echo"]')).toContainText('12条划线');
  await expect(page.locator('[data-book="echo"]')).toContainText('笔记共 17 条');
  await expect(page.locator('[data-book="question"]')).toContainText('阅读进度 1%');
  await expect(page.locator('[data-book="between"]')).toContainText('进度未提供');
  await expect(page.locator('[data-book="between"]')).toContainText('笔记总数未提供');
  await expect(page.locator('[data-book="letter"]')).toBeDisabled();
  await expect(page.locator('[data-book="letter"]')).toContainText('笔记共 4 条');
  await page.getByRole('combobox', { name: '书籍排序' }).selectOption('progress');
  await expect(page.locator('.book-card').first()).toContainText('阅读进度 100%');
  await page.getByRole('combobox', { name: '书籍排序' }).selectOption('highlights');
  await expect(page.locator('.book-card').first()).toContainText('阅读的回声');
});
test('更多筛选可排除无划线或已导入的书', async ({ page }) => {
  await openBooks(page);
  await page.getByRole('button', { name: '更多筛选' }).click();
  await page.locator('#only-highlights').check();
  await page.locator('#only-unimported').check();
  await page.getByRole('button', { name: '显示筛选结果' }).click();
  await expect(page.locator('[data-book="letter"]')).toHaveCount(0);
  await expect(page.locator('[data-book="scale"]')).toHaveCount(0);
  await expect(page.locator('.book-card')).toHaveCount(6);
});
test('每批五本上限，长书卡可滚动且不被底部动作遮挡', async ({ page }) => {
  await openBooks(page);
  for (const id of ['echo', 'scale', 'slow', 'forest', 'city']) await page.locator(`[data-book="${id}"]`).click();
  await page.locator('[data-book="question"]').click();
  await expect(page.locator('#footer')).toContainText('已选 5 本');
  await expect(page.locator('[data-book="question"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-book="between"]').scrollIntoViewIfNeeded();
  const card = await page.locator('[data-book="between"]').boundingBox();
  const footerBounds = await page.locator('#footer').boundingBox();
  expect(card!.y + card!.height).toBeLessThanOrEqual(footerBounds!.y + 1);
  await noOverflow(page);
});
test('确认前不启动，全部问题成功后自动导入，只使用隔离演示存储', async ({ page }) => {
  await openBooks(page);
  await choosePair(page);
  await expect(page.locator('#confirm-count')).toContainText('17');
  expect((await state(page)).job).toBeNull();
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '正在把划线变成问题' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible({ timeout: 12000 });
  await expect(page.locator('.receipt')).toContainText('17新增卡片');
  await expect(page.locator('.receipt')).toContainText('3跳过已有');
  const saved = await state(page);
  expect(saved.job.items.every((item: { generated: number; target: number }) => item.generated === item.target)).toBe(true);
  expect(saved.imported.echo).toBe(12);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([storageKey]);
});
test('生成失败全批停留，无部分导入，重试从四条进度继续', async ({ page }) => {
  await openBooks(page);
  await chooseScenario(page, 'generation-failure');
  await choosePair(page);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '生成暂停了' })).toBeVisible();
  const failed = await state(page);
  expect(failed.job.items[0].generated).toBe(4);
  expect(failed.imported.echo).toBeUndefined();
  await page.waitForTimeout(500);
  expect((await state(page)).job.items[0].generated).toBe(4);
  await page.getByRole('button', { name: '重试并继续' }).click();
  expect((await state(page)).job.items[0].generated).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible({ timeout: 12000 });
});
test('刷新保留已完成问题，不自动续跑或导入', async ({ page }) => {
  await openBooks(page);
  await choosePair(page);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect.poll(async () => (await state(page)).job.items[0].generated).toBeGreaterThan(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: '进度已为你保留' })).toBeVisible();
  const preserved = (await state(page)).job.items[0].generated;
  await page.waitForTimeout(500);
  expect((await state(page)).job.items[0].generated).toBe(preserved);
  expect((await state(page)).imported.echo).toBeUndefined();
  await page.getByRole('button', { name: '继续生成与导入' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible({ timeout: 12000 });
});
test('导入失败保留全部问题，重试只执行导入', async ({ page }) => {
  await openBooks(page);
  await chooseScenario(page, 'import-failure');
  await choosePair(page);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '问题已好，导入未完成' })).toBeVisible({ timeout: 12000 });
  const failed = await state(page);
  expect(failed.job.items.every((item: { generated: number; target: number }) => item.generated === item.target)).toBe(true);
  expect(failed.imported.echo).toBeUndefined();
  await page.getByRole('button', { name: '重试导入' }).click();
  await expect(page.getByRole('heading', { name: '正在放进你的卡组' })).toBeVisible();
  expect((await state(page)).job.items).toEqual(failed.job.items);
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
});
for (const update of [false, true]) {
  test(`变化卡${update ? '明确勾选才更新' : '默认跳过'}，自动导入不绕过确认`, async ({ page }) => {
    await openBooks(page);
    await chooseScenario(page, 'changes');
    await choosePair(page);
    await expect(page.locator('#update-changed')).not.toBeChecked();
    if (update) await page.locator('#update-changed').check();
    await expect(page.locator('#confirm-count')).toContainText(update ? '20' : '17');
    await page.getByRole('button', { name: '生成并自动导入' }).click();
    await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible({ timeout: 12000 });
    expect((await state(page)).job.items[1].update).toBe(update ? 3 : 0);
    await expect(page.locator('.receipt')).toContainText(`${update ? 3 : 0}更新卡片`);
  });
}
test('重复选择已导入的书，不重复生成或导入', async ({ page }) => {
  await page.goto('/?preview=done');
  await page.getByRole('button', { name: '继续选择其他书' }).click();
  await choosePair(page);
  await expect(page.locator('#confirm-count')).toContainText('0');
  await page.getByRole('button', { name: '查看演示卡组', exact: true }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  await expect(page.locator('.receipt')).toContainText('0新增卡片');
  await expect(page.locator('.receipt')).toContainText('20跳过已有');
});
test('Logo随前景移动、抽屉留在底层，支持快速切换与全部关闭路径', async ({ page }) => {
  await openBooks(page);
  const logo = page.locator('#logo');
  const initial = await logo.boundingBox();
  await logo.click();
  await expect(logo).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await logo.boundingBox())!.x).toBeGreaterThan(initial!.x + 100);
  const drawerBounds = await page.locator('#drawer').boundingBox();
  expect(drawerBounds!.x).toBe(0);
  await page.keyboard.press('Escape');
  await expect(logo).toBeFocused();
  await logo.click();
  await logo.click();
  await logo.click();
  await expect(logo).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#page-veil').click({ position: { x: 30, y: 300 } });
  await expect(logo).toHaveAttribute('aria-expanded', 'false');
  await logo.click();
  await page.locator('#drawer [data-nav="books"]').click();
  await expect(logo).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => page.locator('#foreground').evaluate(element => getComputedStyle(element).transform)).toBe('none');
});
test('安全区压力、44px触控、长卡滚动、弹层焦点与减弱动画', async ({ page }) => {
  await openBooks(page);
  await page.addStyleTag({ content: ':root{--safe-top:59px;--safe-bottom:34px;--safe-left:18px;--safe-right:18px}' });
  const logo = await page.locator('#logo').boundingBox();
  expect(logo!.y).toBe(69);
  expect(logo!.width).toBe(48);
  expect(logo!.height).toBe(48);
  const nextBounds = await page.locator('#next').boundingBox();
  expect(852 - nextBounds!.y - nextBounds!.height).toBeGreaterThanOrEqual(50);
  const targets = await page.locator('#foreground button:visible, #foreground input:visible, #foreground select:visible').evaluateAll(elements => elements.map(element => ({ name: element.id || element.textContent?.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  expect(targets.filter(target => target.width < 44 || target.height < 44)).toEqual([]);
  await page.locator('[data-book="city"]').scrollIntoViewIfNeeded();
  await noOverflow(page);
  expect((await state(page))?.selected || []).toEqual([]);
  await page.getByRole('button', { name: '更多筛选' }).click();
  await noOverflow(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '更多筛选' })).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#foreground')).toHaveCSS('transition-duration', '0s');
});
test('窄屏、760断点、横屏、桌面和文字放大不横向溢出', async ({ page }) => {
  await openBooks(page);
  for (const viewport of [{ width: 320, height: 740 }, { width: 360, height: 780 }, { width: 760, height: 900 }, { width: 761, height: 1000 }, { width: 852, height: 393 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await noOverflow(page);
    await page.getByRole('button', { name: '更多筛选' }).click();
    const dialog = await page.locator('#sheet').boundingBox();
    const deviceBounds = await page.locator('#device').boundingBox();
    expect(Math.abs(dialog!.x - deviceBounds!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(dialog!.width - deviceBounds!.width)).toBeLessThanOrEqual(1);
    await noOverflow(page);
    await page.getByRole('button', { name: '关闭弹层' }).click();
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('#main h1, #main h3, #main p, #main span, #footer button').forEach(element => { element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 1.3}px`; });
  });
  await noOverflow(page);
});
test('高保真页面截图与完整场景预览', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const output = resolve(process.cwd(), '../exports/weread-design');
  await mkdir(output, { recursive: true });
  for (const screen of ['connect', 'books', 'confirm', 'failure', 'done']) {
    await page.goto(`/?preview=${screen}`);
    await expect(page.locator('#device')).toBeVisible();
    if (screen === 'books') {
      await page.locator('[data-book="echo"]').click();
      await page.locator('[data-book="scale"]').click();
    }
    await noOverflow(page);
    await page.screenshot({ path: resolve(output, `${testInfo.project.name}-${screen}.png`) });
  }
  await page.goto('/?preview=confirm');
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect.poll(async () => (await state(page)).job.items[0].generated).toBeGreaterThan(2);
  await page.screenshot({ path: resolve(output, `${testInfo.project.name}-generating.png`) });
  await page.getByRole('button', { name: '暂停，保留进度' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '选书列表 ↗' }).click();
  await page.screenshot({ path: resolve(output, `${testInfo.project.name}-desktop.png`) });
});
