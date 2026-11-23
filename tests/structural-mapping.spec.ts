import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './structural-mapping.types.js';

const initialize = async (page: Page, value = '<p>abcd</p><p>tail</p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    const path = '/packages/plugins/dist/sdk.js';
    const { structuralCommands } = await import(/* @vite-ignore */ path) as typeof import('../packages/plugins/src/sdk/structural/index.js');
    const host = document.createElement('section');
    document.body.append(host);
    const editor = window.createEditor(host, { value });
    editor.focus();
    editor.setSelection(0);
    window.editor = editor;
    window.structuralProbe = { editor, commands: structuralCommands(editor), handles: [], nodes: {} };
    window.dispose = () => { editor.destroy(); host.remove(); };
  }, value);
};

test('split preserves associations and unaffected actual nodes through mapped undo/redo', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { editor, commands } = window.structuralProbe;
    const left = editor.positions.trackNode([0], 2, -1)!;
    const right = editor.positions.trackNode([0], 2, 1)!;
    const tail = editor.positions.trackNode([1], 1)!;
    const text = editor.positions.track(1)!;
    const actual = editor.surface.lastElementChild;
    const changed = commands.apply([{ kind: 'split', path: [0], offset: 2 }]);
    const split = [left, right, tail].map(editor.positions.resolveNode);
    const preserved = actual === editor.surface.lastElementChild;
    const expiredText = editor.positions.resolve(text) === undefined;
    editor.undo();
    const undo = [left, right, tail].map(editor.positions.resolveNode);
    const undoHTML = editor.getHTML();
    editor.redo();
    return { changed, split, preserved, expiredText, undo, undoHTML, redo: [left, right, tail].map(editor.positions.resolveNode), html: editor.getHTML() };
  });
  expect(result).toEqual({ changed: true, preserved: true, expiredText: true,
    split: [{ path: [0], offset: 2, deleted: false }, { path: [1], offset: 0, deleted: false }, { path: [2], offset: 1, deleted: false }],
    undo: [{ path: [0], offset: 2, deleted: false }, { path: [0], offset: 2, deleted: false }, { path: [1], offset: 1, deleted: false }],
    undoHTML: '<p>abcd</p><p>tail</p>', redo: [{ path: [0], offset: 2, deleted: false }, { path: [1], offset: 0, deleted: false }, { path: [2], offset: 1, deleted: false }], html: '<p>ab</p><p>cd</p><p>tail</p>' });
});

test('join restores distinct leaf paths while preserving left wrapper and actual neighbours', async ({ page }) => {
  await initialize(page, '<h2 title="left">Left</h2><p>Right</p><p>Tail</p>');
  const result = await page.evaluate(() => {
    const { editor, commands } = window.structuralProbe;
    const right = editor.positions.trackNode([1], 2)!;
    const tail = editor.positions.trackNode([2], 1)!;
    const actualLeft = editor.surface.firstElementChild;
    const actualTail = editor.surface.lastElementChild;
    commands.apply([{ kind: 'join', path: [0] }]);
    const joined = { html: editor.getHTML(), right: editor.positions.resolveNode(right), tail: editor.positions.resolveNode(tail), retained: actualLeft === editor.surface.firstElementChild && actualTail === editor.surface.lastElementChild };
    editor.undo();
    return { joined, undo: editor.getHTML(), right: editor.positions.resolveNode(right), tail: editor.positions.resolveNode(tail) };
  });
  expect(result).toEqual({ joined: { html: '<h2 title="left">LeftRight</h2><p>Tail</p>', right: { path: [0], offset: 6, deleted: false }, tail: { path: [1], offset: 1, deleted: false }, retained: true }, undo: '<h2 title="left">Left</h2><p>Right</p><p>Tail</p>', right: { path: [1], offset: 2, deleted: false }, tail: { path: [2], offset: 1, deleted: false } });
});

test('empty leaves remain distinct and removed identities stay deleted after undo', async ({ page }) => {
  await initialize(page, '<p><br></p><h2><br></h2><p>Tail</p>');
  const result = await page.evaluate(() => {
    const { editor, commands } = window.structuralProbe;
    const first = editor.positions.trackNode([0], 0)!;
    const second = editor.positions.trackNode([1], 0)!;
    commands.apply([{ kind: 'insert', parent: [], index: 0, nodes: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: 'New' }] }] }]);
    const inserted = [first, second].map(editor.positions.resolveNode);
    commands.apply([{ kind: 'remove', path: [1] }]);
    const removed = [first, second].map(editor.positions.resolveNode);
    editor.undo();
    return { inserted, removed, undo: [first, second].map(editor.positions.resolveNode), html: editor.getHTML() };
  });
  expect(result).toEqual({ inserted: [{ path: [1], offset: 0, deleted: false }, { path: [2], offset: 0, deleted: false }], removed: [{ path: [1], offset: 0, deleted: true }, { path: [1], offset: 0, deleted: false }], undo: [{ path: [1], offset: 0, deleted: true }, { path: [2], offset: 0, deleted: false }], html: '<p>New</p><p><br></p><h2><br></h2><p>Tail</p>' });
});

test('moving a nested list item preserves its entire branch and surviving logical paths', async ({ page }) => {
  const before = '<ul><li><p>A</p><ul><li><p>B</p><ul><li><p>C</p></li></ul></li><li><p>D</p></li></ul></li><li><p>E</p></li></ul><p>Z</p>';
  await initialize(page, before);
  const result = await page.evaluate(() => {
    const { editor, commands } = window.structuralProbe;
    const nested = editor.positions.trackNode([0, 0, 1, 0, 1, 0, 0], 1)!;
    const remaining = editor.positions.trackNode([0, 0, 1, 1, 0], 1)!;
    const outside = editor.positions.trackNode([0, 1, 0], 1)!;
    const actual = [...editor.surface.querySelectorAll('p')];
    const source = editor.surface.querySelectorAll('li')[1];
    const changed = commands.apply([{ kind: 'move', path: [0, 0, 1, 0], parent: [0], index: 1 }]);
    const moved = [nested, remaining, outside].map(editor.positions.resolveNode);
    const retained = actual.every((node) => editor.surface.contains(node)) && editor.surface.querySelector('ul')!.children[1] === source;
    const text = editor.surface.textContent;
    editor.undo();
    const undo = [nested, remaining, outside].map(editor.positions.resolveNode);
    editor.redo();
    return { changed, moved, retained, text, undo, redo: [nested, remaining, outside].map(editor.positions.resolveNode) };
  });
  const moved = [{ path: [0, 1, 1, 0, 0], offset: 1, deleted: false }, { path: [0, 0, 1, 0, 0], offset: 1, deleted: false }, { path: [0, 2, 0], offset: 1, deleted: false }];
  expect(result).toEqual({ changed: true, retained: true, text: 'ADBCEZ', moved, undo: [{ path: [0, 0, 1, 0, 1, 0, 0], offset: 1, deleted: false }, { path: [0, 0, 1, 1, 0], offset: 1, deleted: false }, { path: [0, 1, 0], offset: 1, deleted: false }], redo: moved });
});

test('mismatched plans roll back and unsafe or unsupported operations reject before mutation', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { editor, commands } = window.structuralProbe;
    const handle = editor.positions.trackNode([0], 1)!;
    let mismatch = false;
    try { editor.transact(() => { editor.surface.firstElementChild!.textContent = 'wrong'; }, { structuralMapping: [{ kind: 'split', path: [0], offset: 2 }] }); } catch { mismatch = true; }
    const rollback = editor.getHTML();
    let rejected = 0;
    for (const plan of [
      [{ kind: 'move', path: [0], parent: [1], index: 0 }],
      [{ kind: 'split', path: [0], offset: -1 }],
      [{ kind: 'insert', parent: [], index: 0, nodes: [{ type: 'element', tag: 'script', attributes: {}, children: [] }] }],
    ]) {
      try { commands.apply(plan as Parameters<typeof commands.apply>[0]); } catch { rejected++; }
    }
    return { mismatch, rollback, rejected, html: editor.getHTML(), undo: editor.canUndo(), expired: editor.positions.resolveNode(handle) === undefined };
  });
  expect(result).toEqual({ mismatch: true, rollback: '<p>abcd</p><p>tail</p>', rejected: 3, html: '<p>abcd</p><p>tail</p>', undo: false, expired: true });
});

test('ordinary edits expire structural observations and handles are isolated/released/destroyed', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { editor } = window.structuralProbe;
    const first = editor.positions.trackNode([0], 1)!;
    const released = editor.positions.trackNode([1], 1)!;
    editor.positions.releaseNode(released);
    const host = document.createElement('div'); document.body.append(host);
    const other = window.createEditor(host, { value: '<p>Other</p>' });
    const foreign = other.positions.resolveNode(first) === undefined;
    editor.transact(() => { editor.surface.firstElementChild!.textContent = 'updated'; }, { mapping: [{ from: 0, to: 4, insert: 'updated' }] });
    const expired = editor.positions.resolveNode(first) === undefined;
    const last = editor.positions.trackNode([0], 0)!;
    editor.destroy(); other.destroy(); host.remove();
    return { foreign, expired, released: editor.positions.resolveNode(released) === undefined, destroyed: editor.positions.resolveNode(last) === undefined };
  });
  expect(result).toEqual({ foreign: true, expired: true, released: true, destroyed: true });
});

test('read-only, composition and synchronous focus replacement refuse old structural intent', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { editor, commands } = window.structuralProbe;
    const plan = [{ kind: 'split' as const, path: [0], offset: 2 }];
    editor.setReadOnly(true); const readOnly = commands.apply(plan); editor.setReadOnly(false);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = commands.apply(plan);
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    editor.focus(); editor.setSelection(1);
    const native = editor.focus;
    let selectionFocused = false;
    editor.focus = () => { editor.focus = native; native(); selectionFocused = true; editor.setSelection(5, 1); };
    const selectionRedirected = commands.apply(plan);
    editor.focus = native;
    editor.setSelection(1);
    let focused = false;
    editor.focus = () => { editor.focus = native; native(); focused = true; editor.setHTML('<p>External</p>'); };
    const redirected = commands.apply(plan);
    editor.focus = native;
    return { readOnly, composing, selectionFocused, selectionRedirected, focused, redirected, html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ readOnly: false, composing: false, selectionFocused: true, selectionRedirected: false, focused: true, redirected: false, html: '<p>External</p>', undo: false });
});

test('intermediate and aggregate serialized bounds reject compound plans before the callback', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { editor } = window.structuralProbe;
    editor.setHTML(`<p>${'&amp;'.repeat(500000)}</p>`);
    let intermediateCalled = false;
    let intermediateRejected = false;
    const before = editor.getHTML();
    try {
      editor.transact(() => { intermediateCalled = true; }, { structuralMapping: [
        { kind: 'insert', parent: [], index: 1, nodes: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: '&'.repeat(500000) }] }] },
        { kind: 'remove', path: [1] },
      ] });
    } catch { intermediateRejected = true; }
    const intermediateRetained = editor.getHTML() === before;
    editor.setHTML('<p>Small</p>');
    const leaf = { type: 'element' as const, tag: 'p' as const, attributes: {}, children: [{ type: 'text' as const, text: '&'.repeat(350000) }] };
    const plan = Array.from({ length: 3 }, () => [
      { kind: 'insert' as const, parent: [], index: 1, nodes: [leaf] },
      { kind: 'remove' as const, path: [1] },
    ]).flat();
    let aggregateCalled = false;
    let aggregateRejected = false;
    try { editor.transact(() => { aggregateCalled = true; }, { structuralMapping: plan }); } catch { aggregateRejected = true; }
    const focus = editor.focus;
    let helperFocused = false;
    let helperRejected = false;
    editor.focus = () => { helperFocused = true; focus(); };
    try { window.structuralProbe.commands.apply(plan); } catch { helperRejected = true; }
    editor.focus = focus;
    return { intermediateCalled, intermediateRejected, intermediateRetained, aggregateCalled, aggregateRejected, helperFocused, helperRejected, html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ intermediateCalled: false, intermediateRejected: true, intermediateRetained: true, aggregateCalled: false, aggregateRejected: true, helperFocused: false, helperRejected: true, html: '<p>Small</p>', undo: false });
});

test('first lazy captures refuse sanitized foreign/alias DOM and protected semantic ancestors', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const { editor } = window.structuralProbe;
    const root = editor.surface;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    root.prepend(svg);
    const foreign = editor.positions.trackNode([0], 1) === undefined;
    svg.remove();
    const original = root.firstElementChild!;
    const alias = document.createElement('div'); alias.textContent = 'abcd'; original.replaceWith(alias);
    const aliased = editor.positions.trackNode([0], 1) === undefined;
    alias.replaceWith(original);
    const host = document.createElement('section'); document.body.append(host);
    const guarded = window.createEditor(host, {
      value: '<blockquote data-mw-node="test:owner"><ul><li><p>Guarded</p></li></ul></blockquote><p>Tail</p>',
      schema: [{ name: 'test:owner', kind: 'block', tag: 'blockquote' }],
    });
    const protectedPoint = guarded.positions.trackNode([0, 0, 0, 0], 1) === undefined;
    let called = false;
    let rejected = false;
    try { guarded.transact(() => { called = true; }, { structuralMapping: [{ kind: 'remove', path: [0, 0, 0] }] }); } catch { rejected = true; }
    guarded.destroy(); host.remove();
    return { foreign, aliased, protectedPoint, called, rejected, unchanged: editor.getHTML() === '<p>abcd</p><p>tail</p>' };
  });
  expect(result).toEqual({ foreign: true, aliased: true, protectedPoint: true, called: false, rejected: true, unchanged: true });
});
