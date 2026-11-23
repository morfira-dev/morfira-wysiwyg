import { expect, test } from '@playwright/test';
import type { EditorSelectionHandle } from '@morfira-dev/wysiwyg';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.editor.setHTML('<p>abc</p>');
    window.editor.setSelection(1, 1);
    window.changes.length = 0;
  });
});

test('selection handles restore exact backward, BR and empty-block boundaries without document or history changes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>ab<br>cd</p><p><br></p>');
    window.changes.length = 0;
    const [first, empty] = editor.surface.querySelectorAll('p');
    const native = document.getSelection()!;
    const cases = [
      { anchor: first.lastChild!, anchorOffset: 1, focus: first.firstChild!, focusOffset: 1 },
      { anchor: first, anchorOffset: 1, focus: first, focusOffset: 2 },
      { anchor: empty, anchorOffset: 0, focus: empty, focusOffset: 0 },
    ];
    const before = editor.getHTML();
    const restored = cases.map((point) => {
      native.setBaseAndExtent(point.anchor, point.anchorOffset, point.focus, point.focusOffset);
      const handle = editor.selection.capture()!;
      const observation = editor.selection.getRange(handle)!;
      observation.selectNodeContents(editor.surface);
      observation.collapse(false);
      native.collapse(first.firstChild!, 0);
      const accepted = editor.selection.restore(handle);
      const exact = native.anchorNode === point.anchor && native.anchorOffset === point.anchorOffset
        && native.focusNode === point.focus && native.focusOffset === point.focusOffset;
      const frozen = Object.isFrozen(handle);
      editor.selection.release(handle);
      return { accepted, exact, frozen };
    });
    return { restored, unchanged: editor.getHTML() === before, undo: editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({
    restored: Array.from({ length: 3 }, () => ({ accepted: true, exact: true, frozen: true })),
    unchanged: true, undo: false, changes: 0,
  });
});

test('foreign, forged, released and destroyed handles refuse without disturbing the current selection', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditor } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const editor = window.editor;
    const host = document.createElement('div');
    document.body.append(host);
    const second = createEditor(host, { value: '<p>other</p>' });
    editor.setSelection(1, 1);
    const owned = editor.selection.capture()!;
    second.setSelection(1, 2);
    const foreign = second.selection.capture()!;
    const outsideCapture = editor.selection.capture() === undefined;
    editor.setSelection(0);
    const before = editor.getSelection();
    const forged = Object.freeze({}) as EditorSelectionHandle;
    const refusals = [foreign, forged].map((handle) => ({
      current: editor.selection.isCurrent(handle),
      restored: editor.selection.restore(handle),
      range: editor.selection.getRange(handle) !== undefined,
    }));
    editor.selection.release(foreign);
    const otherStillCurrent = second.selection.isCurrent(foreign);
    editor.selection.release(owned);
    editor.selection.release(owned);
    const released = editor.selection.restore(owned);
    const unchanged = JSON.stringify(editor.getSelection()) === JSON.stringify(before);
    second.destroy();
    const destroyed = { current: second.selection.isCurrent(foreign), restored: second.selection.restore(foreign), range: second.selection.getRange(foreign) !== undefined };
    second.selection.release(foreign);
    host.remove();
    return { refusals, outsideCapture, otherStillCurrent, released, unchanged, html: editor.getHTML(), undo: editor.canUndo(), destroyed };
  });
  expect(result).toEqual({
    refusals: [{ current: false, restored: false, range: false }, { current: false, restored: false, range: false }],
    outsideCapture: true, otherStillCurrent: true, released: false, unchanged: true, html: '<p>abc</p>', undo: false,
    destroyed: { current: false, restored: false, range: false },
  });
});

test('detaching and reinserting the same editor cannot revive an earlier capture', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const saved = editor.selection.capture()!;
    const parent = editor.element.parentNode!;
    const following = editor.element.nextSibling;
    editor.element.remove();
    parent.insertBefore(editor.element, following);
    const before = editor.getSelection();
    const restored = editor.selection.restore(saved);
    return { restored, current: editor.selection.isCurrent(saved), before, after: editor.getSelection(), html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result.restored).toBe(false);
  expect(result.current).toBe(false);
  expect(result.after).toEqual(result.before);
  expect(result.html).toBe('<p>abc</p>');
  expect(result.undo).toBe(false);
});

test('same-value feedback preserves identity while same-markup replacement and reverted DOM mutations invalidate synchronously', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const handle = editor.selection.capture()!;
    const original = editor.surface.querySelector('p')!;
    editor.setHTML(editor.getHTML());
    const feedback = { current: editor.selection.isCurrent(handle), sameNode: editor.surface.querySelector('p') === original };
    original.replaceWith(original.cloneNode(true));
    const replacement = { current: editor.selection.isCurrent(handle), restored: editor.selection.restore(handle), recaptured: editor.selection.capture() !== undefined };
    editor.setHTML('<p>fresh</p>');
    editor.setSelection(1, 1);
    const fresh = editor.selection.capture()!;
    const p = editor.surface.querySelector('p')!;
    p.setAttribute('data-test-pending', 'temporary');
    p.removeAttribute('data-test-pending');
    const unchangedHTML = editor.getHTML() === '<p>fresh</p>';
    const revertedMutation = { current: editor.selection.isCurrent(fresh), restored: editor.selection.restore(fresh) };
    return { feedback, replacement, unchangedHTML, revertedMutation, html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({
    feedback: { current: true, sameNode: true },
    replacement: { current: false, restored: false, recaptured: false },
    unchangedHTML: true, revertedMutation: { current: false, restored: false }, html: '<p>fresh</p>', undo: false,
  });
});

test('content commits and undo redo invalidate handles permanently instead of mapping them onto rebuilt nodes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.selection.capture()!;
    editor.format('bold', true);
    const formattedHTML = editor.getHTML();
    const formatted = editor.selection.capture()!;
    const invalidAfterEdit = editor.selection.isCurrent(original);
    editor.undo();
    const undoneHTML = editor.getHTML();
    const restoredSelection = editor.getSelection();
    const undone = editor.selection.capture()!;
    const invalidAfterUndo = [editor.selection.isCurrent(formatted), editor.selection.restore(original)];
    editor.redo();
    return {
      formattedHTML, undoneHTML, restoredSelection, invalidAfterEdit, invalidAfterUndo,
      invalidAfterRedo: editor.selection.isCurrent(undone), redoneHTML: editor.getHTML(),
    };
  });
  expect(result).toEqual({
    formattedHTML: '<p>a<strong>b</strong>c</p>', undoneHTML: '<p>abc</p>', restoredSelection: { index: 1, length: 1 },
    invalidAfterEdit: false, invalidAfterUndo: [false, false], invalidAfterRedo: false, redoneHTML: '<p>a<strong>b</strong>c</p>',
  });
});

test('a rolled-back transaction restores content and history but cannot revive an old selection handle', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.selection.capture()!;
    let refusedInside = false;
    let threw = false;
    try {
      editor.transact((surface) => {
        refusedInside = editor.selection.capture() === undefined;
        surface.querySelector('p')!.append('X');
        throw new Error('Reject this plugin edit.');
      });
    }
    catch { threw = true; }
    const current = editor.selection.capture()!;
    return {
      threw, refusedInside, stale: editor.selection.isCurrent(original), restored: editor.selection.restore(original),
      fresh: editor.selection.isCurrent(current), html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), changes: window.changes.length,
    };
  });
  expect(result).toEqual({
    threw: true, refusedInside: true, stale: false, restored: false, fresh: true,
    html: '<p>abc</p>', selection: { index: 1, length: 1 }, undo: false, changes: 0,
  });
});

test('transaction target queries remain observational while capture and restoration refuse until commit', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const saved = editor.selection.capture()!;
    let before = { current: false, text: '', captured: true, restored: true };
    let after = { current: true, hasRange: true };
    editor.transact(() => {
      before = {
        current: editor.selection.isCurrent(saved),
        text: editor.selection.getRange(saved)?.toString() ?? '',
        captured: editor.selection.capture() !== undefined,
        restored: editor.selection.restore(saved),
      };
      editor.format('bold', true);
      after = { current: editor.selection.isCurrent(saved), hasRange: editor.selection.getRange(saved) !== undefined };
    });
    const committed = { html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo() };
    editor.undo();
    return { before, after, committed, undone: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo() };
  });
  expect(result).toEqual({
    before: { current: true, text: 'b', captured: false, restored: false },
    after: { current: false, hasRange: false },
    committed: { html: '<p>a<strong>b</strong>c</p>', selection: { index: 1, length: 1 }, changes: 1, undo: true },
    undone: '<p>abc</p>', selection: { index: 1, length: 1 }, undo: false,
  });
});

test('real native typing invalidates a saved plugin target and undo does not resurrect it', async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(3);
    editor.providePlugin('test:saved-selection', editor.selection.capture()!);
  });
  await page.keyboard.type('!');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const saved = editor.getPlugin<EditorSelectionHandle>('test:saved-selection')!;
    const typed = editor.getHTML();
    const afterInput = editor.selection.restore(saved);
    editor.undo();
    return { typed, afterInput, afterUndo: editor.selection.isCurrent(saved), html: editor.getHTML(), selection: editor.getSelection() };
  });
  expect(result).toEqual({ typed: '<p>abc!</p>', afterInput: false, afterUndo: false, html: '<p>abc</p>', selection: { index: 3, length: 0 } });
});

test('read-only permits observational restoration while composition invalidates and refuses captures', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.selection.capture()!;
    editor.setReadOnly(true);
    editor.setSelection(0);
    const restoredReadOnly = editor.selection.restore(original);
    const readOnlySelection = editor.getSelection();
    editor.format('bold', true);
    const readOnlyHTML = editor.getHTML();
    editor.setReadOnly(false);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = { current: editor.selection.isCurrent(original), restored: editor.selection.restore(original), capture: editor.selection.capture() !== undefined };
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    return { restoredReadOnly, readOnlySelection, readOnlyHTML, composing, undo: editor.canUndo() };
  });
  expect(result).toEqual({
    restoredReadOnly: true, readOnlySelection: { index: 1, length: 1 }, readOnlyHTML: '<p>abc</p>',
    composing: { current: false, restored: false, capture: false }, undo: false,
  });
});

test('focus-time document replacement leaves a retained target inert and preserves the new document selection', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.selection.capture()!;
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    editor.surface.addEventListener('focus', () => {
      editor.setHTML('<p>replacement</p>');
      editor.setSelection(2, 3);
    }, { once: true });
    editor.focus();
    const before = editor.getSelection();
    const accepted = editor.selection.restore(original);
    const current = editor.selection.isCurrent(original);
    button.remove();
    return { accepted, current, before, after: editor.getSelection(), html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ accepted: false, current: false, before: { index: 2, length: 3 }, after: { index: 2, length: 3 }, html: '<p>replacement</p>', undo: false });
});

test('native restoration preserves a newer range selected by a synchronous focus callback', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const saved = editor.selection.capture()!;
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.append(outside);
    outside.focus();
    const native = document.getSelection()!;
    native.setBaseAndExtent(outside.firstChild!, 0, outside.firstChild!, 1);
    let focusCalls = 0;
    editor.surface.addEventListener('focus', () => {
      focusCalls++;
      editor.setSelection(2, 1);
    }, { once: true });
    const accepted = editor.selection.restore(saved);
    const selection = editor.getSelection();
    const current = editor.selection.isCurrent(saved);
    outside.remove();
    return { accepted, selection, current, focused: focusCalls > 0, html: editor.getHTML(), undo: editor.canUndo() };
  });
  // Setting native selection focuses contenteditable in some engines only.
  // Whichever browser path ran, a callback's newer selection must win.
  expect(result.accepted).toBe(!result.focused);
  expect(result.selection).toEqual(result.focused ? { index: 2, length: 1 } : { index: 1, length: 1 });
  expect(result.current).toBe(true);
  expect(result.html).toBe('<p>abc</p>');
  expect(result.undo).toBe(false);
});
