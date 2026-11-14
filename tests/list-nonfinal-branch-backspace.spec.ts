import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    return window.editor.getHTML();
  }, value);
};
const caret = (page: Page, selector = '[title="First"] strong', offset = 0, element = false) => page.evaluate(({ selector, offset, element }) => {
  const root = window.editor.surface;
  const target = root.querySelector(selector)!;
  const node = element ? target : target.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
}, { selector, offset, element });
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const earlier = '<ul title="Earlier"><li>Earlier</li></ul>';
const own = '<ol title="Own"><li><p><br></p></li></ol>';
const later = '<ul title="Later"><li><p>Later</p><ol><li>Deep later</li></ol></li></ul><ol title="Last" style="text-align: right"><li>Last</li></ol>';
const current = `<li title="Current"><h2 title="First" style="text-align: center"><strong>A😀B</strong></h2><p title="Body">Body</p>${own}</li>`;
const fixture = (tag: string, following = true) => `<ul><li title="Owner"><p>Owner</p>${earlier}<${tag} title="Source">${current}${following ? '<li title="Following">Following</li>' : ''}</${tag}>${later}</li><li>Outside</li></ul>`;
const result = (tag: string, following = true) => `<ul><li title="Owner"><p>Owner</p>${earlier}</li><li title="Current"><h2 title="First" style="text-align: center"><strong>A😀B</strong></h2><p title="Body">Body</p>${own}${following ? `<${tag} title="Source"><li title="Following">Following</li></${tag}>` : ''}${later}</li><li>Outside</li></ul>`;

for (const tag of ['ul', 'ol']) test(`nonfinal ${tag} lift preserves reading order and actual earlier/later branches`, async ({ page }) => {
  const before = await initialize(page, fixture(tag));
  const order = await page.locator('.mw-content').textContent();
  const source = await page.locator('.mw-content [title="Source"]').elementHandle();
  const handles = await Promise.all(['Owner', 'Earlier', 'Current', 'Body', 'Own', 'Following', 'Later', 'Last'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const placeholder = await page.locator('.mw-content [title="Own"] br').elementHandle();
  await caret(page);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe(result(tag));
  expect(await page.locator('.mw-content').textContent()).toBe(order);
  for (const node of [...handles, placeholder]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await handles[1]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Owner');
  for (const index of [3, 4, 6, 7]) expect(await handles[index]!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Current');
  expect(await source!.evaluate((node) => node.isConnected)).toBe(false);
  expect(await page.locator('.mw-content [title="Current"] > ul, .mw-content [title="Current"] > ol').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('title')))).toEqual(['Own', 'Source', 'Later', 'Last']);
  expect(await page.evaluate(() => ({ changes: window.changes.length, node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="First"] strong')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ changes: 1, node: true, offset: 0 });
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="First"]')).toHaveText('XA😀B');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="First"] strong')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 0, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(result(tag));
});

test('a sole source item moves later branches after its own without leaving or creating an empty source list', async ({ page }) => {
  const before = await initialize(page, fixture('ol', false));
  const source = await page.locator('.mw-content [title="Source"]').elementHandle();
  await caret(page);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe(result('ol', false));
  expect(await source!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(page.locator('.mw-content [title="Source"]')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const endpoint of ['item', 'before-br', 'after-br']) test(`nonfinal lift preserves an empty first body's ${endpoint} endpoint through undo`, async ({ page }) => {
  const before = await initialize(page, '<ul><li>Owner<ol><li title="Current"><p title="First"><br></p><h2>Body</h2></li><li>Following</li></ol><ul title="Later"><li>Later</li></ul></li></ul>');
  const onItem = endpoint === 'item';
  const offset = endpoint === 'after-br' ? 1 : 0;
  await caret(page, onItem ? '[title="Current"]' : '[title="First"]', offset, true);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<ul><li>Owner</li><li title="Current"><p title="First"><br></p><h2>Body</h2><ol><li>Following</li></ol><ul title="Later"><li>Later</li></ul></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(({ onItem }) => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector(onItem ? '[title="Current"]' : '[title="First"]'), offset: document.getSelection()!.anchorOffset }), { onItem })).toEqual({ node: true, offset });
});

test('nonfinal lift stays in its merged table cell and preserves grid and neighboring text', async ({ page }) => {
  const before = await initialize(page, `<table><tbody><tr><td rowspan="2" colspan="2">${fixture('ol')}</td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>`);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  await caret(page);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.mw-content td').first()).toHaveJSProperty('innerHTML', result('ol'));
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  expect(await cell!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const invalid of ['semantic-list', 'semantic-item', 'unsupported-body', 'foreign-gap']) test(`invalid later branch ${invalid} blocks before mutation and retains pending formatting`, async ({ page }) => {
  await initialize(page, fixture('ol'));
  await page.evaluate((invalid) => {
    const later = window.editor.surface.querySelector('[title="Later"]')!;
    if (invalid === 'semantic-list') later.setAttribute('data-mw-node', 'test:later');
    if (invalid === 'semantic-item') later.firstElementChild!.setAttribute('data-mw-node', 'test:later');
    if (invalid === 'unsupported-body') later.firstElementChild!.append(document.createElement('pre'));
    if (invalid === 'foreign-gap') later.prepend(document.createTextNode('Do not skip'));
  }, invalid);
  await caret(page);
  const before = await page.locator('.mw-content').innerHTML();
  const state = await page.evaluate(() => {
    const editor = window.editor;
    editor.format('bold', false);
    const root = editor.surface;
    const selection = document.getSelection()!;
    const node = selection.anchorNode;
    const offset = selection.anchorOffset;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, attributes: true, childList: true });
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true, bubbles: true });
    root.dispatchEvent(event);
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { prevented: event.defaultPrevented, mutations, samePoint: selection.anchorNode === node && selection.anchorOffset === offset, bold: Boolean(editor.getFormats().bold), changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(await page.locator('.mw-content').innerHTML()).toBe(before);
  expect(state).toEqual({ prevented: true, mutations: 0, samePoint: true, bold: false, changes: 0, undo: false });
});

for (const guard of ['readonly', 'composition', 'canceled', 'noncancelable']) test(`${guard} prevents manual nonfinal lift`, async ({ page }) => {
  const before = await initialize(page, fixture('ol'));
  await caret(page);
  const state = await page.evaluate((guard) => {
    const editor = window.editor;
    const root = editor.surface;
    if (guard === 'readonly') editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    if (guard === 'canceled') root.addEventListener('beforeinput', (event) => event.preventDefault(), { capture: true, once: true });
    const key = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: guard !== 'noncancelable', bubbles: true });
    root.dispatchEvent(key);
    if (guard !== 'canceled') {
      const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: guard !== 'noncancelable', bubbles: true });
      root.dispatchEvent(event);
    }
    return { changes: window.changes.length, undo: editor.canUndo(), keyPrevented: key.defaultPrevented };
  }, guard);
  expect(await html(page)).toBe(before);
  expect(state).toEqual({ changes: 0, undo: false, keyPrevented: guard === 'canceled' });
});
