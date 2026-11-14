import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditorDocument } from '@morfira-dev/wysiwyg';

const initialize = async (page: Page, value = '<p><br></p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
  }, value);
};

test('ordered-list start preserves signed integer bounds and canonical HTML/JSON round trips', async ({ page }) => {
  await initialize(page);
  for (const [input, expected] of [['1', '1'], ['0', '0'], ['-2', '-2'], ['2147483647', '2147483647'], ['-2147483648', '-2147483648'], [' +0004 ', '4'], ['-0', '0'], ['0000', '0']]) {
    await test.step(`start=${JSON.stringify(input)}`, async () => {
      expect(await page.evaluate(({ input }) => {
        const editor = window.editor;
        editor.setHTML(`<ol start="${input}"><li>Item</li></ol>`);
        const imported = editor.getJSON();
        const root = imported.children[0];
        if (root.type !== 'element') throw new Error('Expected ordered list.');
        const html = editor.getHTML();
        editor.setJSON(imported);
        return { start: root.attributes.start, html, roundTrip: editor.getHTML(), domStart: (editor.surface.querySelector('ol') as HTMLOListElement).start };
      }, { input })).toEqual({ start: expected, html: `<ol start="${expected}"><li>Item</li></ol>`, roundTrip: `<ol start="${expected}"><li>Item</li></ol>`, domStart: Number(expected) });
      expect(await page.evaluate((input) => {
        window.editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'ol', attributes: { start: input }, children: [{ type: 'element', tag: 'li', attributes: {}, children: [{ type: 'text', text: 'JSON' }] }] }] });
        return window.editor.getHTML();
      }, input)).toBe(`<ol start="${expected}"><li>JSON</li></ol>`);
    });
  }
  await page.evaluate(() => window.editor.setHTML('<ol><li>Default</li></ol>'));
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ol><li>Default</li></ol>');
});

test('HTML strips invalid ordered-list starts and start attributes on other tags', async ({ page }) => {
  await initialize(page);
  for (const input of ['', '+', '--2', '4.5', '1e3', '0x10', 'Infinity', 'NaN', '4x', '2 3', '2147483648', '-2147483649', '0'.repeat(20001)]) {
    expect(await page.evaluate((input) => {
      window.editor.setHTML(`<ol start="${input}"><li>Item</li></ol>`);
      return window.editor.getHTML();
    }, input)).toBe('<ol><li>Item</li></ol>');
  }
  await page.evaluate(() => window.editor.setHTML('<ul start="4"><li start="5">Item</li></ul><p start="3">Text</p>'));
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li>Item</li></ul><p>Text</p>');
});

test('invalid JSON start values and wrong tags reject atomically without clearing selection, formats or history', async ({ page }) => {
  await initialize(page, '<p title="Body">AB</p><ol start="4"><li>Keep</li></ol>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const point = root.querySelector('p')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 1, point, 1);
    editor.insertHTML('X');
    editor.format('bold', true);
    const baseline = editor.getHTML();
    const formats = JSON.stringify(editor.getFormats());
    const selection = document.getSelection()!;
    const anchor = selection.anchorNode;
    const offset = selection.anchorOffset;
    const ordered = root.querySelector('ol')!;
    const values: unknown[] = [null, 4, false, {}, [], '', '+', '1.5', '1e3', '0x10', '2147483648', '-2147483649', '0'.repeat(20001)];
    const candidates = [...values.map((value) => ({ tag: 'ol', value })), ...['ul', 'li', 'p', 'h2'].map((tag) => ({ tag, value: '4' }))];
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    const rejected = candidates.map(({ tag, value }) => {
      try {
        editor.setJSON({ version: 1, children: [{ type: 'element', tag, attributes: { start: value }, children: [] }] } as unknown as EditorDocument);
        return false;
      } catch (error) {
        return error instanceof TypeError;
      }
    });
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected: rejected.every(Boolean), mutations, html: editor.getHTML() === baseline, selection: selection.anchorNode === anchor && selection.anchorOffset === offset, formats: JSON.stringify(editor.getFormats()) === formats, ordered: ordered.isConnected, undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
  })).toEqual({ rejected: true, mutations: 0, html: true, selection: true, formats: true, ordered: true, undo: true, redo: false, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p title="Body">AB</p><ol start="4"><li>Keep</li></ol>');
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p title="Body">AXB</p><ol start="4"><li>Keep</li></ol>');
});

for (const clipboard of [false, true]) test(`${clipboard ? 'clipboard' : 'API'} nested ordered lists retain independent starts through insertion and history`, async ({ page }) => {
  await initialize(page);
  await page.evaluate((clipboard) => {
    const editor = window.editor;
    editor.surface.focus();
    const body = editor.surface.querySelector('p')!;
    document.getSelection()!.setBaseAndExtent(body, 0, body, 0);
    const value = '<ol start="9"><li>Parent<ol start="-2"><li>Child</li></ol></li></ol>';
    if (!clipboard) editor.insertHTML(value);
    else {
      const data = new DataTransfer();
      data.setData('text/html', value);
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: data });
      editor.surface.dispatchEvent(event);
    }
  }, clipboard);
  await expect(page.locator('.mw-content ol')).toHaveCount(2);
  expect(await page.locator('.mw-content ol').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('start')))).toEqual(['9', '-2']);
  const inserted = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><br></p>');
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  expect(await page.locator('.mw-content ol').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('start')))).toEqual(['9', '-2']);
});
