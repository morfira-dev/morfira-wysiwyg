import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, html: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((html) => {
    window.editor.setHTML(html);
    window.changes.length = 0;
  }, html);
};

const caret = async (page: Page, selector: string, offset: number) => {
  await page.evaluate(({ selector, offset }) => {
    const root = window.editor.surface;
    root.focus();
    const node = root.querySelector(selector)!.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
  }, { selector, offset });
};

const html = async (page: Page) => page.evaluate(() => window.editor.getHTML());

for (const list of ['ul', 'ol']) test(`Enter splits a middle heading and moves subsequent actual blocks/branches in ${list}`, async ({ page }) => {
  const original = `<${list}><li title="First"><p>Before</p><h2 style="text-align: center"><strong>A😀B</strong></h2><p title="Later">After</p><ul title="Branch"><li>Nested</li></ul></li><li>Keep</li></${list}>`;
  await initialize(page, original);
  const prior = await page.locator('.mw-content li > p').first().elementHandle();
  const later = await page.locator('.mw-content [title="Later"]').elementHandle();
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  await caret(page, 'strong', 3);
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe(`<${list}><li title="First"><p>Before</p><h2 style="text-align: center"><strong>A😀</strong></h2></li><li title="First"><h2 style="text-align: center"><strong>B</strong></h2><p title="Later">After</p><ul title="Branch"><li>Nested</li></ul></li><li>Keep</li></${list}>`);
  expect(await prior!.evaluate((node) => node.isConnected && node.parentElement === window.editor.surface.querySelector('li'))).toBe(true);
  expect(await later!.evaluate((node) => node.isConnected && node.previousElementSibling?.localName === 'h2')).toBe(true);
  expect(await branch!.evaluate((node) => node.isConnected && node.previousElementSibling?.getAttribute('title') === 'Later')).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => document.getSelection()!.anchorOffset)).toBe(3);
});

test('Enter on an empty body in a multi-body item splits rather than exiting the list', async ({ page }) => {
  await initialize(page, '<ul><li><p>Before</p><h3><br></h3><p>After</p></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    const body = root.querySelector('h3')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(body, 0, body, 0);
  });
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<ul><li><p>Before</p><h3><br></h3></li><li><h3><br></h3><p>After</p></li></ul>');
  await expect(page.locator('.mw-content > p, .mw-content li > br')).toHaveCount(0);
});

test('Shift+Enter changes only its current body and leaves later actual blocks attached', async ({ page }) => {
  const original = '<ul><li><p>Before</p><h2>AB</h2><p title="Later">After</p><ul><li>Nested</li></ul></li></ul>';
  await initialize(page, original);
  const later = await page.locator('.mw-content [title="Later"]').elementHandle();
  await caret(page, 'h2', 1);
  await page.keyboard.press('Shift+Enter');
  expect(await html(page)).toBe('<ul><li><p>Before</p><h2>A<br>B</h2><p title="Later">After</p><ul><li>Nested</li></ul></li></ul>');
  expect(await later!.evaluate((node) => node.isConnected && node.parentElement === window.editor.surface.querySelector('li'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

for (const backward of [false, true]) test(`${backward ? 'Backspace' : 'Delete'} joins adjacent bodies inside one item without flattening unrelated blocks`, async ({ page }) => {
  const original = '<ol><li><p title="Before">Keep</p><h2 style="text-align: center"><strong>AB</strong></h2><p><em>CD</em></p><h3 title="After">After</h3><ul><li>Nested</li></ul></li></ol>';
  await initialize(page, original);
  const untouched = await page.locator('.mw-content [title="After"]').elementHandle();
  await caret(page, backward ? 'em' : 'strong', backward ? 0 : 2);
  await page.keyboard.press(backward ? 'Backspace' : 'Delete');
  expect(await html(page)).toBe('<ol><li><p title="Before">Keep</p><h2 style="text-align: center"><strong>AB</strong><em>CD</em></h2><h3 title="After">After</h3><ul><li>Nested</li></ul></li></ol>');
  expect(await untouched!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content h2')).toHaveText('ABXCD');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(original);
});

test('Delete across items preserves later right bodies and both independent branch subtrees', async ({ page }) => {
  const original = '<ul><li><p>Before</p><h2>AB</h2><ul title="Left"><li>L</li></ul></li><li><p><em>CD</em></p><h3 title="Later">Later</h3><ol title="Right"><li>R</li></ol></li><li>Keep</li></ul>';
  await initialize(page, original);
  const later = await page.locator('.mw-content [title="Later"]').elementHandle();
  const branch = await page.locator('.mw-content [title="Right"]').elementHandle();
  await caret(page, 'h2', 2);
  await page.keyboard.press('Delete');
  expect(await html(page)).toBe('<ul><li><p>Before</p><h2>AB<em>CD</em></h2><h3 title="Later">Later</h3><ul title="Left"><li>L</li></ul><ol title="Right"><li>R</li></ol></li><li>Keep</li></ul>');
  expect(await later!.evaluate((node) => node.isConnected && node.parentElement === window.editor.surface.querySelector('li'))).toBe(true);
  expect(await branch!.evaluate((node) => node.isConnected && node.parentElement === window.editor.surface.querySelector('li'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

test('Delete promotes an inline left body only when subsequent right blocks must survive', async ({ page }) => {
  await initialize(page, '<ul><li><strong>AB</strong></li><li><p>CD</p><h3>Later</h3></li></ul>');
  await caret(page, 'strong', 2);
  await page.keyboard.press('Delete');
  expect(await html(page)).toBe('<ul><li><p><strong>AB</strong>CD</p><h3>Later</h3></li></ul>');
  await expect(page.locator('.mw-content li > strong')).toHaveCount(0);
});

test('first-body Backspace and cross-item Enter/Shift+Enter are atomic barriers', async ({ page }) => {
  const original = '<ul><li>Previous</li><li><p>AB</p><h2>CD</h2></li></ul>';
  await initialize(page, original);
  await caret(page, 'p', 0);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  for (const key of ['Enter', 'Shift+Enter']) {
    await page.evaluate(() => {
      const root = window.editor.surface;
      root.focus();
      document.getSelection()!.setBaseAndExtent(root.querySelector('h2')!.firstChild!, 1, root.querySelector('li')!.firstChild!, 1);
    });
    await page.keyboard.press(key);
    expect(await html(page)).toBe(original);
    expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset, changes: window.changes.length }))).toEqual({ anchor: 1, focus: 1, changes: 0 });
  }
});

for (const shift of [false, true]) test(`${shift ? 'Shift+Enter' : 'Enter'} replaces a backward selection across bodies in one transaction`, async ({ page }) => {
  const original = '<ul><li><p title="Before">Before</p><p>AB</p><h2>CD</h2><h3 title="Later">After</h3><ul><li>Nested</li></ul></li></ul>';
  await initialize(page, original);
  const later = await page.locator('.mw-content [title="Later"]').elementHandle();
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2')!.firstChild!, 1, root.querySelectorAll('p')[1].firstChild!, 1);
  });
  await page.keyboard.press(shift ? 'Shift+Enter' : 'Enter');
  expect(await html(page)).toBe(shift
    ? '<ul><li><p title="Before">Before</p><p>A<br>D</p><h3 title="Later">After</h3><ul><li>Nested</li></ul></li></ul>'
    : '<ul><li><p title="Before">Before</p><p>A</p></li><li><p>D</p><h3 title="Later">After</h3><ul><li>Nested</li></ul></li></ul>');
  expect(await later!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode?.textContent, anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode?.textContent, focusOffset: document.getSelection()!.focusOffset }))).toEqual({ anchor: 'CD', anchorOffset: 1, focus: 'AB', focusOffset: 1 });
});

test('Delete at an item-level boundary resolves to the preceding body end and restores that endpoint on undo', async ({ page }) => {
  const original = '<ul><li><p>AB</p><h2>CD</h2><p>Keep</p></li></ul>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const item = root.querySelector('li')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(item, 1, item, 1);
  });
  await page.keyboard.press('Delete');
  expect(await html(page)).toBe('<ul><li><p>ABCD</p><p>Keep</p></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => ({ onItem: document.getSelection()!.anchorNode === window.editor.surface.querySelector('li'), offset: document.getSelection()!.anchorOffset }))).toEqual({ onItem: true, offset: 1 });
});

for (const first of [false, true]) test(`Backspace after an empty body's placeholder ${first ? 'blocks the first-body boundary' : 'joins an interior body'}`, async ({ page }) => {
  const original = first ? '<ul><li><p><br></p><h2>After</h2></li></ul>' : '<ul><li><h2>Before</h2><p><br></p><h3>After</h3></li></ul>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const body = root.querySelector('p')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(body, 1, body, 1);
  });
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe(first ? original : '<ul><li><h2>Before</h2><h3>After</h3></li></ul>');
  expect(await page.evaluate(() => window.changes.length)).toBe(first ? 0 : 1);
  if (!first) {
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(original);
    expect(await page.evaluate(() => document.getSelection()!.anchorOffset)).toBe(1);
  }
});

for (const guard of ['readonly', 'composition', 'canceled']) test(`${guard} prevents manual multi-body boundary input`, async ({ page }) => {
  const original = '<ul><li><p>AB</p><h2>CD</h2></li></ul>';
  await initialize(page, original);
  await caret(page, 'p', 2);
  const prevented = await page.evaluate((guard) => {
    const root = window.editor.surface;
    if (guard === 'readonly') window.editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentForward' });
    if (guard === 'canceled') event.preventDefault();
    root.dispatchEvent(event);
    return event.defaultPrevented;
  }, guard);
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  expect(prevented).toBe(guard !== 'composition');
});
