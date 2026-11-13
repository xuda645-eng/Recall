import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function fixture() {
  const seed = createSeedSnapshot();
  return { ...seed,
    decks: [{ ...seed.decks[0], id: 'learning-root', name: '学习版合成练习', parentId: null }],
    cards: [{ ...seed.cards[0], id: 'learning-first', deckId: 'learning-root',
      front: '如何验证学习版？\n\n' + '合成数据用于验证阅读。\n\n'.repeat(40),
      back: '保留本机数据与复习记录。\n\n'.repeat(40), state: 'new', contentKind: 'qa',
      nextReviewDate: '2026-10-01T00:00:00.000Z', lastReviewDate: null, reps: 0,
      stability: 0, difficulty: 0, lapses: 0, learningSteps: 0, elapsedDays: 0, scheduledDays: 0 }],
    reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true,
      syncCode: null, syncEnabled: false, studyPreferences: { newCardRatio: 1, batchSize: 10, sessionMinutes: 30 },
      reviewPlan: { mode: 'fixed', intervals: { again: 60000, hard: 86400000, good: 2592000000, easy: 15552000000 } } },
  };
}
async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));
}
async function ready(page: Page) {
  await expect(page.locator('.memory-app')).toBeVisible();
  const acknowledge = page.getByRole('button', { name: '我知道了，开始体验', exact: true });
  if (await acknowledge.isVisible()) {
    await acknowledge.click();
    await expect(page.getByRole('button', { name: '打开项目菜单', exact: true })).toBeVisible();
  }
}
async function navigate(page: Page, label: string) {
  const logo = page.getByRole('button', { name: '打开项目菜单', exact: true });
  if (await logo.isVisible()) await logo.click();
  await page.locator('#memory-drawer').getByRole('button', { name: label, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(value => {
    if (!localStorage.getItem('recall.learning.synthetic-seeded')) {
      localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
      localStorage.setItem('recall.learning.synthetic-seeded', '1');
    }
  }, fixture());
});

test('learning notice, same-page layout and disabled cloud/worker/update controls', async ({ page }) => {
  const writes: string[] = [];
  const rawModules: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/\/api\/(auth|sync|media|weread)(\/|$)/.test(pathname)) writes.push(request.method());
    if (pathname.endsWith('/recall-learning/recall-pwa.js') && !pathname.includes('/client/src/')) rawModules.push(pathname);
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const notice = page.getByRole('dialog');
  await expect(notice).toContainText('不随飞书账号同步');
  const bounds = await page.getByRole('button', { name: '我知道了，开始体验' }).boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await ready(page);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await navigate(page, '设置与数据');
  await expect(page.getByText('云同步、离线安装和自动更新暂未开放。', { exact: true })).toHaveCount(1);
  expect(writes).toEqual([]);
  expect(rawModules).toEqual([]);
  expect(pageErrors).toEqual([]);
  await expect(page.getByText('页面出错了', { exact: true })).toHaveCount(0);
  expect((await state(page)).settings.syncEnabled).toBe(false);
});

test('long reading, rating, undo and reload persist only synthetic local records', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' }); await ready(page);
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /确认开始复习|开始学习新卡/ }).click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await page.locator('.m-reading[data-active="true"]').evaluate(element => { element.scrollTop = 240; });
  expect((await state(page)).reviewLogs).toHaveLength(0);
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    const bounds = await page.locator(`[data-rating="${rating}"]`).boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44); expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('[data-rating="again"]').click();
  await expect.poll(async () => (await state(page)).reviewLogs.length).toBe(1);
  await page.getByRole('button', { name: '撤销上次评分', exact: true }).click();
  await expect.poll(async () => (await state(page)).reviewLogs.length).toBe(0);
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
  expect((await state(page)).cards[0].reps).toBe(0);
});

test('Markdown preview and update preserve card identity and review metadata', async ({ page }) => {
  await page.goto('./#import', { waitUntil: 'domcontentloaded' }); await ready(page);
  const file = (answer: string) => ({ name: 'learning.md', mimeType: 'text/markdown',
    buffer: Buffer.from(`# 学习版导入\n\n<!-- recall:card {"id":"learning-markdown"} -->\n问题：学习版导入问题\n\n${answer}\n\n<!-- recall:end -->\n`) });
  await page.getByLabel('导入文件').setInputFiles(file('合成原始答案'));
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  const before = (await state(page)).cards.find((card: { id: string }) => card.id === 'learning-markdown');
  await page.getByRole('button', { name: '继续导入', exact: true }).click();
  await page.getByLabel('导入文件').setInputFiles(file('合成更新答案'));
  await expect(page.getByText('检测到变化', { exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  const after = (await state(page)).cards.find((card: { id: string }) => card.id === before.id);
  expect(after.back).toBe('合成更新答案'); expect(after.reps).toBe(before.reps);
  expect(after.nextReviewDate).toBe(before.nextReviewDate); expect((await state(page)).cards).toHaveLength(2);
});

test('local image import, refresh and full backup preserve exact synthetic bytes', async ({ page }) => {
  await page.goto('./#import', { waitUntil: 'domcontentloaded' }); await ready(page);
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Missing canvas');
    context.fillStyle = '#50624b'; context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const image = Buffer.from(base64, 'base64'); const id = createHash('sha256').update(image).digest('hex') + '.png';
  const markdown = `# 学习版图片\n\n<!-- recall:card {"id":"learning-media"} -->\n问题：学习版图片问题\n\n合成图片答案\n\n![学习版合成图片](recall://${id})\n<!-- recall:end -->\n`;
  await page.getByLabel('导入文件').setInputFiles({ name: 'learning.recall-media.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'recall-media', version: 1, markdown, images: [{ id, mime: 'image/png', base64 }] })) });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await page.getByRole('button', { name: '查看卡组', exact: true }).click();
  await page.locator('.m-card-open').filter({ hasText: '学习版图片问题' }).click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await expect(page.getByRole('img', { name: '学习版合成图片' })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
  await expect(page.getByRole('img', { name: '学习版合成图片' })).toBeVisible();
  await navigate(page, '设置与数据'); await page.getByRole('button', { name: '备份', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '备份（含来源图片）', exact: true }).click();
  const path = await (await pending).path(); if (!path) throw new Error('Missing image backup');
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(Buffer.from(backup.images[0].base64, 'base64')).toEqual(image);
  expect(backup.backup.cards).toHaveLength(2); expect(backup.backup.settings.syncCode).toBeNull();
});

test('WeRead file import preserves original text and duplicate identity', async ({ page }) => {
  await page.goto('./#import', { waitUntil: 'domcontentloaded' }); await ready(page);
  const text = '  合成原文第一行。\n\n合成原文第二行。  ';
  const file = { name: 'weread.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'recall-weread-export-v1', books: [{ bookId: 'learning-book', title: '学习版合成书', highlights: [{
      bookmarkId: 'learning-highlight', markText: text, chapterUid: 'learning-chapter', chapterTitle: '第一章',
      question: '是否保留原文？', recallKind: 'qa' }] }],
  })) };
  const load = async () => {
    await page.getByLabel('导入文件').setInputFiles(file); await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '预览并编辑回忆卡', exact: true }).click();
    await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  };
  await load(); const before = (await state(page)).cards.find((card: { bookTitle?: string }) => card.bookTitle === '学习版合成书');
  expect(before.back).toBe(text); expect(before.chapter).toBe('第一章');
  await page.getByRole('button', { name: '继续选择其他书', exact: true }).click(); await load();
  expect((await state(page)).cards.find((card: { id: string }) => card.id === before.id)).toEqual(before);
  expect((await state(page)).cards).toHaveLength(2);
});

test('editing, statistics and text backup remain browser-local', async ({ page }) => {
  await page.goto('./#cards', { waitUntil: 'domcontentloaded' }); await ready(page);
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'cards');
  await page.getByRole('button', { name: /管理卡片：如何验证学习版/ }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await page.getByRole('textbox', { name: '答案', exact: true }).fill('学习版合成修改。');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect.poll(async () => (await state(page)).cards[0].back).toBe('学习版合成修改。');
  await navigate(page, '统计'); await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'stats');
  await navigate(page, '设置与数据'); await page.getByRole('button', { name: '备份', exact: true }).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '仅文字与进度备份', exact: true }).click();
  const path = await (await pending).path(); if (!path) throw new Error('Missing text backup');
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.cards[0].back).toBe('学习版合成修改。'); expect(backup.settings.syncCode).toBeNull();
});

test('mobile safe areas, attribution and breakpoints preserve geometry', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' }); await ready(page);
  for (const width of [393, 320, 760, 761, 852]) {
    await page.setViewportSize({ width, height: width === 852 ? 393 : 852 });
    await page.locator('.memory-app').evaluate(element => {
      const app = element as HTMLElement; app.style.setProperty('--safe-top', '59px');
      app.style.setProperty('--safe-bottom', 'max(34px, var(--miaoda-bottom-clearance, 0px))');
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const control = page.getByRole('button', { name: '开始复习', exact: true }); const bounds = await control.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44); expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: test.info().outputPath('learning-home.png'), scale: 'css' });
});
