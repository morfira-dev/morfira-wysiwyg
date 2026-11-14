import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const initialize = async (page: Page, value: string, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate(({ value, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, schema, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    return window.editor.getHTML();
  }, { value, schema });
};

const caret = (page: Page, selector: string, offset = 0, element = false) => page.evaluate(({ selector, offset, element }) => {
  const root = window.editor.surface;
  const target = root.querySelector(selector)!;
  const node = element ? target : target.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
}, { selector, offset, element });

const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

for (const tag of ['ul', 'ol']) test(`first-body Backspace joins ${tag} siblings while preserving later bodies and actual branch placeholders`, async ({ page }) => {
  const before = await initialize(page, `<${tag} title="List"><li title="Previous"><p>Prefix</p><h2 style="text-align: center"><strong>A😀</strong></h2><ul title="Left"><li><p><br></p></li></ul></li><li title="Current"><p><em>Beta</em></p><h3 title="Later">Later</h3><ol title="Right"><li>Right</li></ol></li><li>Keep</li></${tag}>`);
  const previous = await page.locator('.mw-content [title="Previous"]').elementHandle();
  const later = await page.locator('.mw-content [title="Later"]').elementHandle();
  const placeholder = await page.locator('.mw-content [title="Left"] br').elementHandle();
  const right = await page.locator('.mw-content [title="Right"]').elementHandle();
  await caret(page, 'em');
  await page.keyboard.press('Backspace');
  const merged = `<${tag} title="List"><li title="Previous"><p>Prefix</p><h2 style="text-align: center"><strong>A😀</strong><em>Beta</em></h2><h3 title="Later">Later</h3><ul title="Left"><li><p><br></p></li></ul><ol title="Right"><li>Right</li></ol></li><li>Keep</li></${tag}>`;
  expect(await html(page)).toBe(merged);
  for (const node of [previous, later, placeholder, right]) expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await later!.evaluate((element) => element.parentElement === window.editor.surface.querySelector('[title="Previous"]'))).toBe(true);
  expect(await page.evaluate(() => ({ changes: window.changes.length, selected: document.getSelection()!.isCollapsed }))).toEqual({ changes: 1, selected: true });
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content h2')).toHaveText('A😀XBeta');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ atEm: document.getSelection()!.anchorNode === window.editor.surface.querySelector('em')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ atEm: true, offset: 0, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(merged);
});

test('first-body Backspace promotes a direct previous body without nesting surviving headings', async ({ page }) => {
  const before = await initialize(page, '<ul><li><strong>AB</strong></li><li><p>CD</p><h3 title="Later">Later</h3></li></ul>');
  const later = await page.locator('.mw-content h3').elementHandle();
  await caret(page, 'p');
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<ul><li><p><strong>AB</strong>CD</p><h3 title="Later">Later</h3></li></ul>');
  expect(await later!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.mw-content p h3, .mw-content li > strong')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const offset of [0, 1]) test(`an empty first body at offset ${offset} joins an empty previous heading without deleting branch placeholders`, async ({ page }) => {
  const before = await initialize(page, '<ul><li><h2><br></h2><ul title="Branch"><li><p><br></p></li></ul></li><li><p title="Start"><br></p><h3>After</h3></li></ul>');
  const branchPlaceholder = await page.locator('.mw-content [title="Branch"] br').elementHandle();
  await caret(page, '[title="Start"]', offset, true);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<ul><li><h2><br></h2><h3>After</h3><ul title="Branch"><li><p><br></p></li></ul></li></ul>');
  expect(await branchPlaceholder!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ onBody: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Start"]'), offset: document.getSelection()!.anchorOffset }))).toEqual({ onBody: true, offset });
});

for (const endpoint of ['body', 'item', 'placeholder']) test(`root-first Backspace unwraps actual bodies and preserves the remaining list from a ${endpoint} endpoint`, async ({ page }) => {
  const empty = endpoint === 'placeholder';
  const before = await initialize(page, `<ol title="Source"><li><h2 title="First">${empty ? '<br>' : 'Alpha'}</h2><p title="Later">Later</p><ul title="Branch"><li>Branch</li></ul></li><li title="Keep">Keep</li></ol>`);
  const first = await page.locator('.mw-content [title="First"]').elementHandle();
  const later = await page.locator('.mw-content [title="Later"]').elementHandle();
  const list = await page.locator('.mw-content [title="Source"]').elementHandle();
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  await caret(page, endpoint === 'item' ? 'li' : 'h2', empty ? 1 : 0, endpoint !== 'body');
  await page.keyboard.press('Backspace');
  const unwrapped = `<h2 title="First">${empty ? '<br>' : 'Alpha'}</h2><p title="Later">Later</p><ul title="Branch"><li>Branch</li></ul><ol title="Source"><li title="Keep">Keep</li></ol>`;
  expect(await html(page)).toBe(unwrapped);
  for (const node of [first, later, list, branch]) expect(await node!.evaluate((element) => element.isConnected && element.parentElement === window.editor.surface)).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate((endpoint) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    const expected = endpoint === 'item' ? root.querySelector('li') : endpoint === 'placeholder' ? root.querySelector('h2') : root.querySelector('h2')!.firstChild;
    return { node: selection.anchorNode === expected, offset: selection.anchorOffset };
  }, endpoint)).toEqual({ node: true, offset: empty ? 1 : 0 });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(unwrapped);
});

test('a sole root item unwraps without retaining an empty list and keeps the heading typing caret', async ({ page }) => {
  await initialize(page, '<ul><li><h2><strong>Alpha</strong></h2><p>Later</p></li></ul>');
  await caret(page, 'strong');
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<h2><strong>Alpha</strong></h2><p>Later</p>');
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content > h2')).toHaveText('XAlpha');
});

test('nested-first Backspace lifts its actual item and reparents trailing siblings after existing branches', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p>Owner</p><ol title="Source"><li title="Current"><h2>Alpha</h2><p>Later</p><ul title="Own"><li>Own branch</li></ul></li><li title="Trailing">Follow</li></ol></li><li>Keep</li></ul>');
  const current = await page.locator('.mw-content [title="Current"]').elementHandle();
  const trailing = await page.locator('.mw-content [title="Trailing"]').elementHandle();
  const own = await page.locator('.mw-content [title="Own"]').elementHandle();
  await caret(page, 'h2');
  await page.keyboard.press('Backspace');
  const lifted = '<ul><li title="Owner"><p>Owner</p></li><li title="Current"><h2>Alpha</h2><p>Later</p><ul title="Own"><li>Own branch</li></ul><ol title="Source"><li title="Trailing">Follow</li></ol></li><li>Keep</li></ul>';
  expect(await html(page)).toBe(lifted);
  expect(await current!.evaluate((node) => node.isConnected && node.previousElementSibling?.getAttribute('title') === 'Owner')).toBe(true);
  expect(await trailing!.evaluate((node) => node.isConnected && node.parentElement?.parentElement === window.editor.surface.querySelector('[title="Current"]'))).toBe(true);
  expect(await own!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ atHeading: document.getSelection()!.anchorNode === window.editor.surface.querySelector('h2')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ atHeading: true, offset: 0 });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(lifted);
});

test('root-first Backspace inside a merged cell preserves cell geometry and neighboring content', async ({ page }) => {
  const before = await initialize(page, '<table><tbody><tr><td rowspan="2" colspan="2"><ul><li><h2>Alpha</h2><p>Later</p></li><li>Keep</li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>');
  const cell = await page.locator('.mw-content td').first().elementHandle();
  await caret(page, 'h2');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.mw-content td').first()).toHaveJSProperty('innerHTML', '<h2>Alpha</h2><p>Later</p><ul><li>Keep</li></ul>');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td')).toHaveText(['AlphaLaterKeep', 'A', 'B']);
  expect(await cell!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('root-first unwrap retains an unchanged semantic blockquote ancestor and its metadata', async ({ page }) => {
  const quote: SchemaNodeSpec = { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } };
  const before = await initialize(page, '<blockquote data-mw-node="test:quote" data-id="kept"><ul><li><h2>Alpha</h2><p>Later</p></li></ul></blockquote>', [quote]);
  const ancestor = await page.locator('.mw-content blockquote').elementHandle();
  await caret(page, 'h2');
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<blockquote data-mw-node="test:quote" data-id="kept"><h2>Alpha</h2><p>Later</p></blockquote>');
  expect(await ancestor!.evaluate((node) => node.isConnected && node === window.editor.surface.firstElementChild)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

for (const guard of ['readonly', 'composition', 'canceled', 'noncancelable']) test(`${guard} leaves first-body Backspace content and history untouched`, async ({ page }) => {
  const before = await initialize(page, '<ul><li>Previous</li><li><p>Alpha</p><h2>Later</h2></li></ul>');
  await caret(page, 'p');
  const result = await page.evaluate((guard) => {
    const root = window.editor.surface;
    if (guard === 'readonly') window.editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: guard !== 'noncancelable' });
    if (guard === 'canceled') event.preventDefault();
    root.dispatchEvent(event);
    return { prevented: event.defaultPrevented, changes: window.changes.length, undo: window.editor.canUndo(), atStart: document.getSelection()!.anchorNode === root.querySelector('p')!.firstChild && document.getSelection()!.anchorOffset === 0 };
  }, guard);
  expect(await html(page)).toBe(before);
  expect(result).toEqual({ prevented: guard === 'readonly' || guard === 'canceled', changes: 0, undo: false, atStart: true });
});

test('cancellation at beforeinput is not bypassed by a preceding Backspace keydown', async ({ page }) => {
  const before = await initialize(page, '<ul><li>Previous</li><li><p>Alpha</p><h2>Later</h2></li></ul>');
  await caret(page, 'p');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const inputs: string[] = [];
    // The owned key dispatches its guarded input immediately; install cancellation first.
    root.addEventListener('beforeinput', (event) => {
      inputs.push(event.inputType);
      event.preventDefault();
    }, { capture: true, once: true });
    const key = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    root.dispatchEvent(key);
    return { keyPrevented: key.defaultPrevented, inputs, changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ keyPrevented: true, inputs: ['deleteContentBackward'], changes: 0, undo: false });
  expect(await html(page)).toBe(before);
});

const semanticBody: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
for (const fixture of [
  '<ul><li><p data-mw-node="test:body" data-id="previous">Previous</p></li><li><p title="Start">Alpha</p><h2>Later</h2></li></ul>',
  '<ul><li><p title="Start">Alpha</p><pre>Unsupported</pre></li></ul>',
  '<ul><li><p title="Start">Alpha</p><h2>Later</h2></li><li><p data-mw-node="test:body" data-id="next">Next</p></li></ul>',
  '<ul><li><p>Owner</p><ol><li><p title="Start">Alpha</p><h2>Later</h2></li></ol><ul><li><p data-mw-node="test:body" data-id="later">Other branch</p></li></ul></li></ul>',
]) test(`unsupported first-body context rejects atomically: ${fixture}`, async ({ page }) => {
  const before = await initialize(page, fixture, [semanticBody]);
  await caret(page, '[title="Start"]');
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { prevented: event.defaultPrevented, mutations, changes: window.changes.length, undo: window.editor.canUndo(), atStart: document.getSelection()!.anchorNode === root.querySelector('[title="Start"]')!.firstChild && document.getSelection()!.anchorOffset === 0 };
  });
  expect(await html(page)).toBe(before);
  expect(result).toEqual({ prevented: true, mutations: 0, changes: 0, undo: false, atStart: true });
});

test('non-whitespace sibling gaps reject before any mutation rather than skipping content', async ({ page }) => {
  await initialize(page, '<ul><li>Previous</li><li><p title="Start">Alpha</p><h2>Later</h2></li></ul>');
  await page.evaluate(() => window.editor.surface.querySelector('li')!.after(document.createTextNode('Do not skip')));
  await caret(page, '[title="Start"]');
  const before = await html(page);
  expect(await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('a blocked first-body Backspace preserves pending caret formatting and its exact DOM point', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p data-mw-node="test:body" data-id="previous">Previous</p></li><li><p title="Start">Alpha</p><h2>Later</h2></li></ul>', [semanticBody]);
  await caret(page, '[title="Start"]');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.format('bold', true);
    const selection = document.getSelection()!;
    const container = selection.anchorNode;
    const offset = selection.anchorOffset;
    let notifications = 0;
    const unsubscribe = editor.onSelectionChange(() => { notifications++; });
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true, bubbles: true });
    editor.surface.dispatchEvent(event);
    unsubscribe();
    return { prevented: event.defaultPrevented, pending: Boolean(editor.getFormats().bold), undo: editor.canUndo(), changes: window.changes.length, samePoint: selection.anchorNode === container && selection.anchorOffset === offset, notifications };
  });
  expect(await html(page)).toBe(before);
  expect(result).toEqual({ prevented: true, pending: true, undo: false, changes: 0, samePoint: true, notifications: 0 });
  // Exercise ordinary typing, not Firefox's composition-based insertText protocol.
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [title="Start"] strong')).toHaveText('X');
  await expect(page.locator('.mw-content [title="Start"]')).toHaveText('XAlpha');
});

test('undo after a valid root-first Backspace restores pending bold and the exact first-body text endpoint', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p title="Start">Alpha</p><h2>Later</h2></li></ul>');
  await caret(page, '[title="Start"]');
  await page.evaluate(() => window.editor.format('bold', true));
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<p title="Start">Alpha</p><h2>Later</h2>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ atText: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Start"]')!.firstChild, offset: document.getSelection()!.anchorOffset, bold: Boolean(window.editor.getFormats().bold), undo: window.editor.canUndo() }))).toEqual({ atText: true, offset: 0, bold: true, undo: false });
});

test('an item-level first edge in an unsupported source cannot fall through to legacy Backspace', async ({ page }) => {
  const before = await initialize(page, '<ul><li>Previous</li><li title="Current"><p>Alpha</p><pre>Unsupported</pre></li></ul>');
  await caret(page, '[title="Current"]', 0, true);
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ item: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Current"]'), offset: document.getSelection()!.anchorOffset, changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ item: true, offset: 0, changes: 0, undo: false });
});
