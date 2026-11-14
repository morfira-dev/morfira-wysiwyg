import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'composition-tables-test';
    document.body.append(host);
    window.editor = window.createEditor(host, {
      value: '<p>Before</p><table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr></tbody></table><p>After</p>',
      plugins: [window.createTables()],
    });
    window.changes = [];
    window.editor.subscribe((change) => window.changes.push(change));
  });
};

for (const mode of ['session', 'isComposing', 'legacy229'] as const) {
  for (const shiftKey of [false, true]) test(`table ${shiftKey ? 'Shift+Tab' : 'Tab'} does not navigate during ${mode}`, async ({ page }) => {
    await initialize(page);
    const beforeHTML = await page.evaluate(() => window.editor.getHTML());
    const beforeSelection = await page.evaluate(({ reverse, composing }) => {
      const root = window.editor.surface;
      const cells = root.querySelectorAll('td');
      const paragraph = cells[reverse ? 0 : cells.length - 1].querySelector('p')!;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(true);
      const selection = document.getSelection()!;
      root.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      if (composing === 'session') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      return window.editor.getSelection();
    }, { reverse: shiftKey, composing: mode });
    expect(await page.evaluate(({ reverse, composing }) => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab', bubbles: true, cancelable: true, shiftKey: reverse,
        isComposing: composing === 'isComposing', keyCode: composing === 'legacy229' ? 229 : 9,
      });
      window.editor.surface.dispatchEvent(event);
      return event.defaultPrevented;
    }, { reverse: shiftKey, composing: mode })).toBe(false);
    expect(await page.evaluate(() => window.editor.getSelection())).toEqual(beforeSelection);
    expect(await page.evaluate(() => document.getSelection()!.anchorNode!.parentElement!.closest('td')!.textContent)).toBe(shiftKey ? 'A' : 'C');
    expect(await page.evaluate(() => window.editor.getHTML())).toBe(beforeHTML);
    await expect(page.locator('.composition-tables-test tr')).toHaveCount(2);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
    expect(await page.evaluate(() => window.changes.length)).toBe(0);

    if (mode === 'session') await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })));
    await page.keyboard.press(shiftKey ? 'Shift+Tab' : 'Tab');
    if (shiftKey) {
      expect(await page.evaluate(() => {
        const anchor = document.getSelection()!.anchorNode!;
        const element = anchor.nodeType === 1 ? anchor as Element : anchor.parentElement!;
        return element.closest('p')!.textContent;
      })).toBe('Before');
      expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
    }
    else {
      await expect(page.locator('.composition-tables-test tr')).toHaveCount(3);
      expect(await page.evaluate(() => window.changes.length)).toBe(1);
      await page.evaluate(() => window.editor.undo());
      expect(await page.evaluate(() => window.editor.getHTML())).toBe(beforeHTML);
    }
  });
}
