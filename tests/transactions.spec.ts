import { expect, test } from '@playwright/test';

const initialize = async (page: import('@playwright/test').Page) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => { window.editor.setHTML('<p>abc</p>'); window.editor.setSelection(3); });
};

test('nested plugin commands compose into one change and one selection-restoring history step', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const changes: string[] = []; const selections: string[] = [];
    window.editor.subscribe((change) => changes.push(change.html));
    window.editor.onSelectionChange(() => selections.push(window.editor.getHTML()));
    window.editor.transact(() => {
      window.editor.setSelection(0, 3); window.editor.format('bold', true);
      window.editor.setSelection(3); window.editor.transact(() => window.editor.insertHTML('<p>!</p>'));
    });
    const html = window.editor.getHTML(); const caret = window.editor.getSelection(); const intermediateSelections = [...selections]; const count = changes.length;
    window.editor.undo(); const undone = window.editor.getHTML(); const restored = window.editor.getSelection(); const furtherUndo = window.editor.canUndo();
    window.editor.redo(); return { html, caret, intermediateSelections, count, undone, restored, furtherUndo, redone: window.editor.getHTML() };
  });
  expect(result.html).toBe('<p><strong>abc!</strong></p>'); expect(result.caret).toEqual({ index: 4, length: 0 });
  expect(result.intermediateSelections.length).toBeGreaterThan(0); expect(new Set(result.intermediateSelections)).toEqual(new Set([result.html]));
  expect(result.count).toBe(1); expect(result.undone).toBe('<p>abc</p>'); expect(result.restored).toEqual({ index: 3, length: 0 });
  expect(result.furtherUndo).toBe(false); expect(result.redone).toBe(result.html);
});

test('caught nested mutation failure poisons the outer edit and preserves existing redo', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.insertHTML('<p>existing</p>'); window.editor.undo(); let changes = 0; let rejected = false;
    window.editor.subscribe(() => changes++);
    try {
      window.editor.transact((surface) => {
        surface.querySelector('p')!.append('first');
        try { window.editor.transact(() => { window.editor.setSelection(1); throw new Error('nested failure'); }); } catch { /* Outer must still fail. */ }
        surface.querySelector('p')!.append('last');
      });
    } catch { rejected = true; }
    const html = window.editor.getHTML(); const caret = window.editor.getSelection(); const undo = window.editor.canUndo(); const redo = window.editor.canRedo();
    window.editor.redo(); return { rejected, html, caret, undo, redo, changes, redone: window.editor.getHTML() };
  });
  expect(result).toEqual({ rejected: true, html: '<p>abc</p>', caret: { index: 3, length: 0 }, undo: false, redo: true, changes: 1, redone: '<p>abcexisting</p>' });
});

for (const operation of ['setHTML', 'setJSON', 'undo', 'redo', 'setReadOnly', 'destroy'] as const) test(`caught ${operation} is forbidden inside a transaction and rolls back atomically`, async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate((operation) => {
    let rejected = false; let changes = 0; window.editor.subscribe(() => changes++);
    try {
      window.editor.transact((surface) => {
        surface.querySelector('p')!.append('changed');
        try {
          if (operation === 'setHTML') window.editor.setHTML('<p>external</p>');
          else if (operation === 'setJSON') window.editor.setJSON({ version: 1, children: [] });
          else if (operation === 'setReadOnly') window.editor.setReadOnly(true);
          else window.editor[operation]();
        } catch { /* The outer edit must fail even if this error is caught. */ }
      });
    } catch { rejected = true; }
    return { rejected, html: window.editor.getHTML(), caret: window.editor.getSelection(), changes, undo: window.editor.canUndo(), readOnly: window.editor.isReadOnly(), mounted: window.editor.element.isConnected };
  }, operation);
  expect(result).toEqual({ rejected: true, html: '<p>abc</p>', caret: { index: 3, length: 0 }, changes: 0, undo: false, readOnly: false, mounted: true });
});

test('read-only and no-op transactions do not execute edits or add history', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    let invoked = 0; let changes = 0; window.editor.subscribe(() => changes++);
    window.editor.setReadOnly(true); window.editor.transact(() => invoked++); window.editor.setReadOnly(false);
    window.editor.transact(() => {});
    return { invoked, changes, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ invoked: 0, changes: 0, html: '<p>abc</p>', undo: false });
});

test('declared async callbacks are rejected before invocation and returned thenables roll back synchronous edits', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    let invoked = false; let asyncRejected = false; let thenableRejected = false;
    try { window.editor.transact(async () => { invoked = true; }); } catch { asyncRejected = true; }
    try { window.editor.transact((surface) => { surface.querySelector('p')!.append('bad'); return { then: () => {} }; }); } catch { thenableRejected = true; }
    return { invoked, asyncRejected, thenableRejected, html: window.editor.getHTML(), caret: window.editor.getSelection(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ invoked: false, asyncRejected: true, thenableRejected: true, html: '<p>abc</p>', caret: { index: 3, length: 0 }, undo: false });
});

test('listener failure after a composed edit retains a single committed revision', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const off = window.editor.subscribe(() => { throw new Error('observer'); }); let rejected = false;
    try { window.editor.transact(() => { window.editor.insertHTML('<p>1</p>'); window.editor.insertHTML('<p>2</p>'); }); } catch { rejected = true; }
    const html = window.editor.getHTML(); const undo = window.editor.canUndo(); off(); window.editor.undo();
    return { rejected, html, undo, restored: window.editor.getHTML(), moreUndo: window.editor.canUndo() };
  });
  expect(result).toEqual({ rejected: true, html: '<p>abc12</p>', undo: true, restored: '<p>abc</p>', moreUndo: false });
});


test('custom events cannot expose intermediate transaction content even when their rejection is caught', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const token = window.createPluginEvent<void>('transaction:intermediate');
    let delivered = 0;
    let rejected = false;
    window.editor.events.on(token, () => delivered++);
    try {
      window.editor.transact((surface) => {
        surface.querySelector('p')!.append('partial');
        try { window.editor.events.emit(token, undefined); } catch { /* Rejection must poison the outer transaction. */ }
      });
    } catch { rejected = true; }
    return { delivered, rejected, html: window.editor.getHTML(), caret: window.editor.getSelection(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ delivered: 0, rejected: true, html: '<p>abc</p>', caret: { index: 3, length: 0 }, undo: false });
});
