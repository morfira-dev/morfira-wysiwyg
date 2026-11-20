import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TextDropTransfer } from './text-drop.types.js';
import './text-drop.types.js';

const content = (page: Page) => page.locator('.text-drop-editor .mw-content');
const initialize = async (page: Page, value = '<p>AB</p>', enabled = true) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, enabled }) => {
    window.dispose();
    const path = '/packages/plugins/dist/text-drop.js';
    const module = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/text-drop');
    const mount = document.createElement('div');
    mount.className = 'text-drop-editor';
    document.body.prepend(mount);
    const errors: string[] = [];
    const factory = module.textDrop({ enabled, onError: (error) => { errors.push(String(error)); } });
    window.changes = [];
    window.editor = window.createEditor(mount, {
      value, plugins: [factory],
      schema: [{ name: 'test:drop-reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }],
      onChange: (change) => window.changes.push(change),
    });
    window.textDropTest = { module, factory, api: module.textDropCommands(window.editor), errors };
    window.editor.focus();
    window.editor.setSelection(0);
    window.dispose = () => { window.editor.destroy(); mount.remove(); };
  }, { value, enabled });
};
const start = (page: Page, selector: string, from: number, to: number, backward = false) => page.evaluate(({ selector, from, to, backward }) => {
  const element = window.editor.surface.querySelector(selector)!;
  const node = element.firstChild!;
  window.editor.focus();
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(node, backward ? to : from, node, backward ? from : to);
  const transfer = new DataTransfer();
  window.textDropTest.transfer = transfer;
  const event = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer });
  element.dispatchEvent(event);
  return { cancelled: event.defaultPrevented, text: transfer.getData('text/plain'), html: transfer.getData('text/html') };
}, { selector, from, to, backward });
const drop = (page: Page, options: TextDropTransfer) => page.evaluate((options) => {
  const target = window.editor.surface.querySelector(options.selector)!;
  const range = document.createRange();
  if (options.end) { range.selectNodeContents(target); range.collapse(false); }
  else { range.setStart(target.firstChild ?? target, options.offset ?? 0); range.collapse(true); }
  let clientX = 0;
  let clientY = 0;
  if (options.native) {
    const rect = range.getBoundingClientRect();
    clientX = rect.left + .1;
    clientY = rect.top + rect.height / 2;
  }
  else Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => range.cloneRange() });
  const transfer = options.internal ? window.textDropTest.transfer! : new DataTransfer();
  if (!options.internal) {
    if (options.text !== undefined) transfer.setData('text/plain', options.text);
    if (options.html !== undefined) transfer.setData('text/html', options.html);
    if (options.file) transfer.items.add(new File(['image'], 'example.png', { type: 'image/png' }));
  }
  const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX, clientY, ctrlKey: options.copy });
  if (options.cancelled) event.preventDefault();
  target.dispatchEvent(event);
  return event.defaultPrevented;
}, options);
const end = (page: Page) => page.evaluate(() => window.editor.surface.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: window.textDropTest.transfer })));
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('a rich backward drag moves forward once, retains the exact undo selection and suppresses duplicate browser deletion', async ({ page }) => {
  await initialize(page, '<p>A<strong>BC</strong><span title="target">DEF</span></p>');
  const before = await html(page);
  const transfer = await start(page, 'strong', 0, 2, true);
  expect(transfer.text).toBe('BC');
  expect(transfer.html).toContain('BC');
  await drop(page, { selector: '[title=target]', end: true, internal: true });
  await expect(content(page)).toHaveText('ADEFBC');
  await expect(content(page).locator('strong')).toHaveText('BC');
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['user']);
  expect(await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteByDrag' });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  await end(page);
  const after = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { text: selection.toString(), anchor: selection.anchorOffset, focus: selection.focusOffset, undo: window.editor.canUndo() };
  })).toEqual({ text: 'BC', anchor: 2, focus: 0, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(after);
  await page.keyboard.type('!');
  await expect(content(page)).toHaveText('ADEFBC!');
  await expect(content(page).locator('strong')).toHaveText('BC');
});

test('explicit copy moves backward without deleting the source and self-drop edges preserve redo', async ({ page }) => {
  await initialize(page, '<p><em title="target">AB</em><strong>CD</strong></p>');
  await start(page, 'strong', 0, 2);
  await drop(page, { selector: '[title=target]', offset: 0, internal: true, copy: true });
  await expect(content(page)).toHaveText('CDABCD');
  await expect(content(page).locator('strong')).toHaveCount(2);
  await end(page);
  await page.evaluate(() => window.editor.undo());
  await expect(content(page)).toHaveText('ABCD');
  expect(await page.evaluate(() => window.editor.canRedo())).toBe(true);
  const before = await html(page);
  const changes = await page.evaluate(() => window.changes.length);
  for (const offset of [0, 2]) {
    await start(page, 'strong', 0, 2);
    await drop(page, { selector: 'strong', offset, internal: true });
    await end(page);
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => ({ changes: window.changes.length, redo: window.editor.canRedo() }))).toEqual({ changes, redo: true });
  }
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('!');
  await expect(content(page)).toHaveText('CD!ABCD');
  await expect(content(page).locator('[title=target]')).toHaveText('CD!AB');
  await expect(content(page).locator('[title=target] strong')).toHaveText('CD');
  await expect(content(page).locator('strong').last()).toHaveText('CD');
});

test('moving a whole direct list flow into a merged table cell preserves both structures and makes the emptied source editable', async ({ page }) => {
  await initialize(page, '<ul><li><strong>Move</strong></li><li>Keep</li></ul><table><tbody><tr><td title="target" colspan="2">End</td></tr><tr><td>A</td><td>B</td></tr></tbody></table>');
  const before = await html(page);
  await start(page, 'strong', 0, 4);
  await drop(page, { selector: '[title=target]', end: true, internal: true });
  await end(page);
  await expect(content(page).locator('li').first().locator('br')).toHaveCount(1);
  await expect(content(page).locator('li').nth(1)).toHaveText('Keep');
  await expect(content(page).locator('[title=target]')).toHaveText('EndMove');
  await expect(content(page).locator('[title=target]')).toHaveAttribute('colspan', '2');
  await expect(content(page).locator('td').nth(1)).toHaveText('A');
  await expect(content(page).locator('td').nth(2)).toHaveText('B');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  let requests = 0;
  await page.route('**/text-drop-survivor.png', (route) => { requests++; return route.abort(); });
  await page.evaluate(() => window.editor.setHTML('<p><strong>Move<span title="Empty survivor"></span></strong><img src="/text-drop-survivor.png" alt="Keep image"><span data-mw-node="test:drop-reference" data-id="keep"></span></p><p title="target">End</p>'));
  await expect.poll(() => requests).toBe(1);
  const image = await content(page).locator('img').elementHandle();
  const semantic = await content(page).locator('[data-id="keep"]').elementHandle();
  const empty = await content(page).locator('[title="Empty survivor"]').elementHandle();
  await start(page, 'strong', 0, 4);
  await drop(page, { selector: '[title=target]', end: true, internal: true });
  await end(page);
  await expect(content(page).locator('[title=target]')).toHaveText('EndMove');
  expect(await image!.evaluate((node) => node === window.editor.surface.querySelector('img') && node.parentElement === window.editor.surface.firstElementChild)).toBe(true);
  expect(await semantic!.evaluate((node) => node === window.editor.surface.querySelector('[data-id="keep"]') && node.isConnected)).toBe(true);
  expect(await empty!.evaluate((node) => node === window.editor.surface.querySelector('[title="Empty survivor"]') && node.parentElement?.localName === 'strong' && node.isConnected)).toBe(true);
  expect(requests).toBe(1);
});

test('external native caret geometry and bounded plain/inline HTML copy literal content without creating new block wrappers', async ({ page }) => {
  await initialize(page);
  await drop(page, { selector: 'p', offset: 1, native: true, text: '#' });
  await expect(content(page)).toHaveText('A#B');
  await page.evaluate(() => window.editor.undo());
  await drop(page, { selector: 'p', offset: 1, text: '<b>literal</b>\r\nNext' });
  await expect(content(page)).toHaveText('A<b>literal</b>NextB');
  await expect(content(page).locator('br')).toHaveCount(1);
  await expect(content(page).locator('b,strong')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  await drop(page, { selector: 'p', offset: 1, text: 'Rich', html: '<p><a href="https://example.com" onclick="throw 1"><em>Rich</em></a></p>' });
  await expect(content(page).locator(':scope > p')).toHaveCount(1);
  await expect(content(page).locator('a')).toHaveAttribute('href', 'https://example.com');
  await expect(content(page).locator('a')).not.toHaveAttribute('onclick');
  await expect(content(page).locator('em')).toHaveText('Rich');
  await expect(content(page)).toHaveText('ARichB');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(true);
});

test('structural, semantic, foreign, resource and oversized HTML refuse atomically while file transfers remain with their owner', async ({ page }) => {
  let requests = 0;
  await page.route('**/drop-image.png', (route) => { requests++; return route.abort(); });
  await initialize(page);
  const before = await html(page);
  const payloads = ['<table><tr><td>Table</td></tr></table>', '<p>One</p><p>Two</p>', '<img src="/drop-image.png">', '<code>Protected</code>', '<span data-mw-node="test:drop-reference" data-id="42">Reference</span>', '<svg><text>Foreign</text></svg>', 'x'.repeat(20001)];
  for (const payload of payloads) {
    await drop(page, { selector: 'p', offset: 1, text: 'Never fallback', html: payload });
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  }
  await drop(page, { selector: 'p', offset: 1, text: 'x'.repeat(20001) });
  expect(await html(page)).toBe(before);
  expect(requests).toBe(0);
  expect(await page.evaluate(() => {
    window.editor.setHTML('<p>A<img src="/drop-image.png" alt="Source image">B</p>');
    const paragraph = window.editor.surface.querySelector('p')!;
    const range = document.createRange(); range.selectNodeContents(paragraph);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const nativeClone = Range.prototype.cloneContents;
    let clones = 0;
    Range.prototype.cloneContents = new Proxy(nativeClone, {
      apply: (target, receiver, argumentsList) => { clones++; return Reflect.apply(target, receiver, argumentsList); },
    });
    const transfer = new DataTransfer(); transfer.setData('text/plain', 'Untouched transfer');
    try {
      for (const target of [paragraph, paragraph.querySelector('img')!])
        target.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return { clones, text: transfer.getData('text/plain'), undo: window.editor.canUndo() };
    }
    finally { Range.prototype.cloneContents = nativeClone; }
  })).toEqual({ clones: 0, text: 'Untouched transfer', undo: false });
  await page.evaluate(() => { window.editor.setHTML('<p>AB</p>'); window.editor.setSelection(0); });
  expect(await page.evaluate(() => {
    let observed = false;
    window.editor.element.addEventListener('drop', (event) => { if ((event as DragEvent).dataTransfer?.files.length) observed = true; }, { capture: true, once: true });
    const transfer = new DataTransfer(); transfer.items.add(new File(['image'], 'image.png', { type: 'image/png' }));
    transfer.setData('text/html', '<strong>Ignored</strong>');
    window.editor.surface.querySelector('p')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    return observed;
  })).toBe(true);
  expect(await html(page)).toBe(before);
});

test('readonly, preferences and composition refuse mutations while explicit API cancellation recovers fresh drops', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await drop(page, { selector: 'p', offset: 1, text: 'No' });
  await expect(content(page)).toHaveText('AB');
  await page.evaluate(() => { window.textDropTest.api.setEnabled(false); window.editor.setReadOnly(false); });
  await drop(page, { selector: 'p', offset: 1, text: 'No' });
  await expect(content(page)).toHaveText('AB');
  await page.evaluate(() => {
    window.textDropTest.api.setEnabled(true);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await drop(page, { selector: 'p', offset: 1, text: 'No' });
  await expect(content(page)).toHaveText('AB');
  await page.evaluate(() => { window.editor.setHTML('<p>CD</p>'); window.editor.setSelection(1); });
  await drop(page, { selector: 'p', offset: 1, text: 'Yes' });
  await expect(content(page)).toHaveText('CYesD');
  expect(await page.evaluate(() => window.textDropTest.api.getState())).toEqual({ enabled: true });
  expect(await page.evaluate(() => window.textDropTest.api.getState() !== window.textDropTest.api.getState())).toBe(true);
});

test('stale source sessions and focus-time replacement cannot redirect or partly delete a drop', async ({ page }) => {
  await initialize(page, '<p><strong>Source</strong><span title="target">End</span></p>');
  await start(page, 'strong', 0, 6);
  await page.evaluate(() => window.editor.setHTML('<p>Replacement</p>'));
  await drop(page, { selector: 'p', offset: 1, internal: true });
  await expect(content(page)).toHaveText('Replacement');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await end(page);
  await page.evaluate(() => {
    const button = document.createElement('button'); button.textContent = 'Outside'; document.body.append(button); button.focus();
    window.editor.surface.addEventListener('focus', () => window.editor.setHTML('<p>Focus replacement</p>'), { once: true });
  });
  await drop(page, { selector: 'p', offset: 1, text: 'Never' });
  await expect(content(page)).toHaveText('Focus replacement');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('failed transfer writes cancel the gesture and retained APIs/listeners stay isolated after reused-plugin disposal', async ({ page }) => {
  await initialize(page, '<p>Source</p>');
  const before = await html(page);
  expect(await page.evaluate(() => {
    window.editor.setSelection(0, 6);
    const transfer = new DataTransfer();
    Object.defineProperty(transfer, 'setData', { value: () => { throw new Error('Clipboard unavailable'); } });
    const event = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer });
    window.editor.surface.dispatchEvent(event);
    return { cancelled: event.defaultPrevented, errors: window.textDropTest.errors.length, undo: window.editor.canUndo() };
  })).toEqual({ cancelled: true, errors: 1, undo: false });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    let observed = false;
    let prevented = true;
    window.editor.element.addEventListener('beforeinput', (event) => {
      observed = true; prevented = event.defaultPrevented; event.stopPropagation();
    }, { capture: true, once: true });
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteByDrag' }));
    return { observed, prevented };
  })).toEqual({ observed: true, prevented: false });
  await start(page, 'p', 0, 3);
  await page.evaluate(() => Object.defineProperty(window.textDropTest.transfer!, 'dropEffect', {
    configurable: true, get: () => 'none', set: () => { throw new Error('Cannot set native drop effect'); },
  }));
  await drop(page, { selector: 'p', end: true, internal: true });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await end(page);
  expect(await page.evaluate(() => {
    const { api, factory, module } = window.textDropTest;
    const mount = document.createElement('div'); document.body.append(mount);
    const second = window.createEditor(mount, { value: '<p>Second</p>', plugins: [factory] });
    window.editor.focus();
    window.editor.setSelection(0, 6);
    const transfer = new DataTransfer();
    window.editor.surface.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const target = second.surface.querySelector('p')!;
    const point = document.createRange(); point.setStart(target.firstChild!, 0); point.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => point.cloneRange() });
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const copied = { source: window.editor.surface.textContent, target: second.surface.textContent };
    window.editor.surface.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    api.setEnabled(false);
    const independent = module.textDropCommands(second).getState().enabled;
    window.editor.destroy();
    let rejected = false;
    try { api.getState(); } catch { rejected = true; }
    const secondState = module.textDropCommands(second).getState().enabled;
    second.destroy(); mount.remove();
    return { independent, rejected, secondState, copied };
  })).toEqual({ independent: true, rejected: true, secondState: true, copied: { source: 'Source', target: 'SourceSecond' } });
});

test('public text-drop factory remains DOM-free and rejects malformed configuration before setup', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { textDrop } from './packages/wysiwyg/dist/plugins/text-drop.js';
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof textDrop().setup, 'function');
    for (const options of [null, [], new Date(), { enabled: 1 }, { onError: 'unsafe' }, { arbitrary: true }]) {
      assert.throws(() => textDrop(options));
    }
    process.stdout.write('safe');
  `], { encoding: 'utf8' });
  expect(output).toBe('safe');
});
