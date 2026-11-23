import { expect, test } from '@playwright/test';
import { setupSourceEditing } from './source-editing.fixture.js';

test.beforeEach(async ({ page }) => setupSourceEditing(page));

test('source preview reconstructs supported HTML without fetching or executing it; Apply has one history entry', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/source-preview-probe.png', (route) => { requests.push(route.request().url()); return route.abort(); });
  const result = await page.evaluate(() => {
    const { editor, source } = window.sourceEditingProbe;
    const before = editor.getHTML();
    const opened = source.open();
    source.setValue('<h2 onclick="alert(1)">Title</h2><p><b>Safe</b><script>bad()</script><img src="/source-preview-probe.png" onerror="alert(1)"><a href="javascript:alert(1)">link</a></p>');
    const preview = source.preview();
    return { before, opened, preview, actual: editor.getHTML(), undo: editor.canUndo(), unsafeDOM: !!source.element.querySelector('img,script') };
  });
  expect(result.opened).toBe(true);
  expect(result.preview?.changed).toBe(true);
  expect(result.preview?.html).toContain('<strong>Safe</strong>');
  expect(result.preview?.html).not.toMatch(/onclick|onerror|javascript:|<script/);
  expect(result.actual).toBe(result.before);
  expect(result.undo || result.unsafeDOM).toBe(false);
  await page.waitForTimeout(50);
  expect(requests).toEqual([]);
  await page.evaluate(() => window.sourceEditingProbe.source.setValue('<h2>Changed</h2><p>Complete replacement</p>'));
  await page.getByRole('button', { name: 'Apply HTML', exact: true }).click();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() })))
    .toEqual({ html: '<h2>Changed</h2><p>Complete replacement</p>', selection: { index: 0, length: 0 }, undo: true });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selected: document.getSelection()?.toString(), undo: window.editor.canUndo() })))
    .toEqual({ html: result.before, selected: 'rigi', undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<h2>Changed</h2><p>Complete replacement</p>');
});

test('Cancel and canonical no-op preserve document, selection and existing history', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, source } = window.sourceEditingProbe;
    editor.format('italic', true);
    const before = editor.getHTML();
    const undo = editor.canUndo();
    source.open();
    source.setValue('<p>Discard</p>');
    source.close();
    const canceled = editor.getHTML();
    source.open();
    source.setValue(before);
    source.element.querySelector<HTMLButtonElement>('.mw-source-actions button:nth-child(2)')!.click();
    const after = editor.getHTML();
    const opened = source.isOpen();
    editor.undo();
    return { before, canceled, after, undo, opened, undone: editor.getHTML(), remainingUndo: editor.canUndo() };
  });
  expect(result.undo).toBe(true);
  expect(result.canceled).toBe(result.before);
  expect(result.after).toBe(result.before);
  expect(result.opened || result.remainingUndo).toBe(false);
  expect(result.undone).toBe('<p><strong>Original</strong> text</p>');
});

test('bounded drafts and aggregate resource errors leave source and document atomic', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, source, errors } = window.sourceEditingProbe;
    source.open();
    const before = editor.getHTML();
    let rejected = 0;
    for (const bad of [null, 'x'.repeat(5000001)]) {
      try { source.setValue(bad as string); } catch { rejected++; }
    }
    const previousDraft = source.getValue();
    source.setValue('<p>'+ '&'.repeat(1000001) +'</p>');
    const normalized = source.preview();
    return { rejected, previousDraft, normalized, html: editor.getHTML(), before, undo: editor.canUndo(), errors: errors.length };
  });
  expect(result.rejected).toBe(2);
  expect(result.previousDraft).toBe(result.before);
  expect(result.normalized).toBeUndefined();
  expect(result.html).toBe(result.before);
  expect(result.undo).toBe(false);
  expect(result.errors).toBe(1);
});

test('external replacement closes stale drafts, while same-markup reconstruction cannot authorize Apply', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, source } = window.sourceEditingProbe;
    source.open();
    source.setValue('<p>Stale draft</p>');
    editor.setHTML('<p>External</p>');
    const closed = !source.isOpen();
    const retained = source.getValue();
    source.open();
    source.setValue('<p>Do not apply</p>');
    editor.surface.innerHTML = editor.surface.innerHTML;
    source.element.querySelector<HTMLButtonElement>('.mw-source-actions button:nth-child(2)')!.click();
    return { closed, retained, html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ closed: true, retained: '<p>Stale draft</p>', html: '<p>External</p>', undo: false });
});

test('synchronous focus-time replacement cannot redirect source Apply to the new document', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, source } = window.sourceEditingProbe;
    source.open();
    source.setValue('<p>Old draft</p>');
    let invoked = false;
    const focus = editor.focus;
    editor.focus = () => {
      editor.focus = focus;
      focus();
      invoked = true;
      editor.setHTML('<p>New external document</p>');
    };
    source.element.querySelector<HTMLButtonElement>('.mw-source-actions button:nth-child(2)')!.click();
    return { invoked, html: editor.getHTML(), undo: editor.canUndo(), opened: source.isOpen() };
  });
  expect(result).toEqual({ invoked: true, html: '<p>New external document</p>', undo: false, opened: false });
});

test('newer owned selection intent refuses Apply; readonly and composition protect both source and draft', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, source } = window.sourceEditingProbe;
    source.open();
    source.setValue('<p>New source</p>');
    const range = document.createRange();
    range.setStart(editor.surface.querySelector('strong')!.firstChild!, 0);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    source.element.querySelector<HTMLButtonElement>('.mw-source-actions button:nth-child(2)')!.click();
    const unchanged = editor.getHTML();
    source.close();
    editor.setReadOnly(true);
    const readonly = source.open();
    editor.setReadOnly(false);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = source.open();
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    editor.setSelection(0);
    const reopened = source.open();
    const textarea = source.element.querySelector('textarea')!;
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const disabled = source.element.querySelector<HTMLButtonElement>('.mw-source-actions button:nth-child(2)')!.disabled;
    textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { unchanged, readonly, composing, reopened, disabled, undo: editor.canUndo() };
  });
  expect(result).toEqual({ unchanged: '<p><strong>Original</strong> text</p>', readonly: false, composing: false, reopened: true, disabled: true, undo: false });
});

test('semantic metadata uses the current schema and controllers remain isolated and disposable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/source.js';
    const { createSourceEditor } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/source');
    const { editor, source, uiHost } = window.sourceEditingProbe;
    const secondHost = document.createElement('div');
    const secondUI = document.createElement('aside');
    document.body.append(secondHost, secondUI);
    const second = window.createEditor(secondHost, { value: '<p>Second</p>', schema: [{ name: 'demo:label', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', maxLength: 8 } } }] });
    const other = createSourceEditor(secondUI, second);
    second.setSelection(0);
    other.open();
    other.setValue('<p><span data-mw-node="demo:label" data-id="abc">Label</span></p>');
    const own = other.preview()?.html;
    other.close();
    editor.focus();
    editor.setSelection(0);
    source.open();
    source.setValue('<p><span data-mw-node="demo:label" data-id="abc">Label</span></p>');
    const unknown = source.preview()?.html;
    source.close();
    uiHost.remove();
    const lostHost = source.open();
    source.destroy();
    source.destroy();
    let disposed = false;
    try { source.setValue('x'); } catch { disposed = true; }
    second.destroy();
    const cleaned = !secondUI.querySelector('dialog');
    secondHost.remove();
    secondUI.remove();
    return { own, unknown, lostHost, disposed, cleaned, first: editor.getHTML() };
  });
  expect(result.own).toContain('data-mw-node="demo:label"');
  expect(result.unknown).not.toContain('data-mw-node');
  expect(result.lostHost).toBe(false);
  expect(result.disposed && result.cleaned).toBe(true);
  expect(result.first).toBe('<p><strong>Original</strong> text</p>');
});

test('reparenting the UI host into the document disposes it before accepting draft changes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, source, uiHost } = window.sourceEditingProbe;
    source.open();
    source.setValue('<p>Must not apply</p>');
    editor.surface.append(uiHost);
    const open = source.isOpen();
    let refused = false;
    try { source.setValue('<p>Late</p>'); } catch { refused = true; }
    return { open, refused, dialog: !!editor.surface.querySelector('dialog'), text: editor.surface.textContent };
  });
  expect(result).toEqual({ open: false, refused: true, dialog: false, text: 'Original text' });
});


test('whole-document source replacement clears pending caret formatting and Undo restores the original pending state', async ({ page }) => {
  await page.evaluate(() => {
    const { editor, source } = window.sourceEditingProbe;
    editor.setHTML('<p>Original</p>');
    editor.setSelection(0);
    editor.format('bold', true);
    source.open();
    source.setValue('<p>Replacement</p>');
    source.element.querySelector<HTMLButtonElement>('.mw-source-actions button:nth-child(2)')!.click();
  });
  expect(await page.evaluate(() => window.editor.getFormats().bold === true)).toBe(false);
  await page.keyboard.type('X');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>XReplacement</p>');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), bold: window.editor.getFormats().bold })))
    .toEqual({ html: '<p>Original</p>', bold: true });
});


test('empty source creates one editable body and the next typed text uses that body', async ({ page }) => {
  await page.evaluate(() => {
    const { source } = window.sourceEditingProbe;
    source.open();
    source.setValue('');
    source.element.querySelector<HTMLButtonElement>('.mw-source-actions button:nth-child(2)')!.click();
  });
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    return { html: window.editor.getHTML(), inside: document.getSelection()?.anchorNode === root.firstElementChild };
  })).toEqual({ html: '<p><br></p>', inside: true });
  await page.keyboard.type('X');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>X</p>');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><strong>Original</strong> text</p>');
});
