import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';

const originals = ['  概念定义。\r\n\t 保持空白。  ', '具体条件与说明。', '方法的第一步。', '方法的第二步。'];
const seed = () => ({ ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [], studySessions: [], settings: { ...createSeedSnapshot().settings, onboardingComplete: true } });
async function setup(page: Page, fail = false, missing = false) {
  const calls: string[][] = [];
  let failed = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') { await route.fulfill({ status: 503, json: { error: 'synthetic' } }); return; }
    const body = route.request().postDataJSON();
    if (path.endsWith('/books')) await route.fulfill({ json: { books: [{ bookId: 'synthetic', title: '合成关联书', highlightCount: 4 }], cursor: null } });
    else if (path.endsWith('/progress')) await route.fulfill({ json: { bookId: body.bookId, readingProgress: null } });
    else if (path.endsWith('/budget')) await route.fulfill({ json: { remaining: 300 } });
    else if (path.endsWith('/book')) await route.fulfill({ json: { format: 'recall-weread-export-v1', books: [{ bookId: 'synthetic', title: '合成关联书', highlights: [3, 1, 0, 2].map(index => ({
      bookmarkId: `m${index}`, markText: originals[index], chapterUid: '1', chapterTitle: '合成章节',
      ...(missing ? {} : { chapterIdx: 1, range: `${index * 100}-20` }),
    })) }] } });
    else if (path.endsWith('/merge')) {
      const ids = body.highlights.map((item: { id: string }) => item.id);
      calls.push(ids);
      expect(ids).toEqual(['m0', 'm1', 'm2', 'm3']);
      expect(body.highlights.map((item: { markText: string }) => item.markText)).toEqual(originals);
      if (fail && !failed) { failed = true; await route.fulfill({ status: 502, json: { error: 'synthetic-failure' } }); return; }
      await route.fulfill({ json: { cards: [
        { highlightIds: ['m0', 'm1'], question: '这一概念有哪些具体条件？' }, { highlightIds: ['m2', 'm3'], question: '这一方法包含哪两个步骤？' },
      ] } });
    } else throw new Error(`Unexpected API ${path}`);
  });
  await page.goto('/');
  await page.evaluate(data => { localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = 'weread'; }, seed());
  await page.reload();
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await page.getByRole('button', { name: '合成关联书，4 条我的划线' }).click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  return calls;
}
const snapshot = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));

test('智能分组合并、原文顺序、改问题、确认后导入与刷新恢复', async ({ page }, info) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: '智能合并划线', exact: true }).click();
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.getByRole('heading', { name: '检查你的知识单元' })).toBeVisible();
  expect((await snapshot(page)).cards).toEqual([]);
  expect(calls).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: '检查你的知识单元' })).toBeVisible();
  expect(calls).toHaveLength(1);
  const prompt = page.getByRole('textbox', { name: '合并卡片 1 的问题' });
  await prompt.fill('这个概念的定义和适用条件分别是什么？');
  await prompt.blur();
  await expect(page.getByRole('button', { name: '确认导入 2 张卡片' })).toBeEnabled();
  for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 852 }, { width: 760, height: 852 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: `/tmp/recall-merge-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '确认导入 2 张卡片' }).click();
  await expect(page.getByRole('heading', { name: '合并卡片已收好' })).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.cards).toHaveLength(2);
  expect(saved.cards[0].back).toBe(originals.slice(0, 2).join('\n\n'));
  expect(saved.cards[0].sourceRef.highlights.map((item: { markText: string }) => item.markText)).toEqual(originals.slice(0, 2));
  expect(saved.cards[0].front).toBe('这个概念的定义和适用条件分别是什么？');
  await page.getByRole('button', { name: '查看卡组', exact: true }).click();
  await expect(page.locator('.m-card-open')).toHaveCount(2);
  await page.getByRole('button', { name: '管理卡片：这个概念的定义和适用条件分别是什么？', exact: true }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await expect(page.locator('textarea[name="back"]')).toHaveAttribute('readonly', '');
  await page.locator('textarea[name="front"]').fill('定义和条件怎样共同限定这个概念？');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.locator('textarea[name="front"]')).toHaveCount(0);
  expect((await snapshot(page)).cards[0].back).toBe(originals.slice(0, 2).join('\n\n'));
  await page.locator('.m-card-open').first().click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  const active = page.locator('.m-reading[data-active="true"]');
  await expect(active.locator('.m-weread-source-segments section')).toHaveCount(2);
  expect(await active.locator('.m-weread-source-segments section > p').allTextContents()).toEqual(originals.slice(0, 2));
});

test('手动拆分与相邻合并不调用AI、不改原文', async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole('button', { name: '智能合并划线', exact: true }).click();
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(2);
  await page.getByRole('button', { name: '拆分为单条' }).first().click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(3);
  await page.getByRole('button', { name: '与下一张合并' }).first().click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(2);
  expect(calls).toHaveLength(1);
  expect((await snapshot(page)).cards).toEqual([]);
});

test('失败不导入，刷新后显式继续；缺位置不能智能合并', async ({ page }) => {
  const calls = await setup(page, true);
  await page.getByRole('button', { name: '智能合并划线', exact: true }).click();
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await snapshot(page)).cards).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: '生成分组与问题' })).toBeVisible();
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.getByRole('heading', { name: '检查你的知识单元' })).toBeVisible();
  expect(calls).toHaveLength(2);
});

test('缺少原文位置时保留逐条入口而禁止智能合并', async ({ page }) => {
  await setup(page, false, true);
  await expect(page.getByRole('button', { name: '智能合并划线', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '生成并自动导入', exact: true })).toBeEnabled();
});

test('公开合成示例无AI调用，可拆分预览且安全区按钮至少44px', async ({ page }) => {
  let aiCalls = 0;
  await page.route('**/api/**', async route => {
    if (/weread\/(merge|question)/.test(route.request().url())) aiCalls++;
    await route.fulfill({ status: 503, json: { error: 'preview-no-cloud' } });
  });
  await page.goto('/');
  await page.evaluate(data => { localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = 'weread'; }, seed());
  await page.reload();
  await page.getByRole('button', { name: '体验合并示例（合成数据 / 非 AI）' }).click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(2);
  await expect(page.locator('.wr-consent')).toContainText('不是现场 AI 输出');
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.memory-app')?.style.setProperty('--safe-top', '59px');
    document.querySelector<HTMLElement>('.memory-app')?.style.setProperty('--safe-bottom', '34px');
  });
  const button = page.getByRole('button', { name: '确认导入 2 张卡片' });
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: '拆分为单条' }).first().click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(3);
  expect(aiCalls).toBe(0);
  expect((await snapshot(page)).cards).toEqual([]);
});
