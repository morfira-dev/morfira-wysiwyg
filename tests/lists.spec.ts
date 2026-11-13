import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, html: string) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => { window.editor.setHTML(value); window.editor.setSelection(0); }, html);
};
const caret = async (page: Page, selector: string, offset = 0) => page.locator(`.mw-content ${selector}`).evaluate((element, position) => {
  const range = document.createRange(); const node = element.firstChild;
  if (node?.nodeType === Node.TEXT_NODE) range.setStart(node, position); else { range.selectNodeContents(element); range.collapse(position === 0); }
  range.collapse(true); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); window.editor.surface.focus();
}, offset);
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const undo = (page: Page) => page.evaluate(() => window.editor.undo());

test('multiple paragraphs form one list, and only the selected middle item changes kind or unwraps', async ({ page }) => {
  await initialize(page, '<p>A</p><p><strong>B</strong></p><p>C</p>');
  await page.evaluate(() => { window.editor.setSelection(0, 3); window.editor.format('list', 'bullet'); });
  expect(await html(page)).toBe('<ul><li>A</li><li><strong>B</strong></li><li>C</li></ul>');
  await page.evaluate(() => { window.editor.setSelection(1, 1); window.editor.format('list', 'ordered'); });
  expect(await html(page)).toBe('<ul><li>A</li></ul><ol><li><strong>B</strong></li></ol><ul><li>C</li></ul>');
  await page.evaluate(() => window.editor.format('list', false));
  expect(await html(page)).toBe('<ul><li>A</li></ul><p><strong>B</strong></p><ul><li>C</li></ul>');
  await undo(page); await expect(page.locator('.mw-content ol li')).toHaveText('B');
});

test('selection ending at next paragraph start does not format that paragraph', async ({ page }) => {
  await initialize(page, '<p>A</p><p>B</p>');
  await page.evaluate(() => { const range = document.createRange(); const blocks = window.editor.surface.querySelectorAll('p'); range.setStart(blocks[0].firstChild!, 0); range.setEnd(blocks[1].firstChild!, 0); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range); window.editor.format('list', 'ordered'); });
  expect(await html(page)).toBe('<ol><li>A</li></ol><p>B</p>');
});

test('indent/outdent moves a sibling range and restores selection and history', async ({ page }) => {
  await initialize(page, '<ul><li>A</li><li><em>B</em></li><li>C</li><li>D</li></ul>');
  await page.evaluate(() => { window.editor.setSelection(1, 2); window.editor.format('indent', 1); });
  expect(await html(page)).toBe('<ul><li>A<ul><li><em>B</em></li><li>C</li></ul></li><li>D</li></ul>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 2 });
  await page.evaluate(() => window.editor.format('indent', -1));
  expect(await html(page)).toBe('<ul><li>A</li><li><em>B</em></li><li>C</li><li>D</li></ul>');
  await undo(page); await expect(page.locator('.mw-content li ul > li')).toHaveCount(2);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 2 });
});

test('outdent retains trailing nested siblings under the last lifted item', async ({ page }) => {
  await initialize(page, '<ul><li>A<ol><li>B</li><li>C</li><li>D</li></ol></li><li>E</li></ul>');
  await caret(page, 'ol li:nth-child(2)');
  await page.evaluate(() => window.editor.format('indent', -1));
  expect(await html(page)).toBe('<ul><li>A<ol><li>B</li></ol></li><li>C<ol><li>D</li></ol></li><li>E</li></ul>');
});

test('first-item indent is a no-op; invalid multi-list indentation rejects atomically', async ({ page }) => {
  await initialize(page, '<ul><li>A</li></ul><p>B</p><ol><li>C</li></ol>'); const before = await html(page);
  await page.evaluate(() => window.editor.format('indent', 1)); expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  const error = await page.evaluate(() => { window.editor.setSelection(0, 3); try { window.editor.format('indent', 1); } catch (error) { return String(error); } });
  expect(error).toContain('consecutive'); expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('nesting depth is bounded at eight levels', async ({ page }) => {
  await initialize(page, '<ul><li>A</li><li>B</li></ul>');
  await page.evaluate(() => {
    let nested = '<ul><li>Prior</li><li>Deep</li></ul>'; for (let i = 0; i < 7; i++) nested = `<ul><li>P</li><li>${nested}</li></ul>`;
    window.editor.setHTML(nested); const items = window.editor.surface.querySelectorAll('li'); const item = items[items.length - 1]; const range = document.createRange(); range.selectNodeContents(item); range.collapse(true); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range);
  });
  const before = await html(page); expect(await page.evaluate(() => window.editor.getFormats().listDepth)).toBe(8);
  await page.evaluate(() => window.editor.format('indent', 1)); expect(await html(page)).toBe(before);
});

test('Enter splits rich content and following sublists, with exact undo caret', async ({ page }) => {
  await initialize(page, '<ul><li><strong>Hello</strong> world<ul><li>Child</li></ul></li><li>Next</li></ul>');
  await page.evaluate(() => window.editor.setSelection(2)); const before = await html(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.mw-content > ul > li')).toHaveCount(3);
  await expect(page.locator('.mw-content > ul > li').nth(0)).toHaveText('He');
  await expect(page.locator('.mw-content > ul > li').nth(1)).toHaveText('llo worldChild');
  await expect(page.locator('.mw-content > ul > li').nth(1).locator('strong')).toHaveText('llo');
  await undo(page); expect(await html(page)).toBe(before); expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.evaluate(() => window.editor.redo()); await page.keyboard.type('X'); await expect(page.locator('.mw-content > ul > li').nth(1)).toContainText('Xllo');
});

test('Enter replaces an inline selection before splitting', async ({ page }) => {
  await initialize(page, '<ol><li>ABCDEF</li></ol>'); await page.evaluate(() => window.editor.setSelection(2, 2)); await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<ol><li>AB</li><li>EF</li></ol>'); await page.keyboard.type('x'); await expect(page.locator('.mw-content li').nth(1)).toHaveText('xEF');
});

test('empty root Enter exits between preserved list fragments and undo restores the empty item', async ({ page }) => {
  await initialize(page, '<ul><li>A</li><li><br></li><li>B</li></ul>'); await caret(page, 'li:nth-child(2)');
  await page.keyboard.press('Enter'); expect(await html(page)).toBe('<ul><li>A</li></ul><p><br></p><ul><li>B</li></ul>');
  await page.keyboard.type('X'); await expect(page.locator('.mw-content > p')).toHaveText('X');
  await undo(page); await undo(page); await expect(page.locator('.mw-content li')).toHaveCount(3);
  await page.keyboard.type('Y'); await expect(page.locator('.mw-content li').nth(1)).toHaveText('Y');
});

test('empty nested Enter outdents one level; Shift+Enter stays inside an item', async ({ page }) => {
  await initialize(page, '<ul><li>A<ol><li><br></li><li>B</li></ol></li></ul>'); await caret(page, 'ol li:first-child');
  await page.keyboard.press('Enter'); await expect(page.locator('.mw-content > ul > li')).toHaveCount(2);
  await expect(page.locator('.mw-content > ul > li').nth(1).locator('ol li')).toHaveText('B');
  await page.keyboard.type('X'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('Y');
  await expect(page.locator('.mw-content > ul > li')).toHaveCount(2); await expect(page.locator('.mw-content > ul > li').nth(1)).toContainText('X');
});

test('Backspace joins sibling items at the caret and preserves sublists and images', async ({ page }) => {
  await initialize(page, '<ul><li><strong>A</strong><ul><li>Child</li></ul></li><li>B<img src="/x.png" alt="x"><ol><li>Other</li></ol></li></ul>');
  await caret(page, 'ul > li:nth-child(2)'); const before = await html(page);
  await page.keyboard.press('Backspace'); await expect(page.locator('.mw-content > ul > li')).toHaveCount(1);
  await expect(page.locator('.mw-content img')).toHaveCount(1); await expect(page.locator('.mw-content ol li')).toHaveText('Other');
  await page.keyboard.type('X'); await expect(page.locator('.mw-content > ul > li')).toContainText('AXB');
  await undo(page); await undo(page); expect(await html(page)).toBe(before);
});

test('Backspace at first root item unwraps; at first nested item outdents', async ({ page }) => {
  await initialize(page, '<ol><li>A</li><li>B</li></ol>'); await caret(page, 'li:first-child'); await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<p>A</p><ol><li>B</li></ol>');
  await initialize(page, '<ul><li>A<ol><li>B</li></ol></li></ul>'); await caret(page, 'ol li'); await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<ul><li>A</li><li>B</li></ul>');
});

test('Tab and Shift+Tab nest lists; cell Tab keeps table navigation', async ({ page }) => {
  await initialize(page, '<ul><li>A</li><li>B</li></ul>'); await caret(page, 'li:nth-child(2)'); await page.keyboard.press('Tab'); await expect(page.locator('.mw-content li ul li')).toHaveText('B');
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('.mw-content > ul > li')).toHaveCount(2);
  await initialize(page, '<table><tbody><tr><td><ul><li>A</li><li>B</li></ul></td><td><p>C</p></td></tr></tbody></table>'); await caret(page, 'li:nth-child(2)'); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('td')?.textContent)).toBe('C');
});

test('block formatting retains li structure and nearest nested list type', async ({ page }) => {
  await initialize(page, '<ul><li>A<ol><li><p>B</p></li></ol></li></ul>'); await caret(page, 'ol p');
  expect(await page.evaluate(() => window.editor.getFormats().list)).toBe('ordered');
  await page.evaluate(() => window.editor.format('header', 3));
  await expect(page.locator('.mw-content ol > li > h3')).toHaveText('B'); await expect(page.locator('.mw-content ol > h3')).toHaveCount(0);
  await expect(page.locator('.mw-content ol > li > p')).toHaveCount(0);
});

test('readonly and composition do not execute list commands or structural input', async ({ page }) => {
  await initialize(page, '<ul><li>A</li><li>B</li></ul>'); await caret(page, 'li:nth-child(2)'); const before = await html(page);
  await page.evaluate(() => { window.editor.setReadOnly(true); window.editor.format('indent', 1); window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })); });
  expect(await html(page)).toBe(before);
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', isComposing: true, bubbles: true, cancelable: true })); });
  expect(await html(page)).toBe(before);
});

test('formatting one inner paragraph preserves sibling paragraphs and list structure', async ({ page }) => {
  await initialize(page, '<ul><li><p>First</p><p>Second</p><ul><li>Child</li></ul></li></ul>');
  await caret(page, 'li > p:nth-child(2)', 2); await page.evaluate(() => window.editor.format('header', 2));
  expect(await html(page)).toBe('<ul><li><p>First</p><h2>Second</h2><ul><li>Child</li></ul></li></ul>');
});

test('joining into a placeholder item leaves no leading line break', async ({ page }) => {
  await initialize(page, '<ul><li><p><br></p></li><li><p>B</p></li></ul>');
  await caret(page, 'li:nth-child(2) p'); await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<ul><li><p>B</p></li></ul>');
});

test('beforeinput-only list editing is undoable without keyboard events', async ({ page }) => {
  await initialize(page, '<ul><li>AB</li></ul>'); await page.evaluate(() => { window.editor.setSelection(1); window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })); });
  expect(await html(page)).toBe('<ul><li>A</li><li>B</li></ul>'); await undo(page); expect(await html(page)).toBe('<ul><li>AB</li></ul>');
});

test('host-page lists do not affect the embedded editor list commands or depth', async ({ page }) => {
  await initialize(page, '<p>Original</p>');
  await page.evaluate(() => {
    window.dispose(); const outer = document.createElement('ul'); outer.innerHTML = '<li><div></div></li>'; document.body.append(outer);
    window.editor = window.createEditor(outer.querySelector('div')!, { value: '<p>A</p><p>B</p>' });
    window.editor.setSelection(0, 2); window.editor.format('list', 'bullet'); window.editor.setSelection(1, 1); window.editor.format('indent', 1);
  });
  expect(await html(page)).toBe('<ul><li>A<ul><li>B</li></ul></li></ul>');
  expect(await page.evaluate(() => window.editor.getFormats().listDepth)).toBe(2);
});

test('empty heading item exits into a paragraph and preserves its caret', async ({ page }) => {
  await initialize(page, '<ul><li><h3><br></h3></li><li>B</li></ul>'); await caret(page, 'h3'); await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<p><br></p><ul><li>B</li></ul>'); await page.keyboard.type('A'); await expect(page.locator('.mw-content > p')).toHaveText('A');
});

test('Enter before a following sublist leaves the caret in the new parent item', async ({ page }) => {
  await initialize(page, '<ul><li><strong>A</strong><ul><li>Child</li></ul></li></ul>');
  await page.evaluate(() => window.editor.setSelection(1)); await page.keyboard.press('Enter'); await page.keyboard.type('B');
  await expect(page.locator('.mw-content > ul > li').nth(1)).toContainText('B');
  await expect(page.locator('.mw-content > ul > li').nth(1).locator('ul > li')).toHaveText('Child');
});

test('malformed list neighbors are not used as nesting or merge targets', async ({ page }) => {
  await initialize(page, '<ul><p>Outside item</p><li>A</li></ul>'); await caret(page, 'li'); const before = await html(page);
  await page.evaluate(() => window.editor.format('indent', 1)); expect(await html(page)).toBe(before);
  await page.keyboard.press('Backspace'); expect(await html(page)).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});
