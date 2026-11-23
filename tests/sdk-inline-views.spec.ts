import { expect, test } from '@playwright/test';
import { setupInlineViews } from './sdk-inline-views.fixture.js';

test.beforeEach(async ({ page }) => setupInlineViews(page));

test('visual overlay follows the source bounds without entering source, history or exported data', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    const { controller } = window.inlineViewProbe;
    const before = { html: editor.getHTML(), json: editor.getJSON(), text: editor.getText(), selection: editor.getSelection() };
    controller.refresh();
    const node = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
    const wrapper = controller.element.firstElementChild as HTMLElement;
    const source = node.getBoundingClientRect();
    const visual = wrapper.getBoundingClientRect();
    return { invariant: JSON.stringify(before) === JSON.stringify({ html: editor.getHTML(), json: editor.getJSON(), text: editor.getText(), selection: editor.getSelection() }),
      undo: editor.canUndo(), outside: !editor.surface.contains(controller.element) && controller.element.parentElement === editor.element,
      sourceText: node.textContent, visualText: wrapper.textContent, inert: (wrapper.firstElementChild as HTMLElement).inert,
      hidden: controller.element.getAttribute('aria-hidden'), difference: Math.max(Math.abs(source.left - visual.left), Math.abs(source.top - visual.top), Math.abs(source.width - visual.width), Math.abs(source.height - visual.height)) };
  });
  expect(result).toMatchObject({ invariant: true, undo: false, outside: true, sourceText: 'TOKEN', visualText: 'Visual TOKEN / one', inert: true, hidden: 'true' });
  expect(result.difference).toBeLessThan(1);
});

test('geometry accounts for scaled containers and refreshes after real scroll/resize without model edits', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    editor.element.style.transform = 'scale(.8)';
    editor.element.style.transformOrigin = 'top left';
    window.inlineViewProbe.controller.refresh();
  });
  expect(await page.evaluate(() => {
    const node = window.editor.surface.querySelector('[data-mw-node]')!.getBoundingClientRect();
    const view = window.inlineViewProbe.controller.element.firstElementChild!.getBoundingClientRect();
    return Math.max(Math.abs(node.left - view.left), Math.abs(node.top - view.top), Math.abs(node.width - view.width), Math.abs(node.height - view.height));
  })).toBeLessThan(1);
  await page.setViewportSize({ width: 740, height: 600 });
  await expect.poll(() => page.evaluate(() => {
    const node = window.editor.surface.querySelector('[data-mw-node]')!.getBoundingClientRect();
    const view = window.inlineViewProbe.controller.element.firstElementChild!.getBoundingClientRect();
    return Math.abs(node.left - view.left) + Math.abs(node.top - view.top);
  })).toBeLessThan(1);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('pointer selection delegates to the actual atom, readonly/composition block actions and keyboard undo stays canonical', async ({ page }) => {
  const wrapper = page.locator('.mw-inline-node-view');
  await wrapper.click();
  expect(await page.evaluate(() => {
    const range = document.getSelection()!.getRangeAt(0);
    const atom = window.editor.surface.querySelector('[data-mw-node]')!;
    return range.cloneContents().textContent === atom.textContent && range.endOffset - range.startOffset === 1;
  })).toBe(true);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.inline-painted-token')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.inline-painted-token')).toHaveCount(1);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>A<span data-mw-node="demo:token" data-id="one">TOKEN</span>B</p>');
  const blocked = await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    editor.setSelection(0);
    editor.setReadOnly(true);
    const wrapper = window.inlineViewProbe.controller.element.firstElementChild!;
    wrapper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    const readonly = editor.getSelection();
    editor.setReadOnly(false);
    editor.setSelection(0);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    wrapper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    const composition = editor.getSelection();
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { readonly, composition };
  });
  expect(blocked).toEqual({ readonly: { index: 0, length: 0 }, composition: { index: 0, length: 0 } });
});

test('updates, replacement and destroy dispose only owned views and leave a retained element inert state restored', async ({ page }) => {
  expect(await page.evaluate(() => {
    const { editor, nodes } = window.sdkExtensions;
    const controller = window.inlineViewProbe.controller;
    const atom = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
    const view = controller.element.querySelector<HTMLElement>('.inline-painted-token')!;
    nodes.update(atom, { 'data-id': 'two' }, 'NEW');
    controller.refresh();
    const updated = view.textContent;
    editor.setHTML('<p>Replaced</p>');
    controller.refresh();
    const removed = window.sdkExtensions.destroyed;
    controller.destroy();
    controller.destroy();
    return { updated, removed, restored: !view.inert && view.style.pointerEvents === '', layer: controller.element.isConnected,
      html: editor.getHTML(), plugin: editor.getPlugin('sdk:inline-views:demo:token') };
  })).toEqual({ updated: 'Visual NEW / two', removed: 1, restored: true, layer: false, html: '<p>Replaced</p>', plugin: undefined });
});

test('unsupported owners, duplicate controllers and callback failures reject without writing the document', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createInlineNodeViews, nodeExtension } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const { editor } = window.sdkExtensions;
    const before = editor.getHTML();
    let duplicate = false, failure = false, editable = false;
    try { createInlineNodeViews(editor, { name: 'demo:token', create: () => ({ element: document.createElement('span') }) }); } catch { duplicate = true; }
    window.inlineViewProbe.controller.destroy();
    try { createInlineNodeViews(editor, { name: 'demo:token', create: () => { throw new Error('renderer failure'); } }); } catch { failure = true; }
    const host = document.createElement('div'); document.body.append(host);
    const second = window.createEditor(host, { value: '<p><span data-mw-node="demo:edit">Editable</span></p>', plugins: [nodeExtension({ name: 'demo:edit', kind: 'inline', tag: 'span', content: { type: 'text', maxLength: 64 } })] });
    try { createInlineNodeViews(second, { name: 'demo:edit', create: () => ({ element: document.createElement('span') }) }); } catch { editable = true; }
    second.destroy(); host.remove();
    return { duplicate, failure, editable, unchanged: editor.getHTML() === before, leftovers: editor.element.querySelectorAll('.mw-inline-node-views').length };
  });
  expect(result).toEqual({ duplicate: true, failure: true, editable: true, unchanged: true, leftovers: 0 });
});

test('malformed targets hide, moved layer ownership disposes and late refresh never paints inside surface', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    const controller = window.inlineViewProbe.controller;
    const atom = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
    atom.setAttribute('data-id', 'x'.repeat(100));
    controller.refresh();
    const malformed = controller.element.childElementCount;
    atom.setAttribute('data-id', 'one');
    controller.refresh();
    const rebound = controller.element.childElementCount;
    editor.surface.append(controller.element);
    controller.refresh();
    return { malformed, rebound, removed: !controller.element.isConnected, noViewDOM: !editor.surface.querySelector('.inline-painted-token'), source: editor.surface.textContent };
  });
  expect(result).toEqual({ malformed: 0, rebound: 1, removed: true, noViewDOM: true, source: 'ATOKENB' });
});

test('synchronous focus replacement never restores an obsolete visual target or document', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor } = window.sdkExtensions;
    const native = editor.focus;
    let called = false;
    editor.focus = () => { editor.focus = native; native(); called = true; editor.setHTML('<p>External</p>'); };
    window.inlineViewProbe.controller.element.firstElementChild!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    window.inlineViewProbe.controller.refresh();
    return { called, html: editor.getHTML(), undo: editor.canUndo(), views: window.inlineViewProbe.controller.element.childElementCount };
  });
  expect(result).toEqual({ called: true, html: '<p>External</p>', undo: false, views: 0 });
});

test('registered text-only block nodes share the overlay contract and preserve their own source', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/sdk.js';
    const { createInlineNodeViews, nodeExtension } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/sdk');
    const host = document.createElement('div'); document.body.append(host);
    const editor = window.createEditor(host, { value: '<figure data-mw-node="demo:block">Media reference</figure><p>Tail</p>',
      plugins: [nodeExtension({ name: 'demo:block', kind: 'block', tag: 'figure', content: { type: 'text', minLength: 1, maxLength: 64 } })] });
    const before = editor.getHTML();
    const controller = createInlineNodeViews(editor, { name: 'demo:block', create: () => { const element = document.createElement('div'); element.textContent = 'Visible card'; return { element }; } });
    const shape = { count: controller.element.childElementCount, visual: controller.element.textContent, source: editor.surface.querySelector('figure')?.textContent, stable: editor.getHTML() === before && !editor.canUndo() };
    editor.destroy();
    const removed = !controller.element.isConnected;
    host.remove();
    return { ...shape, removed };
  });
  expect(result).toEqual({ count: 1, visual: 'Visible card', source: 'Media reference', stable: true, removed: true });
});
