import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    const path = '/packages/plugins/dist/sdk.js';
    const { nodeExtension } = await import(/* @vite-ignore */ path) as typeof import('../packages/plugins/src/sdk/node-extension/index.js');
    const host = document.createElement('div'); document.body.append(host);
    window.editor = window.createEditor(host, { value, plugins: [nodeExtension({
      name: 'literal:atom', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } },
      content: { type: 'text', minLength: 1, maxLength: 64, singleLine: true },
    }, { atomic: true })] });
    window.editor.focus();
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, value);
};

test('literal pending styles affect inserted text after an atom without executing markup or losing semantic data', async ({ page }) => {
  await initialize(page, '<p>A<span data-mw-node="literal:atom" data-id="one">Atom</span></p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const paragraph = root.querySelector('p')!;
    const range = document.createRange(); range.selectNodeContents(paragraph); range.collapse(false);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    editor.format('bold', true); editor.format('fontFamily', 'Georgia'); editor.format('fontSize', '22px'); editor.format('color', '#123456');
    const before = editor.getHTML();
    const literal = '<script>x</script>';
    const inserted = editor.insertTextAtCaret(literal);
    const source = editor.getHTML();
    const formats = editor.getFormats();
    const atom = root.querySelector('[data-id="one"]')!;
    const data = { marker: atom.getAttribute('data-mw-node'), id: atom.getAttribute('data-id'), label: atom.textContent };
    const inert = !root.querySelector('script,img');
    const text = root.textContent;
    editor.undo(); const undo = editor.getHTML(); const remaining = editor.canUndo();
    editor.redo();
    return { inserted, formats: { bold: formats.bold, family: formats.fontFamily, size: formats.fontSize, color: formats.color }, data, inert, text, undo: undo === before, remaining, redo: editor.getHTML() === source, caret: editor.getSelection() };
  });
  expect(result).toEqual({ inserted: true, formats: { bold: true, family: 'Georgia', size: '22px', color: 'rgb(18, 52, 86)' }, data: { marker: 'literal:atom', id: 'one', label: 'Atom' }, inert: true, text: 'AAtom<script>x</script>', undo: true, remaining: false, redo: true, caret: { index: 23, length: 0 } });
});

test('sequential API insertion groups typing history and shares the native pending-format path with stable redo carets', async ({ page }) => {
  await initialize(page, '<p>Go</p>');
  const first = await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(2);
    const a = editor.insertTextAtCaret('A');
    const b = editor.insertTextAtCaret('B');
    const text = editor.surface.textContent;
    editor.undo(); const undo = editor.surface.textContent; const remaining = editor.canUndo();
    editor.redo(); const redo = editor.surface.textContent; const caret = editor.getSelection();
    editor.setHTML('<p>Native</p>'); editor.setSelection(6); editor.format('bold', true);
    return { a, b, text, undo, remaining, redo, caret };
  });
  expect(first).toEqual({ a: true, b: true, text: 'GoAB', undo: 'Go', remaining: false, redo: 'GoAB', caret: { index: 4, length: 0 } });
  await page.keyboard.type('D');
  expect(await page.evaluate(() => ({ text: window.editor.surface.textContent, strong: window.editor.surface.querySelector('strong')?.textContent }))).toEqual({ text: 'NativeD', strong: 'D' });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Native</p>');
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 7, length: 0 });
});

test('literal API refuses unsupported contexts, readonly/composition and changed focus intent before mutation', async ({ page }) => {
  await initialize(page, '<p>Plain</p><pre>Code</pre><p><span data-mw-node="literal:atom" data-id="one">Atom</span></p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const point = (node: Node, offset: number) => {
      const range = document.createRange(); range.setStart(node, offset); range.collapse(true);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    };
    editor.setSelection(1); editor.setReadOnly(true); const readonly = editor.insertTextAtCaret('x'); editor.setReadOnly(false);
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); const composing = editor.insertTextAtCaret('x');
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    editor.setSelection(0, 2); const expanded = editor.insertTextAtCaret('x');
    point(root, 1); const gap = editor.insertTextAtCaret('x');
    point(root.querySelector('pre')!.firstChild!, 1); const code = editor.insertTextAtCaret('x');
    point(root.querySelector('[data-id="one"]')!.firstChild!, 1); const atom = editor.insertTextAtCaret('x');
    let invalid = 0;
    for (const text of ['x'.repeat(20001), '\u0000']) try { editor.insertTextAtCaret(text); } catch { invalid++; }
    editor.focus(); editor.setSelection(1);
    const focus = editor.focus;
    let redirectedFocus = false;
    editor.focus = () => { editor.focus = focus; focus(); redirectedFocus = true; editor.setSelection(2); };
    const redirected = editor.insertTextAtCaret('x');
    editor.focus = focus; editor.setSelection(1);
    let replacementFocus = false;
    editor.focus = () => { editor.focus = focus; focus(); replacementFocus = true; editor.setHTML('<p>External</p>'); };
    const replaced = editor.insertTextAtCaret('x'); editor.focus = focus;
    return { readonly, composing, expanded, gap, code, atom, invalid, redirectedFocus, redirected, replacementFocus, replaced, html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ readonly: false, composing: false, expanded: false, gap: false, code: false, atom: false, invalid: 2, redirectedFocus: true, redirected: false, replacementFocus: true, replaced: false, html: '<p>External</p>', undo: false });
});
