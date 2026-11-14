import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value = '<p>ab</p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((html) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'statistics-reuse-test';
    document.body.append(host);
    window.editor = window.createEditor(host, { value: html, plugins: [window.createStatistics({ locale: 'en' })] });
    window.statisticsAPI = window.statisticsCommands(window.editor);
    window.statisticsEvents = [];
    window.stopStatistics = window.statisticsAPI.subscribe((state) => window.statisticsEvents.push(state));
  }, value);
};

const zero = { characters: 0, charactersWithoutWhitespace: 0, words: 0 };

test('same-task semantic barriers change counts even when concatenated text is identical', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const original = window.statisticsAPI.getState();
    const words: number[] = [];
    for (const html of [
      '<p>a<br>b</p>',
      '<p><strong>a</strong><em>b</em></p>',
      '<p>a</p><p>b</p>',
      '<p>a<svg></svg>b</p>',
      '<p>a<span></span>b</p>',
      '<p>a<script></script>b</p>',
      '<p>ab</p>',
    ]) {
      root.innerHTML = html;
      if (root.textContent !== 'ab') throw new Error('The barrier fixture must preserve the same concatenated text.');
      const state = window.statisticsAPI.getState();
      if (state.document.characters !== 2) throw new Error('Synthetic barriers must not add characters.');
      words.push(state.document.words);
    }
    return { original, words, final: window.statisticsAPI.getState(), events: window.statisticsEvents.length };
  });
  expect(result.original.document).toEqual({ characters: 2, charactersWithoutWhitespace: 2, words: 1 });
  expect(result.words).toEqual([2, 1, 2, 2, 1, 2, 1]);
  expect(result.final).toEqual({ document: result.original.document, selection: zero });
  expect(result.events).toBe(0);
});

test('graphemes recombine across inline marks but remain split by actual barriers', async ({ page }) => {
  await initialize(page, '<p>e<strong>\u0301</strong></p>');
  const result = await page.evaluate(() => {
    const values = [window.statisticsAPI.getState().document];
    window.editor.surface.innerHTML = '<p>e<br>\u0301</p>';
    values.push(window.statisticsAPI.getState().document);
    window.editor.surface.innerHTML = '<p><em>e</em><strong>\u0301</strong></p>';
    values.push(window.statisticsAPI.getState().document);
    window.editor.surface.innerHTML = '<p>👨‍👩‍👧‍👦</p><p>🇷🇺</p>';
    values.push(window.statisticsAPI.getState().document);
    return values;
  });
  expect(result.map((value) => value.characters)).toEqual([1, 2, 1, 2]);
  expect(result.map((value) => value.charactersWithoutWhitespace)).toEqual([1, 2, 1, 2]);
  expect(result.map((value) => value.words)).toEqual([1, 1, 1, 0]);
});

test('formatting-only changes preserve metrics and do not create metric notifications', async ({ page }) => {
  await initialize(page, '<p>One two</p><p>Three</p>');
  const result = await page.evaluate(() => {
    window.editor.setSelection(0, 3);
    const before = window.statisticsAPI.getState();
    const beforeText = window.editor.surface.textContent;
    window.statisticsEvents = [];
    window.editor.format('bold', true);
    const after = window.statisticsAPI.getState();
    const selected = window.getSelection()?.toString();
    const events = window.statisticsEvents.length;
    window.editor.surface.querySelector('p')!.setAttribute('style', 'color: red');
    const styled = window.statisticsAPI.getState();
    return { before, after, styled, selected, events, beforeText, afterText: window.editor.surface.textContent, bold: window.editor.surface.querySelector('strong')?.textContent };
  });
  expect(result.after).toEqual(result.before);
  expect(result.styled).toEqual(result.before);
  expect(result.selected).toBe('One');
  expect(result.bold).toBe('One');
  expect(result.beforeText).toBe(result.afterText);
  expect(result.events).toBe(0);
});

test('edited runs stay current through native input, history and read-only replacement', async ({ page }) => {
  await initialize(page, '<p>one</p><p>two</p>');
  await page.evaluate(() => window.editor.setSelection(3));
  await page.keyboard.type(' more');
  expect(await page.evaluate(() => window.statisticsAPI.getState().document)).toEqual({ characters: 11, charactersWithoutWhitespace: 10, words: 3 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.statisticsAPI.getState().document)).toEqual({ characters: 6, charactersWithoutWhitespace: 6, words: 2 });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.statisticsAPI.getState().document.words)).toBe(3);
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.editor.setHTML('<p>new words here</p>');
    window.editor.setSelection(4, 5);
  });
  expect(await page.evaluate(() => window.statisticsAPI.getState())).toEqual({
    document: { characters: 14, charactersWithoutWhitespace: 12, words: 3 },
    selection: { characters: 5, charactersWithoutWhitespace: 5, words: 1 },
  });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('per-instance reused counts never become caller-owned state and clear with disposal', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const plugin = window.createStatistics({ locale: 'en' });
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    document.body.append(hostA, hostB);
    const first = window.createEditor(hostA, { value: '<p>one</p>', plugins: [plugin] });
    const second = window.createEditor(hostB, { value: '<p>two words</p>', plugins: [plugin] });
    const a = window.statisticsCommands(first);
    const b = window.statisticsCommands(second);
    const firstSnapshot = a.getState();
    const secondSnapshot = b.getState();
    firstSnapshot.document.words = 999;
    first.surface.innerHTML = '<p>two words</p>';
    const changedFirst = a.getState().document.words;
    first.destroy();
    let disposed = false;
    try { a.getState(); } catch { disposed = true; }
    second.surface.innerHTML = '<p>fresh</p>';
    const changedSecond = b.getState().document.words;
    const retained = secondSnapshot.document.words;
    second.destroy();
    hostA.remove();
    hostB.remove();
    return { changedFirst, changedSecond, retained, disposed };
  });
  expect(result).toEqual({ changedFirst: 2, changedSecond: 1, retained: 2, disposed: true });
});

test('reentrant notifications preserve independent aggregates across a queued nested replacement', async ({ page }) => {
  await initialize(page, '<p>One</p>');
  const result = await page.evaluate(() => {
    const seen: number[] = [];
    let replaced = false;
    const first = window.statisticsAPI.subscribe((state) => {
      if (!replaced && state.document.words === 2) {
        replaced = true;
        state.document.words = 999;
        window.editor.setHTML('<p>Three words now</p>');
      }
    });
    const second = window.statisticsAPI.subscribe((state) => { seen.push(state.document.words); });
    window.editor.setHTML('<p>Two words</p>');
    const final = window.statisticsAPI.getState();
    first();
    second();
    return { seen, final };
  });
  expect(result.seen).toEqual([2, 3]);
  expect(result.final.document.words).toBe(3);
});
