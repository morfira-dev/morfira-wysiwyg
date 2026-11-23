import { expect, test } from '@playwright/test';
import { setupExtensions } from './sdk-extensions.fixture.js';
import type {} from './sdk-extensions.types.js';

test('node extensions preserve core namespace compatibility and require explicit atomic text bounds', async ({ page }) => {
  await setupExtensions(page);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { nodeExtension, nodeCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const host = document.createElement('div');
    document.body.append(host);
    const editor = window.createEditor(host, { plugins: [nodeExtension({ name: 'demo:nested:token', kind: 'inline', tag: 'span',
      content: { type: 'text', minLength: 1, maxLength: 16, singleLine: true } }, { atomic: true })] });
    editor.setSelection(0);
    const inserted = nodeCommands(editor, 'demo:nested:token').insert('X');
    const html = editor.getHTML();
    let rejected = false;
    try { nodeExtension({ name: 'demo:unbounded', kind: 'inline', tag: 'span',
      content: { type: 'text', minLength: 1, singleLine: true } }, { atomic: true }); }
    catch { rejected = true; }
    editor.destroy();
    host.remove();
    return { inserted, html, rejected };
  });
  expect(result.inserted).toBe(true);
  expect(result.html).toContain('data-mw-node="demo:nested:token"');
  expect(result.rejected).toBe(true);
});

test('custom node commands validate metadata, map changes and keep rich state through undo', async ({ page }) => {
  await setupExtensions(page);
  const result = await page.evaluate(() => {
    const { editor, nodes } = window.sdkExtensions;
    const original = editor.getHTML();
    const target = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
    const updated = nodes.update(target, { 'data-id': 'two' }, 'NEXT');
    const serialized = editor.getHTML();
    const metadata = editor.getJSON();
    editor.undo();
    const undo = editor.getHTML() === original;
    editor.redo();
    const redo = editor.getHTML() === serialized;
    let invalid = false;
    try { nodes.insert('BAD', {}); } catch { invalid = true; }
    const unchanged = editor.getHTML() === serialized;
    editor.setSelection(0);
    const inserted = nodes.insert('<x>', { 'data-id': 'three' });
    return { updated, serialized, metadata, undo, redo, invalid, unchanged, inserted, final: editor.getHTML() };
  });
  expect(result.updated).toBe(true);
  expect(result.serialized).toContain('data-id="two"');
  expect(result.serialized).toContain('>NEXT</span>');
  expect(result.serialized).not.toContain('contenteditable');
  expect(JSON.stringify(result.metadata)).not.toContain('contenteditable');
  expect(result).toMatchObject({ undo: true, redo: true, invalid: true, unchanged: true, inserted: true });
  expect(result.final).toContain('&lt;x&gt;');
});

test('generic inline atoms navigate and delete as units and undo restores identity', async ({ page }) => {
  await setupExtensions(page);
  const atom = page.locator('.mw-content span[data-mw-node]');
  await expect(atom).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => window.editor.setSelection(6));
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 0 });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 6, length: 0 });
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AB</p>');
  await page.evaluate(() => window.editor.undo());
  await expect(atom).toHaveAttribute('data-id', 'one');
  await expect(atom).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => window.editor.setSelection(1));
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AB</p>');
});

test('atomic copy cut and paste expand partial labels and retain registered identity', async ({ page }) => {
  await setupExtensions(page);
  const result = await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    const span = editor.surface.querySelector('span')!;
    const text = span.firstChild!;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(text, 1, text, 3);
    const clipboardEvent = (type: 'copy' | 'cut' | 'paste', clipboardData: DataTransfer) => {
      const event = new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData });
      // Firefox replaces clipboardData on untrusted events. Bind the in-memory
      // transfer under test, as in the existing atomic-mention clipboard fixture.
      Object.defineProperty(event, 'clipboardData', { value: clipboardData });
      return event;
    };
    const copied = new DataTransfer();
    editor.surface.dispatchEvent(clipboardEvent('copy', copied));
    const plain = copied.getData('text/plain');
    const html = copied.getData('text/html');
    const cut = clipboardEvent('cut', copied);
    editor.surface.dispatchEvent(cut);
    const afterCut = editor.getHTML();
    editor.undo();
    const restored = editor.getHTML();
    editor.setSelection(0);
    const pasted = clipboardEvent('paste', copied);
    editor.surface.dispatchEvent(pasted);
    return { plain, html, afterCut, restored, afterPaste: editor.getHTML(), pasteOwned: pasted.defaultPrevented };
  });
  expect(result.plain).toBe('TOKEN');
  expect(result.html).toContain('data-id="one"');
  expect(result.html).not.toContain('contenteditable');
  expect(result.afterCut).toBe('<p>AB</p>');
  expect(result.restored).toContain('>TOKEN</span>');
  expect(result.afterPaste.match(/data-id="one"/g)).toHaveLength(2);
  expect(result.pasteOwned).toBe(true);
});

test('read-only and composition block atomic edits and stale node commands stay inert', async ({ page }) => {
  await setupExtensions(page);
  const result = await page.evaluate(() => {
    const { editor, nodes } = window.sdkExtensions;
    const original = editor.getHTML();
    editor.setSelection(6);
    editor.setReadOnly(true);
    const blocked = nodes.remove(editor.surface.querySelector('span')!);
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
    const readOnly = editor.getHTML() === original;
    editor.setReadOnly(false);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true, isComposing: true }));
    const composition = editor.getHTML() === original;
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const target = editor.surface.querySelector<HTMLElement>('span')!;
    editor.destroy();
    return { blocked, readOnly, composition, afterDestroy: nodes.remove(target), annotation: target.getAttribute('contenteditable') };
  });
  expect(result).toEqual({ blocked: false, readOnly: true, composition: true, afterDestroy: false, annotation: null });
});

test('external node views update and dispose without persisted DOM and reject a persisted host', async ({ page }) => {
  await setupExtensions(page, false);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createNodeViews } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const probe = window.sdkExtensions;
    const { editor, nodes } = probe;
    const host = document.querySelector<HTMLElement>('[data-sdk-views]')!;
    const unrelated = document.createElement('b');
    unrelated.textContent = 'application';
    host.append(unrelated);
    probe.view = createNodeViews(host, editor, { name: 'demo:token', create: (context) => {
      probe.created++;
      const element = document.createElement('button');
      element.textContent = context.text;
      return { element, update: (next) => { probe.updated++; element.textContent = next.text; }, destroy: () => { probe.destroyed++; } };
    } });
    const target = editor.surface.querySelector<HTMLElement>('span')!;
    nodes.update(target, { 'data-id': 'one' }, 'NEXT');
    const display = host.querySelector('button')!.textContent;
    const persisted = editor.getHTML();
    let unsafeHost = false;
    try { createNodeViews(editor.surface, editor, { name: 'demo:token', create: () => { throw new Error('must not run'); } }); }
    catch { unsafeHost = true; }
    nodes.remove(target);
    const removed = !host.querySelector('button');
    probe.view.destroy();
    probe.view.destroy();
    return { created: probe.created, updated: probe.updated, destroyed: probe.destroyed, display, persisted, unsafeHost, removed, unrelated: host.contains(unrelated) };
  });
  expect(result).toMatchObject({ created: 1, destroyed: 1, display: 'NEXT', unsafeHost: true, removed: true, unrelated: true });
  expect(result.updated).toBeGreaterThan(0);
  expect(result.persisted).not.toContain('<button');
});

test('decorations map through declared transactions and undo without entering document data', async ({ page }) => {
  await setupExtensions(page, false);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createDecorations } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const { editor } = window.sdkExtensions;
    const decorations = createDecorations(editor, { name: 'demo-sdk-token' });
    const status = decorations.getState().status;
    if (status !== 'ready') { decorations.destroy(); return { status, unsupportedCount: decorations.getState().count }; }
    const before = editor.getHTML();
    const selection = editor.getSelection();
    const set = decorations.set([{ from: 1, to: 6 }]);
    const initial = [...CSS.highlights.get('demo-sdk-token')!][0] as Range;
    const initialText = initial.toString();
    editor.transact((root) => { (root.querySelector('p')!.firstChild as Text).insertData(0, 'X'); }, { mapping: [{ from: 0, to: 0, insert: 'X' }] });
    const mapped = ([...CSS.highlights.get('demo-sdk-token')!][0] as Range).toString();
    editor.undo();
    const undo = ([...CSS.highlights.get('demo-sdk-token')!][0] as Range).toString();
    const unchanged = editor.getHTML() === before;
    const exactSelection = JSON.stringify(editor.getSelection()) === JSON.stringify(selection);
    editor.setHTML('<p>replacement</p>');
    const expired = decorations.getState().count;
    decorations.destroy();
    return { status, set, initialText, mapped, undo, unchanged, exactSelection, expired, released: !CSS.highlights.has('demo-sdk-token') };
  });
  if (result.status === 'unsupported') expect(result.unsupportedCount).toBe(0);
  else expect(result).toEqual({ status: 'ready', set: true, initialText: 'TOKEN', mapped: 'TOKEN', undo: 'TOKEN', unchanged: true, exactSelection: true, expired: 0, released: true });
});

test('decoration registry conflicts preserve another owner and view callback failures clean partial UI', async ({ page }) => {
  await setupExtensions(page, false);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createDecorations, createNodeViews } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const { editor } = window.sdkExtensions;
    const first = createDecorations(editor, { name: 'demo-owner' });
    const second = createDecorations(editor, { name: 'demo-owner' });
    const ready = first.getState().status === 'ready';
    const conflicting = second.getState().status;
    second.destroy();
    const retained = !ready || CSS.highlights.has('demo-owner');
    first.destroy();
    const host = document.querySelector<HTMLElement>('[data-sdk-views]')!;
    let failed = false;
    try { createNodeViews(host, editor, { name: 'demo:token', create: () => { throw new Error('application failure'); } }); }
    catch { failed = true; }
    return { ready, conflicting, retained, failed, empty: host.childElementCount === 0, html: editor.getHTML() };
  });
  expect(result.conflicting).toBe(result.ready ? 'conflict' : 'unsupported');
  expect(result).toMatchObject({ retained: true, failed: true, empty: true });
  expect(result.html).toContain('TOKEN');
});

test('node view callbacks may destroy their controller without leaking newly returned elements', async ({ page }) => {
  await setupExtensions(page, false);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createNodeViews } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const probe = window.sdkExtensions;
    const host = document.querySelector<HTMLElement>('[data-sdk-views]')!;
    probe.view = createNodeViews(host, probe.editor, { name: 'demo:token', create: () => {
      const element = document.createElement('button');
      element.textContent = 'owned';
      return { element, update: () => probe.view!.destroy(), destroy: () => { probe.destroyed++; } };
    } });
    probe.nodes.update(probe.editor.surface.querySelector<HTMLElement>('span')!, { 'data-id': 'two' }, 'NEXT');
    probe.view.refresh();
    probe.view.destroy();
    return { children: host.childElementCount, destroyed: probe.destroyed, html: probe.editor.getHTML() };
  });
  expect(result).toMatchObject({ children: 0, destroyed: 1 });
  expect(result.html).toContain('NEXT');
});

test('mapped positions and decorations survive atom presentation rebuilt by undo and redo', async ({ page }) => {
  await setupExtensions(page, true);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createDecorations } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const { editor } = window.sdkExtensions;
    const position = editor.positions.track(6)!;
    const decorations = createDecorations(editor, { name: 'demo-atomic-map' });
    const supported = decorations.getState().status === 'ready';
    if (supported) decorations.set([{ from: 1, to: 6 }]);
    editor.transact((root) => (root.querySelector('p')!.firstChild as Text).insertData(0, 'X'),
      { mapping: [{ from: 0, to: 0, insert: 'X' }] });
    const edited = editor.positions.resolve(position)?.index;
    editor.undo();
    const undone = editor.positions.resolve(position)?.index;
    const undoDecorations = decorations.getState().count;
    const annotation = editor.surface.querySelector('span')!.getAttribute('contenteditable');
    editor.redo();
    const redone = editor.positions.resolve(position)?.index;
    const redoDecorations = decorations.getState().count;
    const persisted = editor.getHTML();
    decorations.destroy();
    editor.positions.release(position);
    return { edited, undone, redone, supported, undoDecorations, redoDecorations, annotation, persisted };
  });
  expect(result).toMatchObject({ edited: 7, undone: 6, redone: 7, annotation: 'false' });
  expect(result.undoDecorations).toBe(result.supported ? 1 : 0);
  expect(result.redoDecorations).toBe(result.supported ? 1 : 0);
  expect(result.persisted).not.toContain('contenteditable');
});

test('typing a terminal atom suffix preserves pending fonts/styles, semantic atom identity and one word Undo', async ({ page }) => {
  await setupExtensions(page);
  const before = await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    editor.setHTML('<p><em>Prefix</em><span data-mw-node="demo:token" data-id="one">TOKEN</span></p>');
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor.surface.querySelector('p')!);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    editor.format('bold', true);
    editor.format('fontFamily', 'Georgia');
    editor.format('fontSize', '22px');
    editor.format('color', '#123456');
    return editor.getHTML();
  });
  await page.keyboard.type('word');
  const typed = await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    const paragraph = editor.surface.querySelector('p')!;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const styles: { text: string; bold: boolean; font: string; size: string; color: string }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement!.closest('em,[data-mw-node]') || !node.textContent) continue;
      const style = getComputedStyle(node.parentElement!);
      styles.push({ text: node.textContent, bold: Number(style.fontWeight) >= 600, font: style.fontFamily, size: style.fontSize, color: style.color });
    }
    const atom = paragraph.querySelector<HTMLElement>('[data-mw-node]')!;
    return { text: paragraph.textContent, atomText: atom.textContent,
      attributes: Object.fromEntries([...atom.attributes].filter((attribute) => attribute.name !== 'contenteditable').map((attribute) => [attribute.name, attribute.value])),
      atomic: atom.getAttribute('contenteditable') === 'false', renderedText: styles.map((value) => value.text).join(''),
      styled: styles.length > 0 && styles.every((value) => value.bold && value.font.includes('Georgia') && value.size === '22px' && value.color === 'rgb(18, 52, 86)') };
  });
  expect(typed).toEqual({ text: 'PrefixTOKENword', atomText: 'TOKEN', attributes: { 'data-mw-node': 'demo:token', 'data-id': 'one' }, atomic: true, renderedText: 'word', styled: true });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect(page.locator('.mw-content p')).toHaveText('PrefixTOKENword');
});

test('confirmed API and readonly cancellation release atom composition without a trailing compositionend', async ({ page }) => {
  await setupExtensions(page);
  const composing = await page.evaluate(() => {
    const root = window.editor.surface;
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setReadOnly(false);
    const key = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
    root.dispatchEvent(key);
    return { prevented: key.defaultPrevented, text: root.textContent };
  });
  expect(composing).toEqual({ prevented: false, text: 'ATOKENB' });
  await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>A<span data-mw-node="demo:token" data-id="one">TOKEN</span></p>');
    editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor.surface.querySelector('p')!); range.collapse(false);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
  });
  await page.keyboard.type('x');
  await expect(page.locator('.mw-content p')).toHaveText('ATOKENx');
  await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>A<span data-mw-node="demo:token" data-id="one">TOKEN</span></p>');
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor.surface.querySelector('p')!); range.collapse(false);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
  });
  await page.keyboard.type('y');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>A<span data-mw-node="demo:token" data-id="one">TOKEN</span>y</p>');
});
