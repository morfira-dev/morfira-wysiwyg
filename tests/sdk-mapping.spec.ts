import { expect, test } from '@playwright/test';
import type { EditorPositionChange, EditorPositionHandle } from '@morfira-dev/wysiwyg';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.editor.setHTML('<p>abcd</p>');
    window.editor.setSelection(1, 2);
    window.changes.length = 0;
  });
});

test('explicit compound replacements map associated positions and mark removed interiors without rewriting document data', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const left = editor.positions.track(1, -1)!;
    const right = editor.positions.track(1, 1)!;
    const interior = editor.positions.track(2)!;
    const end = editor.positions.track(4)!;
    const changes: EditorPositionChange[] = [];
    const stop = editor.positions.subscribe((change) => changes.push(change));
    const steps = [{ from: 1, to: 1, insert: 'XY' }, { from: 3, to: 5, insert: 'Q' }];
    editor.transact((surface) => {
      const text = surface.querySelector('p')!.firstChild as Text;
      text.insertData(1, 'XY');
      text.replaceData(3, 2, 'Q');
    }, { mapping: steps });
    steps[0].insert = 'tampered';
    stop();
    return { html: editor.getHTML(), left: editor.positions.resolve(left), right: editor.positions.resolve(right),
      interior: editor.positions.resolve(interior), end: editor.positions.resolve(end), changes,
      immutable: Object.isFrozen(changes[0]) && Object.isFrozen(changes[0].steps) && Object.isFrozen(changes[0].steps[0]),
      undo: editor.canUndo(), documentChanges: window.changes.length };
  });
  expect(result).toEqual({ html: '<p>aXYQd</p>', left: { index: 1, deleted: false }, right: { index: 3, deleted: false },
    interior: { index: 4, deleted: true }, end: { index: 5, deleted: false },
    changes: [{ kind: 'mapped', steps: [{ from: 1, to: 1, insert: 'XY' }, { from: 3, to: 5, insert: 'Q' }] }],
    immutable: true, undo: true, documentChanges: 1 });
});

test('mapped undo and redo use the actual history entry and never revive a deleted identity', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const end = editor.positions.track(4)!;
    const removed = editor.positions.track(2)!;
    editor.transact((surface) => {
      (surface.querySelector('p')!.firstChild as Text).replaceData(1, 2, 'Z');
    }, { mapping: [{ from: 1, to: 3, insert: 'Z' }] });
    const after = editor.positions.track(3)!;
    const edited = [editor.positions.resolve(end), editor.positions.resolve(removed)];
    editor.undo();
    const undo = { html: editor.getHTML(), end: editor.positions.resolve(end), removed: editor.positions.resolve(removed), after: editor.positions.resolve(after) };
    editor.redo();
    return { edited, undo, redo: { html: editor.getHTML(), end: editor.positions.resolve(end), removed: editor.positions.resolve(removed), after: editor.positions.resolve(after) } };
  });
  expect(result).toEqual({ edited: [{ index: 3, deleted: false }, { index: 2, deleted: true }],
    undo: { html: '<p>abcd</p>', end: { index: 4, deleted: false }, removed: { index: 3, deleted: true }, after: { index: 4, deleted: false } },
    redo: { html: '<p>aZd</p>', end: { index: 3, deleted: false }, removed: { index: 2, deleted: true }, after: { index: 3, deleted: false } } });
});

test('an invalid mapping rolls back text, selection and history and expires previous positions', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const handle = editor.positions.track(2)!;
    const original = editor.getSelection();
    const changes: EditorPositionChange[] = [];
    editor.positions.subscribe((change) => changes.push(change));
    let rejected = false;
    try {
      editor.transact((surface) => { surface.querySelector('p')!.textContent = 'wrong'; },
        { mapping: [{ from: 1, to: 1, insert: 'expected' }] });
    }
    catch { rejected = true; }
    return { rejected, html: editor.getHTML(), selection: editor.getSelection(), original,
      undo: editor.canUndo(), redo: editor.canRedo(), expired: editor.positions.resolve(handle) === undefined,
      documentChanges: window.changes.length, kinds: changes.map((change) => change.kind) };
  });
  expect(result).toEqual({ rejected: true, html: '<p>abcd</p>', selection: { index: 1, length: 2 }, original: { index: 1, length: 2 },
    undo: false, redo: false, expired: true, documentChanges: 0, kinds: ['invalidated'] });
});

test('unmapped edits and synchronous identical-markup replacement expire tokens while same-value feedback and explicit empty maps preserve them', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const handle = editor.positions.track(2)!;
    editor.setHTML(editor.getHTML());
    const feedback = editor.positions.resolve(handle);
    editor.transact(() => editor.format('bold', true), { mapping: [] });
    const formatting = editor.positions.resolve(handle);
    editor.transact(() => editor.format('italic', true));
    const unmapped = editor.positions.resolve(handle) === undefined;
    const next = editor.positions.track(2)!;
    editor.surface.innerHTML = editor.surface.innerHTML;
    const direct = editor.positions.resolve(next) === undefined;
    const recapture = editor.positions.track(2) === undefined;
    return { feedback, formatting, unmapped, direct, recapture };
  });
  expect(result).toEqual({ feedback: { index: 2, deleted: false }, formatting: { index: 2, deleted: false }, unmapped: true, direct: true, recapture: true });
});

test('position handles belong to one editor and released or destroyed tokens remain inert', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditor } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const editor = window.editor;
    const host = document.createElement('div');
    document.body.append(host);
    const other = createEditor(host, { value: '<p>other</p>' });
    const owned = editor.positions.track(1)!;
    const foreign = other.positions.track(2)!;
    const refusals = [foreign, Object.freeze({}) as EditorPositionHandle].map((token) => editor.positions.resolve(token) === undefined);
    editor.positions.release(foreign);
    const otherCurrent = other.positions.resolve(foreign);
    editor.positions.release(owned);
    editor.positions.release(owned);
    const released = editor.positions.resolve(owned) === undefined;
    const replaced = editor.positions.track(1)!;
    editor.setHTML('<p>replacement</p>');
    const external = editor.positions.resolve(replaced) === undefined;
    other.destroy();
    const destroyed = other.positions.resolve(foreign) === undefined;
    other.positions.release(foreign);
    host.remove();
    return { refusals, otherCurrent, released, destroyed, external };
  });
  expect(result).toEqual({ refusals: [true, true], otherCurrent: { index: 2, deleted: false }, released: true, destroyed: true, external: true });
});

test('native input and composition invalidate positions and readonly blocks mapped mutations', async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.editor;
    const handle = editor.positions.track(2)!;
    editor.providePlugin('mapping-native', handle);
    editor.setSelection(1);
  });
  await page.keyboard.type('X');
  expect(await page.evaluate(() => window.editor.positions.resolve(window.editor.getPlugin<EditorPositionHandle>('mapping-native')!) === undefined)).toBe(true);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const handle = editor.positions.track(2)!;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composition = editor.positions.resolve(handle) === undefined && editor.positions.track(2) === undefined;
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    editor.setReadOnly(true);
    const observed = editor.positions.track(1)!;
    let called = false;
    editor.transact(() => { called = true; }, { mapping: [] });
    return { composition, called, observed: editor.positions.resolve(observed), html: editor.getHTML() };
  });
  expect(result).toEqual({ composition: true, called: false, observed: { index: 1, deleted: false }, html: '<p>aXbcd</p>' });
});

test('nested mapping declarations poison the outer transaction even if caught', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    let rejected = false;
    try {
      editor.transact((surface) => {
        surface.querySelector('p')!.textContent = 'updated';
        try { editor.transact(() => {}, { mapping: [] }); }
        catch { /* The outer transaction still must fail. */ }
      }, { mapping: [{ from: 0, to: 4, insert: 'updated' }] });
    }
    catch { rejected = true; }
    return { rejected, html: editor.getHTML(), undo: editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({ rejected: true, html: '<p>abcd</p>', undo: false, changes: 0 });
});

test('mapping listener errors cannot roll back an accepted edit or prevent other listeners', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const handle = editor.positions.track(4)!;
    const stop = editor.positions.subscribe(() => { throw new Error('observer failure'); });
    let delivered = 0;
    editor.positions.subscribe(() => delivered++);
    let rejected = false;
    try {
      editor.transact((surface) => { (surface.querySelector('p')!.firstChild as Text).insertData(1, 'X'); },
        { mapping: [{ from: 1, to: 1, insert: 'X' }] });
    }
    catch { rejected = true; }
    stop();
    return { rejected, delivered, html: editor.getHTML(), undo: editor.canUndo(), point: editor.positions.resolve(handle), changes: window.changes.length };
  });
  expect(result).toEqual({ rejected: true, delivered: 1, html: '<p>aXbcd</p>', undo: true, point: { index: 5, deleted: false }, changes: 1 });
});


test('transient direct DOM mutation cannot be laundered through a later valid mapped transaction', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.positions.track(4)!;
    const paragraph = editor.surface.querySelector('p')!;
    paragraph.setAttribute('data-transient', 'temporary');
    paragraph.removeAttribute('data-transient');
    editor.transact((surface) => {
      (surface.querySelector('p')!.firstChild as Text).insertData(1, 'X');
    }, { mapping: [{ from: 1, to: 1, insert: 'X' }] });
    const fresh = editor.positions.track(5)!;
    return { expired: editor.positions.resolve(original) === undefined, fresh: editor.positions.resolve(fresh), html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ expired: true, fresh: { index: 5, deleted: false }, html: '<p>aXbcd</p>', undo: true });
});

test('focus callbacks can revoke editing or replace the document before a mapped mutation starts', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const nativeFocus = editor.surface.focus.bind(editor.surface);
    let invoked = 0;
    editor.surface.focus = (options) => {
      nativeFocus(options);
      editor.setReadOnly(true);
    };
    editor.transact(() => { invoked++; }, { mapping: [] });
    const readonly = { invoked, html: editor.getHTML(), undo: editor.canUndo() };
    editor.surface.focus = nativeFocus;
    editor.setReadOnly(false);
    editor.surface.focus = (options) => {
      nativeFocus(options);
      editor.setHTML('<p>replacement</p>');
    };
    editor.transact(() => { invoked++; }, { mapping: [] });
    editor.surface.focus = nativeFocus;
    return { readonly, replacement: { invoked, html: editor.getHTML(), undo: editor.canUndo(), changes: window.changes.map((change) => change.source) } };
  });
  expect(result).toEqual({ readonly: { invoked: 0, html: '<p>abcd</p>', undo: false },
    replacement: { invoked: 0, html: '<p>replacement</p>', undo: false, changes: ['api'] } });
});

test('focus-time destruction leaves a pending mapped callback inert', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    let invoked = false;
    editor.surface.focus = () => { editor.destroy(); };
    editor.transact(() => { invoked = true; }, { mapping: [] });
    return { invoked, mounted: editor.surface.isConnected, changes: window.changes.length };
  });
  expect(result).toEqual({ invoked: false, mounted: false, changes: 0 });
});


test('reentrant mapping subscribers publish editor changes in commit order', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const end = editor.positions.track(4)!;
    let first = true;
    const kinds: string[] = [];
    editor.positions.subscribe((change) => {
      kinds.push(change.kind);
      if (!first) return;
      first = false;
      editor.transact((surface) => {
        (surface.querySelector('p')!.firstChild as Text).insertData(2, 'Y');
      }, { mapping: [{ from: 2, to: 2, insert: 'Y' }] });
    });
    editor.transact((surface) => {
      (surface.querySelector('p')!.firstChild as Text).insertData(1, 'X');
    }, { mapping: [{ from: 1, to: 1, insert: 'X' }] });
    return { html: editor.getHTML(), changes: window.changes.map((change) => change.text), kinds, end: editor.positions.resolve(end) };
  });
  expect(result).toEqual({ html: '<p>aXYbcd</p>', changes: ['aXbcd', 'aXYbcd'], kinds: ['mapped', 'mapped'], end: { index: 6, deleted: false } });
});
