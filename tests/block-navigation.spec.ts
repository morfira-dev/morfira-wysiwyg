import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './block-navigation.types.js';

const initialize = async (page: Page, value = '<p>Before</p><hr><p>After</p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    const path = '/packages/plugins/dist/block-navigation.js';
    const module = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/block-navigation');
    const mount = document.createElement('div');
    mount.className = 'block-navigation-test';
    document.body.prepend(mount);
    const plugin = module.blockNavigation();
    let disposePlugin = () => {};
    window.changes = [];
    window.editor = window.createEditor(mount, {
      value,
      schema: [{ name: 'test:card', kind: 'block', tag: 'figure', content: { type: 'text', minLength: 1, maxLength: 80 } }],
      plugins: [{ ...plugin, setup: (editor) => { const dispose = plugin.setup(editor); disposePlugin = typeof dispose === 'function' ? dispose : () => {}; return disposePlugin; } }],
      onChange: (change) => window.changes.push(change),
    });
    window.blockNavigationProbe = { commands: module.blockNavigationCommands(window.editor), disposePlugin };
    window.dispose = () => { window.editor.destroy(); mount.remove(); };
    window.editor.focus();
  }, value);
};
const edge = (page: Page, selector: string, end = false) => page.evaluate(({ selector, end }) => {
  window.editor.focus();
  const node = window.editor.surface.querySelector(selector)!;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(!end);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}, { selector, end });
const selected = (page: Page) => page.evaluate(() => window.blockNavigationProbe.commands.getSelected()?.localName ?? null);
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const surface = (page: Page) => page.locator('.block-navigation-test .mw-content');

test('arrows select objects and leave exact gaps without changing document/history', async ({ page }) => {
  await initialize(page, '<p>Before</p><hr><figure><img src="/logo.svg" alt="Logo"><figcaption>Caption</figcaption></figure><p>After</p>');
  const before = await html(page);
  await edge(page, 'p', true);
  await page.keyboard.press('ArrowRight');
  expect(await selected(page)).toBe('hr');
  await page.keyboard.press('ArrowRight');
  expect(await selected(page)).toBeNull();
  await page.keyboard.press('ArrowRight');
  expect(await selected(page)).toBe('figure');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('X');
  await expect(surface(page).locator('p').last()).toHaveText('XAfter');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('deletion is two-step, preserves actual siblings, and restores selected object on undo', async ({ page }) => {
  await initialize(page);
  await edge(page, 'p:last-child');
  await page.evaluate(() => { window.blockNavigationProbe.neighbour = window.editor.surface.firstElementChild as HTMLElement; });
  await page.keyboard.press('Backspace');
  expect(await selected(page)).toBe('hr');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.keyboard.press('Delete');
  await expect(surface(page).locator('hr')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.surface.firstElementChild === window.blockNavigationProbe.neighbour)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await selected(page)).toBe('hr');
  await page.evaluate(() => window.editor.redo());
  await expect(surface(page).locator('p')).toHaveText(['Before', 'After']);
});

test('Enter creates a paragraph between adjacent objects and typing survives one-step undo', async ({ page }) => {
  await initialize(page, '<hr><hr>');
  await page.evaluate(() => window.blockNavigationProbe.commands.select(window.editor.surface.firstElementChild as HTMLElement));
  await page.keyboard.press('Enter');
  await expect(surface(page).locator(':scope > *')).toHaveCount(3);
  await page.keyboard.type('Between');
  await expect(surface(page).locator('p')).toHaveText('Between');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe('<hr><hr>');
  await page.evaluate(() => window.editor.redo());
  await expect(surface(page).locator('p')).toHaveCount(1);
});

test('Shift+Enter inserts before the first object and root-gap text is literal', async ({ page }) => {
  await initialize(page, '<hr><hr>');
  await page.evaluate(() => window.blockNavigationProbe.commands.select(window.editor.surface.firstElementChild as HTMLElement));
  await page.keyboard.press('Shift+Enter');
  await expect(surface(page).locator(':scope > :first-child')).toHaveJSProperty('localName', 'p');
  await page.evaluate(() => window.editor.undo());
  await page.evaluate(() => {
    const range = document.createRange();
    range.setStart(window.editor.surface, 1);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '<safe>' }));
  });
  expect(await html(page)).toBe('<hr><p>&lt;safe&gt;</p><hr>');
  await page.keyboard.type('!');
  await expect(surface(page).locator('p')).toHaveText('<safe>!');
});

test('registered semantic cards support selection, replacement and sole-object deletion', async ({ page }) => {
  await initialize(page, '<figure data-mw-node="test:card">Card</figure>');
  expect(await html(page)).toBe('<figure data-mw-node="test:card">Card</figure><p><br></p>');
  await page.evaluate(() => { window.blockNavigationProbe.neighbour = window.editor.surface.lastElementChild as HTMLElement; });
  expect(await page.evaluate(() => window.blockNavigationProbe.commands.select(window.editor.surface.firstElementChild as HTMLElement))).toBe(true);
  await page.keyboard.type('Replacement');
  await expect(surface(page).locator('figure')).toHaveCount(0);
  expect(await html(page)).toBe('<p>Replacement</p><p><br></p>');
  expect(await page.evaluate(() => window.editor.surface.lastElementChild === window.blockNavigationProbe.neighbour)).toBe(true);
  await page.evaluate(() => window.editor.setHTML('<hr>'));
  await page.evaluate(() => window.blockNavigationProbe.commands.select(window.editor.surface.firstElementChild as HTMLElement));
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe('<p><br></p>');
  await page.keyboard.type('Next');
  await expect(surface(page).locator('p')).toHaveText('Next');
});

test('nested, complex, foreign and unregistered objects refuse the public selection command', async ({ page }) => {
  await initialize(page, '<ul><li><figure><img src="/logo.svg"></figure></li></ul><table><tbody><tr><td>A</td></tr></tbody></table><p>Text</p>');
  expect(await page.evaluate(() => {
    const api = window.blockNavigationProbe.commands;
    const root = window.editor.surface;
    const nested = api.select(root.querySelector('figure')!);
    const table = api.select(root.querySelector('table')!);
    const leaf = api.select(root.querySelector('p')!);
    const foreign = document.createElement('hr');
    const foreignResult = api.select(foreign);
    const semantic = document.createElement('figure'); semantic.setAttribute('data-mw-node', 'unknown:card'); semantic.textContent = 'Unknown'; root.append(semantic);
    const unknownResult = api.select(semantic); semantic.remove();
    return { nested, table, leaf, foreignResult, unknownResult };
  })).toEqual({ nested: false, table: false, leaf: false, foreignResult: false, unknownResult: false });
});

test('read-only, composition, cancellation and disposal prevent plugin edits', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const api = window.blockNavigationProbe.commands;
    api.select(root.querySelector('hr')!);
    const canceled = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete' }); canceled.preventDefault(); root.dispatchEvent(canceled);
    window.editor.setReadOnly(true);
    const readOnly = api.insertParagraph();
    window.editor.setReadOnly(false);
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.insertParagraph();
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    window.blockNavigationProbe.disposePlugin();
    const disposed = api.select(root.querySelector('hr')!);
    return { readOnly, composing, disposed };
  })).toEqual({ readOnly: false, composing: false, disposed: false });
  expect(await html(page)).toBe(before);
});

test('synchronous focus hooks replacing content or selection cannot redirect a paragraph command', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const api = window.blockNavigationProbe.commands;
    api.select(root.querySelector('hr')!);
    const nativeFocus = root.focus.bind(root);
    let replacementFocused = false;
    let movementFocused = false;
    // Keep a valid native editor selection: WebKit clears it on blur. This hook
    // exercises synchronous application reentrancy at the real focus-method call.
    root.focus = (options) => {
      root.focus = nativeFocus;
      nativeFocus(options);
      replacementFocused = true;
      window.editor.setHTML('<p>External</p><hr>');
    };
    const replaced = api.insertParagraph();
    const replacementHTML = window.editor.getHTML();
    api.select(root.querySelector('hr')!);
    root.focus = (options) => {
      root.focus = nativeFocus;
      nativeFocus(options);
      movementFocused = true;
      window.editor.setSelection(0);
    };
    const moved = api.insertParagraph();
    return { replaced, moved, replacementFocused, movementFocused, replacementHTML, finalHTML: window.editor.getHTML(), canUndo: window.editor.canUndo() };
  })).toEqual({ replaced: false, moved: false, replacementFocused: true, movementFocused: true, replacementHTML: '<p>External</p><hr>', finalHTML: '<p>External</p><hr>', canUndo: false });
});

test('a root-gap command expires on identical-point replacement in a focus hook', async ({ page }) => {
  await initialize(page, '<hr><hr>');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const gap = () => {
      const range = document.createRange(); range.setStart(root, 1); range.collapse(true);
      const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    };
    gap();
    const nativeFocus = root.focus.bind(root);
    let focused = false;
    root.focus = (options) => {
      root.focus = nativeFocus;
      nativeFocus(options);
      focused = true;
      root.innerHTML = '<hr><hr>';
      gap();
    };
    const result = window.blockNavigationProbe.commands.insertParagraph();
    return { result, focused, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ result: false, focused: true, html: '<hr><hr>', undo: false });
});

test('deletion rechecks a retained target position after a focus hook inserts a preceding sibling', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const target = root.querySelector('hr')!;
    window.blockNavigationProbe.commands.select(target);
    const nativeFocus = root.focus.bind(root);
    let focused = false;
    root.focus = (options) => {
      root.focus = nativeFocus;
      nativeFocus(options);
      focused = true;
      const paragraph = document.createElement('p');
      paragraph.textContent = 'New sibling';
      root.prepend(paragraph);
    };
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    return { focused, html: window.editor.getHTML(), offset: document.getSelection()?.anchorOffset, owner: document.getSelection()?.anchorNode === root };
  })).toEqual({ focused: true, html: '<p>New sibling</p><p>Before</p><p>After</p>', offset: 2, owner: true });
});

test('external replacement cancels composition and re-enables owned navigation without a trailing compositionend', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const blocked = window.blockNavigationProbe.commands.select(root.querySelector('hr')!);
    window.editor.setHTML('<hr><p>External</p>');
    const selected = window.blockNavigationProbe.commands.select(root.querySelector('hr')!);
    const inserted = window.blockNavigationProbe.commands.insertParagraph('after');
    return { blocked, selected, inserted, html: window.editor.getHTML() };
  })).toEqual({ blocked: false, selected: true, inserted: true, html: '<hr><p><br></p><p>External</p>' });
});
