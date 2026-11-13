import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { StatisticsCommands, StatisticsState } from '@morfira-dev/wysiwyg/plugins/statistics';

declare global { interface Window { statisticsAPI: StatisticsCommands; statisticsEvents: StatisticsState[]; stopStatistics: () => void; } }
const initialize = async (page: Page, html = '<p>Hello world</p>') => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose(); const host = document.createElement('div'); host.className = 'statistics-test'; document.body.append(host);
    window.editor = window.createEditor(host, { value, plugins: [window.createStatistics({ locale: 'en' })] });
    window.statisticsAPI = window.statisticsCommands(window.editor); window.statisticsEvents = [];
    window.stopStatistics = window.statisticsAPI.subscribe((state) => window.statisticsEvents.push(state));
  }, html);
};
const state = (page: Page) => page.evaluate(() => window.statisticsAPI.getState());
const zero = { characters: 0, charactersWithoutWhitespace: 0, words: 0 };

test('counts inline grapheme clusters, family emoji and flags rather than UTF16 units', async ({ page }) => {
  await initialize(page, '<p>A<strong>e</strong><em>\u0301</em> 👨‍👩‍👧‍👦 🇷🇺</p>');
  expect((await state(page)).document).toEqual({ characters: 6, charactersWithoutWhitespace: 4, words: 1 });
  expect((await state(page)).selection).toEqual(zero);
  expect(await page.evaluate(() => window.editor.getText().length)).toBeGreaterThan(6);
});

test('counts real spaces including NBSP and excludes synthetic paragraph separators', async ({ page }) => {
  await initialize(page, '<p>Hello <strong>world</strong>!</p><p>Привет&nbsp;мир</p>');
  expect((await state(page)).document).toEqual({ characters: 22, charactersWithoutWhitespace: 20, words: 4 });
  const before = await page.evaluate(() => window.editor.getHTML());
  await state(page); await state(page);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('block, br, image, nested-list, cell and caption barriers keep words independent', async ({ page }) => {
  await initialize(page, '<p>one<br>two<img src="/logo.svg" alt="not counted" title="ignored">three</p><ul><li>four<ul><li>five</li></ul>six</li></ul><table><tbody><tr><td rowspan="2">seven</td><td>eight</td></tr><tr><td>nine</td></tr></tbody></table><figure><img src="/logo.svg" alt="ignore me"><figcaption>ten</figcaption></figure>');
  expect((await state(page)).document).toEqual({ characters: 39, charactersWithoutWhitespace: 39, words: 10 });
  await expect(page.locator('.statistics-test td[rowspan="2"]')).toHaveText('seven');
  await expect(page.locator('.statistics-test img')).toHaveCount(2);
});

test('selection counts actual partial rich ranges without joining words across blocks', async ({ page }) => {
  await initialize(page, '<p><strong>Hello</strong> <em>world</em></p><p>Next</p>');
  await page.evaluate(() => window.editor.setSelection(3, 10));
  expect((await state(page)).selection).toEqual({ characters: 10, charactersWithoutWhitespace: 9, words: 3 });
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain('world');
  await page.evaluate(() => window.editor.setSelection(6, 5));
  expect((await state(page)).selection).toEqual({ characters: 5, charactersWithoutWhitespace: 5, words: 1 });
  await page.evaluate(() => window.editor.setSelection(6)); expect((await state(page)).selection).toEqual(zero);
});

test('outside-editor and image-only selections are zero while caption text is counted', async ({ page }) => {
  await initialize(page, '<figure><img src="/logo.svg" alt="not text"><figcaption>Caption</figcaption></figure><p>Tail</p>');
  await page.locator('.statistics-test img').evaluate((image) => { const range = document.createRange(); range.selectNode(image); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); });
  expect((await state(page)).selection).toEqual(zero);
  await page.locator('.statistics-test figcaption').evaluate((caption) => { const range = document.createRange(); range.selectNodeContents(caption); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); });
  expect((await state(page)).selection).toEqual({ characters: 7, charactersWithoutWhitespace: 7, words: 1 });
  await page.evaluate(() => { const outside = document.createElement('p'); outside.textContent = 'Outside words'; document.body.append(outside); const range = document.createRange(); range.selectNodeContents(outside); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); });
  expect((await state(page)).selection).toEqual(zero);
  expect((await state(page)).document).toEqual({ characters: 11, charactersWithoutWhitespace: 11, words: 2 });
});

test('input, undo, redo, external replacement and readonly publish current counts without own edits', async ({ page }) => {
  await initialize(page, '<p>Hello</p>');
  await page.evaluate(() => window.editor.setSelection(5)); await page.keyboard.type(' world');
  expect((await state(page)).document).toEqual({ characters: 11, charactersWithoutWhitespace: 10, words: 2 });
  await page.evaluate(() => window.editor.undo()); expect((await state(page)).document.words).toBe(1);
  await page.evaluate(() => window.editor.redo()); expect((await state(page)).document.words).toBe(2);
  await page.evaluate(() => { window.editor.setReadOnly(true); window.editor.setHTML('<p>Новый текст</p>'); window.editor.setSelection(0, 5); });
  expect((await state(page)).document).toEqual({ characters: 11, charactersWithoutWhitespace: 10, words: 2 });
  expect((await state(page)).selection).toEqual({ characters: 5, charactersWithoutWhitespace: 5, words: 1 });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => window.statisticsEvents.some((event) => event.document.words === 2))).toBe(true);
});

test('subscriptions are not immediate, deliver copied states and stop idempotently', async ({ page }) => {
  await initialize(page, '<p>One</p>');
  expect(await page.evaluate(() => window.statisticsEvents.length)).toBe(0);
  expect(await page.evaluate(() => { const first = window.statisticsAPI.getState(); first.document.characters = 999; first.selection.words = 999; return window.statisticsAPI.getState(); })).toEqual({ document: { characters: 3, charactersWithoutWhitespace: 3, words: 1 }, selection: zero });
  await page.evaluate(() => { window.editor.setHTML('<p>Two words</p>'); });
  expect(await page.evaluate(() => window.statisticsEvents.length)).toBeGreaterThan(0);
  await page.evaluate(() => { window.statisticsEvents[0].document.words = 999; });
  expect((await state(page)).document.words).toBe(2);
  const count = await page.evaluate(() => { window.stopStatistics(); window.stopStatistics(); return window.statisticsEvents.length; });
  await page.evaluate(() => window.editor.setHTML('<p>Different</p>'));
  expect(await page.evaluate(() => window.statisticsEvents.length)).toBe(count);
});

test('selection-only subscriptions update without changing document, focus or history', async ({ page }) => {
  await initialize(page, '<p>One two</p>');
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.setSelection(0, 3));
  await expect.poll(() => page.evaluate(() => window.statisticsEvents.at(-1)?.selection.words)).toBe(1);
  const selected = await page.evaluate(() => window.getSelection()?.toString()); await state(page);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selected);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('a reused plugin and its disposed API do not share state across editors', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const plugin = window.createStatistics({ locale: 'en' }); const firstHost = document.createElement('div'); const secondHost = document.createElement('div'); document.body.append(firstHost, secondHost);
    const first = window.createEditor(firstHost, { value: '<p>One</p>', plugins: [plugin] }); const second = window.createEditor(secondHost, { value: '<p>Two words</p>', plugins: [plugin] });
    const firstAPI = window.statisticsCommands(first); const secondAPI = window.statisticsCommands(second); let calls = 0; const stop = firstAPI.subscribe(() => { calls++; });
    first.destroy(); let throws = false; try { firstAPI.getState(); } catch { throws = true; } stop(); stop();
    second.setHTML('<p>Still independent here</p>'); const result = throws && calls === 0 && secondAPI.getState().document.words === 3;
    second.destroy(); firstHost.remove(); secondHost.remove(); return result;
  })).toBe(true);
});

test('listener mutation and unsubscribe do not leak snapshots or corrupt notifications', async ({ page }) => {
  await initialize(page, '<p>Start</p>');
  expect(await page.evaluate(() => {
    const received: number[] = []; const stopFirst = window.statisticsAPI.subscribe((next) => { next.document.words = 999; });
    let stopSecond = () => {}; stopSecond = window.statisticsAPI.subscribe((next) => { received.push(next.document.words); stopSecond(); });
    window.editor.setHTML('<p>Two words</p>'); window.editor.setHTML('<p>Three words here</p>'); stopFirst();
    return received;
  })).toEqual([2]);
});

test('invalid locales reject before editor setup and SSR import/factory need no DOM', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => { try { window.createStatistics({ locale: 'bad_locale' }); } catch { return true; } return false; })).toBe(true);
  expect(await page.evaluate(() => { try { window.createStatistics({ locale: '' }); } catch { return true; } return false; })).toBe(true);
  // The module factory is evaluated without DOM in the separate Node-side import below.
  const { statistics } = await import('../packages/plugins/src/statistics.js');
  expect(statistics({ locale: 'ru' }).name).toBe('statistics');
});


test('decomposed words without precomposed forms count in context beside pictographic emoji', async ({ page }) => {
  await initialize(page, '<p>q<strong>́</strong> cat 👨‍👩‍👧‍👦</p>');
  expect((await state(page)).document).toEqual({ characters: 7, charactersWithoutWhitespace: 5, words: 2 });
});
