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

const caretIn = async (page: Page, selector: string, offset: number) => {
  await page.evaluate(({ selector, offset }) => {
    const root = window.editor.surface;
    const node = root.querySelector(selector)!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
  }, { selector, offset });
};

for (const tag of ['p', 'h2']) test(`Enter splits a wrapped ${tag} and moves the actual nested branch outside its new body`, async ({ page }) => {
  const original = `<ul><li style="text-align: right"><${tag} style="text-align: center"><strong>A😀B</strong></${tag}><ol><li>Branch</li></ol></li><li>Keep</li></ul>`;
  const split = `<ul><li style="text-align: right"><${tag} style="text-align: center"><strong>A😀</strong></${tag}></li><li style="text-align: right"><${tag} style="text-align: center"><strong>B</strong></${tag}><ol><li>Branch</li></ol></li><li>Keep</li></ul>`;
  await initialize(page, original);
  const body = await page.locator(`.mw-content li > ${tag}`).elementHandle();
  const branch = await page.locator('.mw-content li > ol').elementHandle();
  await caretIn(page, 'strong', 3);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length }))).toEqual({ html: split, changes: 1 });
  expect(await body!.evaluate((node) => node.isConnected && node === window.editor.surface.querySelector('li')!.firstChild)).toBe(true);
  expect(await branch!.evaluate((node) => node.isConnected && node.parentElement === window.editor.surface.querySelectorAll(':scope > ul > li')[1])).toBe(true);
  await page.keyboard.insertText('X');
  await expect(page.locator(`.mw-content > ul > li`).nth(1)).toHaveText('XBBranch');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), offset: document.getSelection()!.anchorOffset }))).toEqual({ html: original, undo: false, offset: 3 });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(split);
});

for (const offset of [0, 2]) test(`heading split at offset ${offset} keeps empty placeholders inside heading wrappers`, async ({ page }) => {
  await initialize(page, '<ol><li><h3>AB</h3></li></ol>');
  await caretIn(page, 'h3', offset);
  await page.keyboard.press('Enter');
  const expected = offset === 0 ? '<ol><li><h3><br></h3></li><li><h3>AB</h3></li></ol>' : '<ol><li><h3>AB</h3></li><li><h3><br></h3></li></ol>';
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(expected);
  await expect(page.locator('.mw-content li > br')).toHaveCount(0);
});

test('Shift+Enter replaces across inline marks while retaining the starting inline context', async ({ page }) => {
  const original = '<ul><li><p><strong>AB</strong><em>CD</em></p><ul><li>Branch</li></ul></li></ul>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('strong')!.firstChild!, 1, root.querySelector('em')!.firstChild!, 1);
  });
  await page.keyboard.press('Shift+Enter');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li><p><strong>A<br></strong><em>D</em></p><ul><li>Branch</li></ul></li></ul>');
  expect(await page.evaluate(() => document.getSelection()!.anchorNode === window.editor.surface.querySelector('strong'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset }))).toEqual({ html: original, anchor: 1, focus: 1 });
});

test('Shift+Enter at the body end puts both real break and terminal placeholder inside the heading', async ({ page }) => {
  await initialize(page, '<ul><li><h4>AB</h4><ol><li>Branch</li></ol></li></ul>');
  await caretIn(page, 'h4', 2);
  await page.keyboard.press('Shift+Enter');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li><h4>AB<br><br></h4><ol><li>Branch</li></ol></li></ul>');
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content h4')).toHaveText('ABX');
});

for (const left of ['<p style="text-align: center"><strong>A</strong></p>', 'A']) test(`forward Delete joins into the actual left body: ${left}`, async ({ page }) => {
  const original = `<ul><li>${left}<ol><li>L branch</li></ol></li><li><h2><em>B</em></h2><ul><li>R branch</li></ul></li></ul>`;
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const item = root.querySelector('li')!;
    const body = item.querySelector('p') ?? item;
    const range = document.createRange();
    range.selectNodeContents(body);
    if (body === item) range.setEndBefore(item.querySelector('ol')!);
    range.collapse(false);
    root.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Delete');
  const body = left.startsWith('<p') ? '<p style="text-align: center"><strong>A</strong><em>B</em></p>' : 'A<em>B</em>';
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(`<ul><li>${body}<ol><li>L branch</li></ol><ul><li>R branch</li></ul></li></ul>`);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

for (const inputType of ['insertParagraph', 'insertLineBreak']) test(`multiple wrapped blocks are an atomic ${inputType} barrier`, async ({ page }) => {
  const original = '<ul><li><p>AB</p><p>CD</p></li></ul>';
  await initialize(page, original);
  await caretIn(page, 'p', 1);
  const prevented = await page.evaluate((inputType) => {
    const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  }, inputType);
  expect(prevented).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, changes: 0, undo: false });
});

test('an empty ordinary paragraph item keeps the existing Enter list exit', async ({ page }) => {
  await initialize(page, '<ul><li><p><br></p></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    const body = root.querySelector('p')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(body, 0, body, 0);
  });
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><br></p>');
});

for (const offset of [0, 1]) test(`Shift+Enter around an empty-body placeholder at ${offset} leaves exactly two internal breaks`, async ({ page }) => {
  await initialize(page, '<ul><li><p><br></p></li></ul>');
  await page.evaluate((offset) => {
    const root = window.editor.surface;
    const body = root.querySelector('p')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(body, offset, body, offset);
  }, offset);
  await page.keyboard.press('Shift+Enter');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li><p><br><br></p></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), offset: document.getSelection()!.anchorOffset }))).toEqual({ html: '<ul><li><p><br></p></li></ul>', offset });
});

test('Shift+Enter replaces an empty semantic inline placeholder without losing its metadata or caret context', async ({ page }) => {
  const original = '<ul><li><p><span data-mw-node="test:inline" data-id="keep"><br></span></p></li></ul>';
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes.length = 0;
    window.editor = window.createEditor(host, {
      value,
      schema: [{ name: 'test:inline', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }],
      onChange: (change) => window.changes.push(change),
    });
    window.dispose = () => { window.editor.destroy(); host.remove(); };
    const span = window.editor.surface.querySelector('span')!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(span, 1, span, 1);
  }, original);
  await page.keyboard.press('Shift+Enter');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), inSpan: document.getSelection()!.anchorNode === window.editor.surface.querySelector('span') }))).toEqual({ html: '<ul><li><p><span data-mw-node="test:inline" data-id="keep"><br><br></span></p></li></ul>', inSpan: true });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});
