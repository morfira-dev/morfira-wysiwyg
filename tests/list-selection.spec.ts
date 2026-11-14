import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const original = (tag = 'ul') => `<${tag} title="Parent"><li title="First">Alpha <strong>one</strong></li><li><em>Beta</em> tail<ul title="Branch"><li>Nested</li></ul></li><li title="Keep">Keep</li></${tag}><p>Outside</p>`;
const initialize = async (page: Page, value = original()) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    return window.editor.getHTML();
  }, value);
};
const selectItems = (page: Page, backward = true, selector = '[title="Parent"]') => page.evaluate(({ backward, selector }) => {
  const root = window.editor.surface;
  const list = root.querySelector(selector)!;
  const first = list.children[0].firstChild!;
  const last = list.children[1].querySelector('em')!.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(backward ? last : first, backward ? 2 : 6, backward ? first : last, backward ? 6 : 2);
}, { backward, selector });
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const beforeinput = (page: Page, inputType: string, data: string | null = null) => page.evaluate(({ inputType, data }) => {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, { inputType, data });

for (const tag of ['ul', 'ol']) for (const backward of [false, true]) test(`${tag} native replacement retains right branches and ${backward ? 'backward' : 'forward'} history without rebuilding neighbors`, async ({ page }) => {
  const before = await initialize(page, original(tag));
  await selectItems(page, backward);
  const first = await page.locator('.mw-content [title="First"]').elementHandle();
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  const keep = await page.locator('.mw-content [title="Keep"]').elementHandle();
  await page.keyboard.insertText('X');
  const replaced = `<${tag} title="Parent"><li title="First">Alpha X<em>ta</em> tail<ul title="Branch"><li>Nested</li></ul></li><li title="Keep">Keep</li></${tag}><p>Outside</p>`;
  expect(await html(page)).toBe(replaced);
  expect(await first!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector('[title="First"]'))).toBe(true);
  expect(await branch!.evaluate((element) => element.isConnected && element.parentElement === window.editor.surface.querySelector('[title="First"]'))).toBe(true);
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector('[title="Keep"]'))).toBe(true);
  expect(await page.evaluate(() => ({ caret: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ caret: { index: 7, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ selection: { index: 6, length: 5 }, undo: false });
  expect(await page.evaluate(() => document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Parent"] > li:nth-child(2) em')!.firstChild)).toBe(backward);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.insertText('!');
  await expect(page.locator('.mw-content [title="First"]')).toHaveText('Alpha X!ta tailNested');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 8, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const key of ['Backspace', 'Delete']) test(`${key} deletes only the accepted sibling range and restores its exact backwards DOM boundaries`, async ({ page }) => {
  const before = await initialize(page);
  await selectItems(page);
  await page.keyboard.press(key);
  expect(await html(page)).toBe('<ul title="Parent"><li title="First">Alpha <em>ta</em> tail<ul title="Branch"><li>Nested</li></ul></li><li title="Keep">Keep</li></ul><p>Outside</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 6, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const list = window.editor.surface.querySelector('[title="Parent"]')!;
    return { anchor: selection.anchorNode === list.children[1].querySelector('em')!.firstChild, offset: selection.anchorOffset, focus: selection.focusNode === list.children[0].firstChild, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  })).toEqual({ anchor: true, offset: 2, focus: true, focusOffset: 6, undo: false });
});

for (const payload of ['', '<b>X</b>']) test(`beforeinput-only list insertion treats ${payload || 'an empty string'} as literal replacement data`, async ({ page }) => {
  const before = await initialize(page);
  await selectItems(page);
  expect(await beforeinput(page, 'insertText', payload)).toBe(true);
  await expect(page.locator('.mw-content [title="First"]')).toHaveText(`Alpha ${payload}ta tailNested`);
  await expect(page.locator('.mw-content b')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  const replaced = await html(page);
  await page.keyboard.insertText('Y');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const type of ['deleteContentBackward', 'deleteContentForward']) test(`beforeinput-only ${type} follows the same list deletion contract`, async ({ page }) => {
  const before = await initialize(page);
  await selectItems(page);
  expect(await beforeinput(page, type)).toBe(true);
  expect(await html(page)).toBe('<ul title="Parent"><li title="First">Alpha <em>ta</em> tail<ul title="Branch"><li>Nested</li></ul></li><li title="Keep">Keep</li></ul><p>Outside</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('one ordinary pasted paragraph loses only its wrapper and retains explicit inline formatting and destination attributes', async ({ page }) => {
  const before = await initialize(page);
  await selectItems(page);
  await page.evaluate(() => window.editor.insertHTML('<p title="Incoming" style="text-align: center"><u>X</u></p>'));
  expect(await html(page)).toBe('<ul title="Parent"><li title="First">Alpha <u>X</u><em>ta</em> tail<ul title="Branch"><li>Nested</li></ul></li><li title="Keep">Keep</li></ul><p>Outside</p>');
  expect(await page.evaluate(() => ({ caret: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ caret: { index: 7, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('incoming link remains outside the starting anchor while prefix and incoming attributes survive', async ({ page }) => {
  const before = await initialize(page, '<ul><li><a href="https://example.com/start" title="Prefix">Alpha</a></li><li>Beta</li><li>Keep</li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('ul')!.children[1].firstChild!, 2, root.querySelector('a')!.firstChild!, 2);
    window.editor.insertHTML('<a href="https://example.com/new" title="Incoming">X</a>');
  });
  expect(await html(page)).toBe('<ul><li><a href="https://example.com/start" title="Prefix">Al</a><a href="https://example.com/new" title="Incoming">X</a>ta</li><li>Keep</li></ul>');
  await expect(page.locator('.mw-content a a')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 3, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('fully selected inter-item formatting whitespace is removed while following whitespace remains untouched', async ({ page }) => {
  const before = await initialize(page, '<ul title="Parent"><li>Alpha <strong>one</strong></li>\n  <li><em>Beta</em> tail</li>\n<li>Keep</li></ul>');
  await selectItems(page);
  await page.keyboard.insertText('X');
  expect(await html(page)).toBe('<ul title="Parent"><li>Alpha X<em>ta</em> tail</li>\n<li>Keep</li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('empty own bodies retain one starting-context placeholder before the preserved trailing branch', async ({ page }) => {
  const before = await initialize(page, '<ul><li><strong><br></strong></li><li><br><ul title="Branch"><li>Nested</li></ul></li><li>Keep</li></ul>');
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  await page.evaluate(() => {
    const root = window.editor.surface;
    const list = root.querySelector('ul')!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(list.children[1], 0, list.children[0].querySelector('strong')!, 0);
  });
  expect(await beforeinput(page, 'deleteContentBackward')).toBe(true);
  expect(await html(page)).toBe('<ul><li><strong><br></strong><ul title="Branch"><li>Nested</li></ul></li><li>Keep</li></ul>');
  expect(await branch!.evaluate((element) => element.isConnected && element.parentElement === window.editor.surface.querySelector('ul > li'))).toBe(true);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { strong: selection.anchorNode === window.editor.surface.querySelector('strong'), offset: selection.anchorOffset, collapsed: selection.isCollapsed };
  })).toEqual({ strong: true, offset: 0, collapsed: true });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('replacement inside a nested list retains the owner and its unrelated outer sibling', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner">Owner<ol title="Parent"><li>Alpha <strong>one</strong></li><li><em>Beta</em> tail</li><li>Keep</li></ol></li><li>Outer keep</li></ul>');
  const owner = await page.locator('.mw-content [title="Owner"]').elementHandle();
  await selectItems(page);
  await page.keyboard.insertText('X');
  expect(await html(page)).toBe('<ul><li title="Owner">Owner<ol title="Parent"><li>Alpha X<em>ta</em> tail</li><li>Keep</li></ol></li><li>Outer keep</li></ul>');
  expect(await owner!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector('[title="Owner"]'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('replacement in one merged table cell preserves geometry other cells and the containing list', async ({ page }) => {
  const source = '<table><tbody><tr><td rowspan="2" colspan="2"><ul title="Parent"><li>Alpha <strong>one</strong></li><li><em>Beta</em> tail</li><li>Keep</li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p>Outside</p>';
  const before = await initialize(page, source);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  await selectItems(page);
  await page.evaluate(() => window.editor.insertHTML('<u>X</u>'));
  await expect(page.locator('.mw-content td')).toHaveText(['Alpha Xta tailKeep', 'A', 'B']);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  expect(await cell!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector('td'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});
