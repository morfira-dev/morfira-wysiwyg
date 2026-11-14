import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value: string, offset = 0) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, offset }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    const root = window.editor.surface;
    root.focus();
    const point = root.querySelector('[title="Body"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(point, offset, point, offset);
  }, { value, offset });
};
const firstSource = '<ol title="Source"><li><h2 title="Body">Alpha</h2><p title="Later">Later</p><ul title="Branch"><li>Branch</li></ul></li><li title="Keep">Keep</li></ol>';

for (const lineBreak of [false, true]) test(`owned list ${lineBreak ? 'Shift+Enter' : 'root-first Backspace'} produces one normalized beforeinput and one history operation`, async ({ page }) => {
  const original = lineBreak ? '<ul><li><p>Before</p><h2 title="Body">AB</h2><p title="Later">After</p><ul title="Branch"><li>Branch</li></ul></li></ul>' : firstSource;
  const result = lineBreak ? '<ul><li><p>Before</p><h2 title="Body">A<br>B</h2><p title="Later">After</p><ul title="Branch"><li>Branch</li></ul></li></ul>' : '<h2 title="Body">Alpha</h2><p title="Later">Later</p><ul title="Branch"><li>Branch</li></ul><ol title="Source"><li title="Keep">Keep</li></ol>';
  await initialize(page, original, lineBreak ? 1 : 0);
  const kept = await Promise.all(['Body', 'Later', 'Branch'].map((title) => page.locator(`.mw-content [title="${title}"]`).elementHandle()));
  const protocol = await page.evaluateHandle(() => {
    const events: { inputType: string; cancelable: boolean; trusted: boolean }[] = [];
    window.editor.surface.addEventListener('beforeinput', (event) => events.push({ inputType: event.inputType, cancelable: event.cancelable, trusted: event.isTrusted }), { capture: true });
    return events;
  });
  await page.keyboard.press(lineBreak ? 'Shift+Enter' : 'Backspace');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(result);
  expect(await protocol.jsonValue()).toEqual([{ inputType: lineBreak ? 'insertLineBreak' : 'deleteContentBackward', cancelable: true, trusted: false }]);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 1, undo: true });
  for (const node of kept) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ text: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ text: true, offset: lineBreak ? 1 : 0, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(result);
});

for (const phase of ['keydown', 'beforeinput'] as const) test(`capture ${phase} cancellation blocks owned root Backspace without changing pending formats or exact point`, async ({ page }) => {
  await initialize(page, firstSource);
  await page.evaluate((phase) => {
    window.editor.format('bold', true);
    window.editor.surface.addEventListener(phase, (event) => event.preventDefault(), { capture: true, once: true });
  }, phase);
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const point = document.getSelection()!;
    return { html: editor.getHTML(), changes: window.changes.length, undo: editor.canUndo(), bold: Boolean(editor.getFormats().bold), point: point.anchorNode === editor.surface.querySelector('[title="Body"]')!.firstChild, offset: point.anchorOffset };
  })).toEqual({ html: firstSource, changes: 0, undo: false, bold: true, point: true, offset: 0 });
});

test('beforeinput capture consumers can perform one validated operation instead of the owned Enter split', async ({ page }) => {
  await initialize(page, '<ul><li><p title="Body">AB</p><h2>Later</h2></li></ul>', 1);
  await page.evaluate(() => {
    const editor = window.editor;
    editor.surface.addEventListener('beforeinput', (event) => {
      if (event.inputType !== 'insertParagraph') return;
      event.preventDefault();
      editor.transact((root) => { root.querySelector('[title="Body"]')!.append(document.createTextNode('!')); });
    }, { capture: true, once: true });
  });
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length }))).toEqual({ html: '<ul><li><p title="Body">AB!</p><h2>Later</h2></li></ul>', changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li><p title="Body">AB</p><h2>Later</h2></li></ul>');
});

for (const guard of ['read-only', 'composition', 'is-composing', 'ime229', 'ctrl', 'meta', 'alt', 'noncancelable']) test(`${guard} does not dispatch an owned list key bridge`, async ({ page }) => {
  await initialize(page, firstSource);
  expect(await page.evaluate((guard) => {
    const editor = window.editor;
    const root = editor.surface;
    let inputs = 0;
    root.addEventListener('beforeinput', () => { inputs++; }, { capture: true });
    if (guard === 'read-only') editor.setReadOnly(true);
    if (guard === 'composition') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: guard !== 'noncancelable', isComposing: guard === 'is-composing', keyCode: guard === 'ime229' ? 229 : 8, ctrlKey: guard === 'ctrl', metaKey: guard === 'meta', altKey: guard === 'alt' });
    root.dispatchEvent(event);
    return { inputs, prevented: event.defaultPrevented, html: editor.getHTML(), changes: window.changes.length, undo: editor.canUndo() };
  }, guard)).toEqual({ inputs: 0, prevented: false, html: firstSource, changes: 0, undo: false });
});

test('destroyed editor leaves no owned key bridge or deferred mutation on the detached surface', async ({ page }) => {
  await initialize(page, firstSource);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const html = root.innerHTML;
    editor.destroy();
    let inputs = 0;
    root.addEventListener('beforeinput', () => { inputs++; });
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    return { connected: root.isConnected, inputs, prevented: event.defaultPrevented, html: root.innerHTML === html };
  })).toEqual({ connected: false, inputs: 0, prevented: false, html: true });
});
