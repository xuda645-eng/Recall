import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { buildExportPayload } from '../src/services/import-export';

async function seed(page: Page): Promise<void> {
  const initial = createSeedSnapshot();
  initial.decks.forEach((deck, position) => { deck.name = `知识卡组 ${position + 1}`; });
  initial.cards.forEach(card => { card.front = '怎样用自己的话说明结论？'; card.back = '合上材料，说明条件与依据。'; });
  await page.goto('/');
  await expect(page.locator('.memory-app')).toBeVisible();
  await page.evaluate(value => localStorage.setItem('recall.snapshot.v1', JSON.stringify(value)), initial);
  await page.reload();
  await expect(page.locator('.m-paper-today')).toBeVisible();
}

test('纸感首页保留真实计数，底部操作不覆盖末尾内容且随前景移动', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.m-paper-today strong').nth(0)).toHaveText('3');
  await expect(page.locator('.m-paper-today strong').nth(1)).toHaveText('3');
  for (const size of [{ width: 393, height: 852 }, { width: 320, height: 568 }, { width: 760, height: 852 }, { width: 761, height: 852 }, { width: 852, height: 393 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await page.locator('.memory-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dock = (await page.locator('.m-paper-home-dock').boundingBox())!;
    const last = (await page.locator('.m-recent > button').last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(dock.y + 1);
    const start = (await page.getByRole('button', { name: '开始复习', exact: true }).boundingBox())!;
    expect(start.width).toBeGreaterThanOrEqual(44); expect(start.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-inset-top', '59px'); (element as HTMLElement).style.setProperty('--safe-bottom', '34px'); });
  expect((await page.locator('.m-brand').boundingBox())!.y).toBe(69);
  const dock = (await page.locator('.m-paper-home-dock').boundingBox())!;
  await page.locator('.m-brand').click();
  await expect.poll(async () => (await page.locator('.m-paper-home-dock').boundingBox())!.x).toBeGreaterThan(300);
  expect((await page.locator('#memory-drawer').boundingBox())!.x).toBe(0);
  expect((await page.locator('.m-paper-home-dock').boundingBox())!.y).toBe(dock.y);
  await page.keyboard.press('Escape');
  await expect(page.locator('.m-brand')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('html').evaluate(element => element.classList.add('dark'));
  await expect(page.locator('.memory-bar')).toHaveCSS('background-color', 'rgb(37, 43, 36)');
});

test('完整本地副本保留重复问题、层级和全部进度，不去重或连接云端', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await page.goto('/#settings');
  await expect(page.getByText('本地验收副本', { exact: true })).toBeVisible();
  const initial = createSeedSnapshot();
  initial.cards.push({ ...initial.cards[0], id: 'duplicate-archived', archivedAt: '2026-10-01T00:00:00Z' });
  const backup = buildExportPayload(initial);
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择完整备份副本' }).click();
  await (await choose).setFiles({ name: 'synthetic.recall-media.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'recall-media', version: 1, backup, images: [] })) });
  await expect(page.getByRole('button', { name: '确认载入本地副本' })).toBeVisible();
  await page.getByRole('button', { name: '确认载入本地副本' }).click();
  await expect(page.getByText(/^已载入内容/)).toBeVisible();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!));
  expect(restored.decks).toEqual(backup.decks);
  expect(restored.cards).toEqual(backup.cards);
  expect(restored.reviewLogs).toEqual(backup.reviewLogs);
  expect(restored.studySessions).toEqual(backup.studySessions);
  expect(restored.settings.syncCode).toBeNull(); expect(restored.settings.syncEnabled).toBe(false);
  await page.reload();
  await expect(page.getByText(/^已载入内容/)).toBeVisible();
  expect(await page.getByRole('button', { name: '选择完整备份副本' }).count()).toBe(0);
  expect((await context.request.post('/api/cloud/sync', { data: {} })).status()).toBe(405);
  expect((await context.request.get('/api/cloud/status')).status()).toBe(401);
  expect(external).toEqual([]);
});

test('长卡组偏好和放大文字不让首页底栏覆盖最后内容', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
    data.decks[0].name = '很长的卡组名称用于验证阅读字号放大后的首页底部复习入口'.repeat(3);
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(data));
    localStorage.setItem('recall.study.deck', data.decks[0].id);
  });
  await page.reload();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addStyleTag({ content: '.memory-app { --safe-bottom:34px; } .memory-app button, .memory-app small, .memory-app label { font-size:20px !important; }' });
  await expect.poll(async () => {
    await page.locator('.memory-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const dock = (await page.locator('.m-paper-home-dock').boundingBox())!;
    const last = (await page.locator('.m-recent > button').last().boundingBox())!;
    return last.y + last.height <= dock.y + 1;
  }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('html').evaluate(element => { element.classList.add('high-contrast'); });
  await expect(page.locator('.memory-bar')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
});

test('首页、列表和阅读保留完整卡片边界，长内容滚动不评分', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
    data.cards[0].back = '用自己的话说明结论与适用条件。\n\n'.repeat(100);
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('.m-paper-review-card')).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'));

  async function cardSurface(selector: string): Promise<void> {
    const card = page.locator(selector).first();
    await expect(card).toHaveCSS('border-top-width', '1px');
    await expect(card).toHaveCSS('border-right-width', '1px');
    await expect(card).toHaveCSS('border-bottom-width', '1px');
    await expect(card).toHaveCSS('border-left-width', '1px');
    expect(await card.evaluate(element => parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThanOrEqual(16);
    for (const theme of ['light', 'dark', 'high-contrast']) {
      await page.locator('html').evaluate((element, value) => { element.classList.remove('dark', 'high-contrast'); if (value !== 'light') element.classList.add(value); }, theme);
      expect(await card.evaluate(element => {
        const cardStyle = getComputedStyle(element);
        const shellStyle = getComputedStyle(document.querySelector('.memory-shell')!);
        return cardStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && (cardStyle.backgroundColor !== shellStyle.backgroundColor || cardStyle.borderTopColor !== cardStyle.backgroundColor);
      })).toBe(true);
      if (theme !== 'high-contrast') expect(await card.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
    }
    await page.locator('html').evaluate(element => element.classList.remove('dark', 'high-contrast'));
  }

  await cardSurface('.m-paper-review-card');
  await cardSurface('.m-folder');
  await cardSurface('.m-recent > button');
  await page.screenshot({ path: test.info().outputPath('home-cards.png'), scale: 'css' });
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await page.locator('#memory-drawer').getByRole('button', { name: '全部卡片', exact: true }).click();
  await expect(page.locator('.memory-card-row')).toHaveCount(9);
  await cardSurface('.memory-card-row');
  const first = (await page.locator('.memory-card-row').nth(0).boundingBox())!;
  const second = (await page.locator('.memory-card-row').nth(1).boundingBox())!;
  expect(second.y - first.y - first.height).toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: test.info().outputPath('list-cards.png'), scale: 'css' });
  await page.locator('[data-card-id="card_jp_1"] .m-card-open').click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await cardSurface('.m-card-window');
  for (const width of [393, 320, 760, 761]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.m-reading[data-active="true"]').evaluate(element => { element.scrollTop = 160; });
    expect(await page.locator('.m-reading[data-active="true"]').evaluate(element => element.scrollTop)).toBe(160);
    await expect(page.getByRole('button', { name: '开启评分（更新排期）', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: test.info().outputPath('reader-card.png'), scale: 'css' });
  expect(await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'))).toBe(before);
});

test('批注修订：导入确认固定在前景顶层，目录与长预览不遮挡，完成页精简', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await page.locator('#memory-drawer').getByRole('button', { name: '导入', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择带图卡片文件' })).toBeVisible();
  const text = '# 合成导入\n\n' + Array.from({ length: 24 }, (_, index) => `<!-- recall:card {"id":"comment-import-${index}"} -->\n问题：合成问题 ${index}？\n\n${'这是用来验证长预览的合成正文。'.repeat(20)}\n<!-- recall:end -->`).join('\n\n');
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.md', mimeType: 'text/markdown', buffer: Buffer.from(text) });
  const footer = page.locator('.m-import-confirm-dock');
  await expect(footer).toHaveCSS('position', 'fixed');
  await page.getByRole('button', { name: /^导入到 / }).click();
  await expect(page.getByRole('treeitem').first()).toHaveAccessibleName('根目录');
  for (const size of [{ width: 393, height: 852 }, { width: 320, height: 568 }, { width: 760, height: 852 }, { width: 761, height: 852 }, { width: 852, height: 393 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-bottom', '34px'); });
    const bounds = (await footer.boundingBox())!;
    await page.locator('.memory-content').evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    expect((await footer.boundingBox())!.y).toBe(bounds.y);
    for (const button of await footer.locator('button').all()) {
      const target = (await button.boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(element => { const rect = element.getBoundingClientRect(); const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return top === element || element.contains(top); })).toBe(true);
    }
    await page.locator('.memory-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const last = (await page.locator('article.m-panel').last().boundingBox())!;
    expect(last.y + last.height, `${size.width}px final preview clearance`).toBeLessThanOrEqual(bounds.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addStyleTag({ content: '.m-import-confirm-dock button { font-size: 24px; }' });
  await page.screenshot({ path: test.info().outputPath('import-dock.png'), scale: 'css' });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成', exact: true })).toBeVisible();
  await expect(footer).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存带编号的 Markdown' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看卡组' })).toBeVisible();
  await expect(page.getByRole('button', { name: '继续导入' })).toBeVisible();
});

test('批注修订：微信读书归组保留内容进度，子卡组空心，阅读来源仅显示章节', async ({ page }) => {
  await seed(page);
  const input = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
    data.cards[0] = { ...data.cards[0], bookTitle: '合成书籍', chapter: '合成章节', source: '微信读书 · 合成书籍 · 合成章节', contentKind: 'qa', recallKind: 'question', sourceRef: { provider: 'weread', bookId: 'comment-book', bookmarkId: 'h1', chapterUid: '1', chapterIdx: 1, range: '0-5', highlights: [{ bookmarkId: 'h1', markText: '  第一条原文。\n', chapterUid: '1', chapterIdx: 1, range: '0-5' }, { bookmarkId: 'h2', markText: '\n第二条原文。  ', chapterUid: '1', chapterIdx: 1, range: '6-11' }] } };
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(data));
    return data;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('recall.weread.folders-organized.v1'))).toBe('1');
  const grouped = await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!));
  const root = grouped.decks.find((deck: { name: string; parentId: string | null }) => deck.name === '微信读书' && !deck.parentId);
  expect(root).toBeTruthy();
  expect(grouped.decks.find((deck: { id: string }) => deck.id === grouped.cards[0].deckId).parentId).toBe(root.id);
  expect(grouped.cards.map((card: { deckId: string }, index: number) => ({ ...card, deckId: input.cards[index].deckId }))).toEqual(input.cards);
  expect(grouped.reviewLogs).toEqual(input.reviewLogs); expect(grouped.studySessions).toEqual(input.studySessions);
  const backup = await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.pre-weread-folders.v1')!));
  expect(backup.decks).toEqual(input.decks.map((deck: { parentId?: string | null }) => ({ ...deck, parentId: deck.parentId ?? null }))); expect(backup.settings.syncCode).toBeNull();
  const chip = page.locator('.m-subfolders button').first();
  for (const dark of [false, true]) {
    await page.locator('html').evaluate((element, enabled) => element.classList.toggle('dark', enabled), dark);
    await expect(chip).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(chip).toHaveCSS('border-top-width', '1px');
    expect(await chip.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
  }
  await page.locator('html').evaluate(element => element.classList.remove('dark'));
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await page.locator('#memory-drawer').getByRole('button', { name: '全部卡片', exact: true }).click();
  await page.locator(`[data-card-id="${input.cards[0].id}"] .m-card-open`).click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  const active = page.locator('.m-reading[data-active="true"]');
  await expect(active.locator('.m-weread-source-count')).toHaveCount(0);
  await expect(active.locator('.m-source-origin')).toHaveText('来源：合成章节');
  expect(await active.locator('.m-weread-source-segments section > p').allTextContents()).toEqual(input.cards[0].sourceRef.highlights.map((highlight: { markText: string }) => highlight.markText));
  await page.screenshot({ path: test.info().outputPath('reader-clean.png'), scale: 'css' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!))).toEqual(grouped);
});

test('批注修订：本地微信读书不请求在线服务，仍能导入划线文件到微信读书子卡组', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/') || new URL(request.url()).hostname !== '127.0.0.1') requests.push(request.url()); });
  await page.goto('/#weread');
  await expect(page.getByText(/^本地隔离预览不连接微信读书或 AI 服务/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toHaveCount(0);
  const file = { format: 'recall-weread-export-v1', books: [{ bookId: 'comment-local-book', title: '合成离线书', highlights: [{ bookmarkId: 'local-1', chapterTitle: '本地章节', markText: '  合成的原文保持不变。\n', question: '如何保留原文？' }] }] };
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-weread.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.locator('.m-book-choice input').check();
  await page.getByRole('button', { name: '预览并编辑回忆卡' }).click();
  await expect(page.getByRole('button', { name: 'AI 生成所选问题' })).toHaveCount(0);
  await page.getByRole('button', { name: '检查导入变化' }).click();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!));
  const root = saved.decks.find((deck: { name: string; parentId: string | null }) => deck.name === '微信读书' && !deck.parentId);
  const book = saved.decks.find((deck: { name: string; parentId: string }) => deck.name === '合成离线书' && deck.parentId === root.id);
  expect(saved.cards[0].deckId).toBe(book.id); expect(saved.cards[0].back).toBe(file.books[0].highlights[0].markText);
  expect(requests).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('weread-local.png'), scale: 'css' });
});
