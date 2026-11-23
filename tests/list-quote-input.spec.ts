import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { listQuoteBeforeInput, listQuoteCaret, setupListQuoteInput } from './list-quote-input.fixture.js';

const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

for (const forward of [false, true]) test(`${forward ? 'Delete' : 'Backspace'} joins outer body and quote edge with exact history and surviving branches`, async ({ page }) => {
  const original = '<ul><li><p title="Left" dir="rtl"><strong>A😀</strong></p><blockquote title="Quote" dir="ltr"><h3 title="Right"><em>Б</em></h3><p title="Keep">Keep</p></blockquote><p title="After">After</p><ol title="Branch"><li>Nested</li></ol></li><li>Other</li></ul>';
  const joined = '<ul><li><p title="Left" dir="rtl"><strong>A😀</strong><em>Б</em></p><blockquote title="Quote" dir="ltr"><p title="Keep">Keep</p></blockquote><p title="After">After</p><ol title="Branch"><li>Nested</li></ol></li><li>Other</li></ul>';
  await setupListQuoteInput(page, original);
  const keep = await page.locator('.mw-content [title="Quote"],.mw-content [title="Keep"],.mw-content [title="After"],.mw-content [title="Branch"]').elementHandles();
  await listQuoteCaret(page, forward ? '[title="Left"]' : '[title="Right"]', forward);
  await page.keyboard.press(forward ? 'Delete' : 'Backspace');
  expect(await html(page)).toBe(joined);
  expect(await page.evaluate(() => ({ changes: window.changes.length, selection: window.editor.getSelection() })))
    .toEqual({ changes: 1, selection: { index: 3, length: 0 } });
  for (const node of keep) expect(await node.evaluate((element) => element.isConnected)).toBe(true);
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="Left"]')).toHaveText('A😀XБ');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(joined);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), anchor: (document.getSelection()!.anchorNode as Element).getAttribute?.('title'), offset: document.getSelection()!.anchorOffset })))
    .toEqual({ undo: false, anchor: forward ? 'Left' : 'Right', offset: forward ? 1 : 0 });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(joined);
});

test('beforeinput joins quote child siblings, empty placeholders and inline quote boundaries without flattening other wrappers', async ({ page }) => {
  await setupListQuoteInput(page, '<ul><li><blockquote title="Q"><p title="A"><br></p><h2 title="B"><u>B</u></h2><p title="C">C</p></blockquote><blockquote title="Inline">D</blockquote><p title="After">E</p></li></ul>');
  await listQuoteCaret(page, '[title="B"]');
  expect(await listQuoteBeforeInput(page, false)).toBe(true);
  expect(await html(page)).toBe('<ul><li><blockquote title="Q"><p title="A"><u>B</u></p><p title="C">C</p></blockquote><blockquote title="Inline">D</blockquote><p title="After">E</p></li></ul>');
  await listQuoteCaret(page, '[title="C"]', true);
  expect(await listQuoteBeforeInput(page, true)).toBe(true);
  expect(await html(page)).toBe('<ul><li><blockquote title="Q"><p title="A"><u>B</u></p><p title="C">CD</p></blockquote><p title="After">E</p></li></ul>');
  await listQuoteCaret(page, '[title="After"]');
  expect(await listQuoteBeforeInput(page, false)).toBe(true);
  expect(await html(page)).toBe('<ul><li><blockquote title="Q"><p title="A"><u>B</u></p><p title="C">CDE</p></blockquote></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toContain('<p title="C">CD</p></blockquote><p title="After">E</p>');
});

test('quote and LI element-offset boundaries use the same adjacent pair and preserve the surviving quote attributes', async ({ page }) => {
  const before = await setupListQuoteInput(page, '<ol><li><blockquote title="Left" dir="rtl"><p>A</p></blockquote><blockquote title="Right" style="text-align: right">\n<h2>B</h2>\n<p title="Keep">C</p>\n</blockquote></li></ol>');
  await page.evaluate(() => {
    const item = window.editor.surface.querySelector('li')!;
    window.editor.focus();
    document.getSelection()!.setBaseAndExtent(item, 1, item, 1);
  });
  expect(await listQuoteBeforeInput(page, true)).toBe(true);
  await expect(page.locator('.mw-content [title="Left"]')).toHaveJSProperty('innerHTML', '<p>AB</p>');
  await expect(page.locator('.mw-content [title="Right"]')).toHaveText(/C/);
  await expect(page.locator('.mw-content [title="Right"]')).toHaveAttribute('style', 'text-align: right');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => {
    const quote = window.editor.surface.querySelector('[title="Right"]')!;
    window.editor.focus();
    document.getSelection()!.setBaseAndExtent(quote, 0, quote, 0);
  });
  expect(await listQuoteBeforeInput(page, false)).toBe(true);
  await expect(page.locator('.mw-content [title="Left"]')).toHaveJSProperty('innerHTML', '<p>AB</p>');
});

test('branches, image-bearing quotes, semantic inline nodes and nested quote boundaries are atomic no-ops', async ({ page }) => {
  const cases = [
    '<p title="A">A</p><ul><li>Branch</li></ul><blockquote><p title="B">B</p></blockquote>',
    '<blockquote><p>A<img src="/logo.svg" alt="Kept"></p></blockquote><p title="B">B</p>',
    '<blockquote><p>A<span data-mw-node="test:token">ID</span></p></blockquote><p title="B">B</p>',
    '<blockquote><blockquote><p title="A">A</p><p title="B">B</p></blockquote></blockquote>',
  ];
  for (const bodies of cases) {
    const before = await setupListQuoteInput(page, `<ul><li>${bodies}</li></ul>`, [{ name: 'test:token', kind: 'inline', tag: 'span' }]);
    await listQuoteCaret(page, '[title="B"]');
    expect(await listQuoteBeforeInput(page, false)).toBe(true);
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
  }
});

test('foreign live descendants and semantic owners remain guarded without deleting either side', async ({ page }) => {
  await setupListQuoteInput(page, '<ul><li><blockquote><p title="A">A</p></blockquote><p title="B">B</p></li></ul>');
  const before = await page.evaluate(() => {
    const first = window.editor.surface.querySelector('[title="A"]')!;
    first.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    return window.editor.surface.innerHTML;
  });
  await listQuoteCaret(page, '[title="B"]');
  expect(await listQuoteBeforeInput(page, false)).toBe(true);
  expect(await page.evaluate(() => window.editor.surface.innerHTML)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('canceled, read-only and composition input cannot join; nested transaction failure rolls the accepted join back', async ({ page }) => {
  const before = await setupListQuoteInput(page, '<ul><li><blockquote><p title="A">A</p></blockquote><p title="B">B</p></li></ul>');
  await listQuoteCaret(page, '[title="B"]');
  await page.evaluate(() => window.editor.surface.addEventListener('beforeinput', (event) => event.preventDefault(), { capture: true, once: true }));
  expect(await listQuoteBeforeInput(page, false)).toBe(true);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await listQuoteBeforeInput(page, false);
  await page.evaluate(() => window.editor.setReadOnly(false));
  await listQuoteCaret(page, '[title="B"]');
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await listQuoteBeforeInput(page, false);
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await listQuoteCaret(page, '[title="B"]');
  const rolledBack = await page.evaluate(() => {
    try {
      window.editor.transact(() => {
        window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
        if (window.editor.surface.querySelector('[title="B"]')) throw new Error('Join did not execute.');
        throw new Error('Forced transaction failure.');
      });
    }
    catch (error) { return (error as Error).message === 'Forced transaction failure.'; }
    return false;
  });
  expect(rolledBack).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: (document.getSelection()!.anchorNode as Element).getAttribute?.('title'), offset: document.getSelection()!.anchorOffset })))
    .toEqual({ changes: 0, undo: false, anchor: 'B', offset: 0 });
});

test('quote joins inside a merged cell preserve the actual table grid and other cells', async ({ page }) => {
  const before = await setupListQuoteInput(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ul><li><p title="A">A</p><blockquote><h3 title="B">B</h3></blockquote></li></ul></td><td>Other1</td></tr><tr><td>Other2</td></tr></tbody></table>');
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const others = await page.locator('.mw-content td').allTextContents();
  await listQuoteCaret(page, '[title="A"]', true);
  await page.keyboard.press('Delete');
  await expect(page.locator('.mw-content [title="A"]')).toHaveText('AB');
  expect(await cell!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  expect((await page.locator('.mw-content td').allTextContents()).slice(1)).toEqual(others.slice(1));
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});


test('LI element offsets next to a nested branch refuse both deletion directions without moving selection', async ({ page }) => {
  const before = await setupListQuoteInput(page, '<ul><li><p>A</p><ul><li>Branch</li></ul><blockquote><p>C</p></blockquote></li></ul>');
  for (const forward of [false, true]) {
    const offset = forward ? 2 : 1;
    await page.evaluate((offset) => {
      const item = window.editor.surface.querySelector('li')!;
      window.editor.focus();
      document.getSelection()!.setBaseAndExtent(item, offset, item, offset);
    }, offset);
    expect(await listQuoteBeforeInput(page, forward)).toBe(true);
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => ({ sameNode: document.getSelection()!.anchorNode === window.editor.surface.querySelector('li'),
      offset: document.getSelection()!.anchorOffset, changes: window.changes.length, undo: window.editor.canUndo() })))
      .toEqual({ sameNode: true, offset, changes: 0, undo: false });
  }
});


test('absolute Backspace in quote-only items retains existing root unwrap and nested lift', async ({ page }) => {
  const samples = [
    { before: '<ul><li><blockquote title="Q"><p>A</p></blockquote></li></ul><p>After</p>',
      after: '<blockquote title="Q"><p>A</p></blockquote><p>After</p>' },
    { before: '<ul><li>Parent<ul><li><blockquote title="Q"><p>A</p></blockquote></li></ul></li><li>Other</li></ul>',
      after: '<ul><li>Parent</li><li><blockquote title="Q"><p>A</p></blockquote></li><li>Other</li></ul>' },
  ];
  for (const sample of samples) {
    await setupListQuoteInput(page, sample.before);
    await listQuoteCaret(page, '[title="Q"] p');
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe(sample.after);
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(sample.before);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  }
});
