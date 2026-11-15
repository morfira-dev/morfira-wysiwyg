import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditorEvents, EditorInputCommit } from '@morfira-dev/wysiwyg';

const typeContract = (events: EditorEvents) => {
  events.on('inputcommit', (receipt) => {
    const operation: 'insertParagraph' | 'insertFromPaste' = receipt.inputType;
    const current: boolean = receipt.isCurrent();
    void operation; void current;
    // @ts-expect-error Core receipts cannot be emitted by applications.
    events.emit('inputcommit', receipt);
  });
};
void typeContract;

const initialize = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.editor = window.createEditor(host, { value: '<p>AB</p>' });
    window.editor.setSelection(1);
  });
};

test('controlled input receipts retain original cause identity after change and selection notifications', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const order: string[] = [];
    const records: { type: string; identity: boolean; current: boolean }[] = [];
    let cause: Event;
    editor.events.on('change', () => order.push('change'));
    editor.events.on('selectionchange', () => order.push('selection'));
    editor.events.on('inputcommit', (receipt) => {
      order.push('receipt');
      records.push({ type: receipt.inputType, identity: receipt.sourceEvent === cause, current: receipt.isCurrent() });
    });
    cause = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
    editor.surface.dispatchEvent(cause);
    const firstOrder = [...order];
    editor.setHTML('<ul><li>AB</li></ul>');
    editor.setSelection(1);
    order.length = 0;
    cause = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    editor.surface.dispatchEvent(cause);
    const listOrder = [...order];
    editor.setHTML('<p>AB</p>');
    editor.setSelection(1);
    order.length = 0;
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', 'X');
    cause = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(cause, 'clipboardData', { value: clipboard });
    editor.surface.dispatchEvent(cause);
    let reservedRejected = false;
    try { (editor.events.emit as unknown as (event: string, payload: unknown) => void)('inputcommit', {}); }
    catch { reservedRejected = true; }
    return { records, firstOrder, listOrder, pasteOrder: order, reservedRejected, html: editor.getHTML() };
  })).toEqual({ records: [
    { type: 'insertParagraph', identity: true, current: true },
    { type: 'insertParagraph', identity: true, current: true },
    { type: 'insertFromPaste', identity: true, current: true },
  ], firstOrder: ['change', 'selection', 'receipt'], listOrder: ['change', 'selection', 'receipt'], pasteOrder: ['change', 'selection', 'receipt'], reservedRejected: true, html: '<p>AXB</p>' });
});

test('API history, canceled or empty clipboard, Shift+Enter and composition do not fabricate receipts', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    let receipts = 0;
    editor.events.on('inputcommit', () => receipts++);
    editor.insertHTML('X'); editor.undo(); editor.redo();
    editor.setHTML('<p>AB</p>'); editor.setJSON(editor.getJSON()); editor.setSelection(1);
    const canceled = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
    canceled.preventDefault(); editor.surface.dispatchEvent(canceled);
    const empty = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(empty, 'clipboardData', { value: new DataTransfer() });
    editor.surface.dispatchEvent(empty);
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true }));
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', isComposing: true, bubbles: true, cancelable: true }));
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    editor.setReadOnly(true);
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }));
    editor.setReadOnly(false);
    editor.setHTML('<p>AB</p>'); editor.setSelection(1);
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: false }));
    editor.setHTML('<ul><li>AB</li></ul>'); editor.setSelection(1);
    editor.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: false }));
    editor.setHTML('<p>AB</p>'); editor.setSelection(1);
    const clipboard = new DataTransfer(); clipboard.setData('text/plain', 'X');
    const legacyPaste = new ClipboardEvent('paste', { bubbles: true, cancelable: false });
    Object.defineProperty(legacyPaste, 'clipboardData', { value: clipboard });
    editor.surface.dispatchEvent(legacyPaste);
    return receipts;
  })).toBe(0);
});

test('receipt snapshots are independent and observer errors cannot roll back committed input or prevent receipt delivery', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    let saved: EditorInputCommit | undefined;
    let observed: unknown;
    let reported = false;
    const error = (event: ErrorEvent) => { reported = event.error instanceof AggregateError; event.preventDefault(); };
    window.addEventListener('error', error);
    editor.events.on('change', () => { throw new Error('Application observer'); });
    editor.events.on('inputcommit', (receipt) => {
      saved = receipt;
      if (receipt.selection) receipt.selection.start[0] = 999;
    });
    editor.events.on('inputcommit', (receipt) => {
      observed = { start: receipt.selection?.start, current: receipt.isCurrent() };
      editor.format('bold', true);
    });
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }));
    window.removeEventListener('error', error);
    const afterPendingFormat = saved!.isCurrent();
    const html = editor.getHTML();
    const undo = editor.canUndo();
    editor.destroy();
    return { observed, reported, afterPendingFormat, html, undo, afterDestroy: saved!.isCurrent() };
  })).toEqual({ observed: { start: [1], current: true }, reported: true, afterPendingFormat: false, html: '<p>A</p><p>B</p>', undo: true, afterDestroy: false });
});
