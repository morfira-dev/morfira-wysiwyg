import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { ContextualToolbarController } from '@morfira-dev/wysiwyg/ui/contextual';
import './contextual-toolbar.types.js';

const initialize = async (page: Page, value = '<p><strong>Bold</strong> plain</p>', custom = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, custom }) => {
    window.dispose();
    await Promise.all(['/packages/core/dist/style.css', '/packages/plugins/dist/ui/editor.css', '/packages/plugins/dist/ui/contextual.css'].map((href) => new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Unable to load ${href}`));
      document.head.append(link);
    })));
    const clip = document.createElement('div');
    clip.className = 'contextual-clip';
    clip.style.cssText = 'width:360px;max-width:calc(100vw - 32px);height:180px;overflow:auto;margin:100px 16px 40px';
    const editorHost = document.createElement('div');
    clip.append(editorHost);
    const tools = document.createElement('div');
    tools.className = 'contextual-host';
    const outside = document.createElement('input');
    outside.setAttribute('aria-label', 'Outside contextual');
    document.body.append(clip, tools, outside);
    window.changes = [];
    window.editor = window.createEditor(editorHost, { value, locale: 'en', onChange: (change) => window.changes.push(change) });
    const path = '/packages/plugins/dist/ui/contextual.js';
    const { createContextualToolbar } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual');
    window.contextualUI = createContextualToolbar(tools, window.editor, custom ? { groups: [['bold', {
      id: 'projected',
      label: (editor, range) => editor.getFormats(range).bold ? 'Projected bold' : 'Projected plain',
      enabled: (editor, range) => Boolean(range && editor.getFormats(range).bold),
      pressed: (editor, range) => Boolean(range && editor.getFormats(range).bold),
      run: (editor) => editor.format('underline', true),
    }]] } : {});
    window.dispose = () => { window.contextualUI.destroy(); window.editor.destroy(); clip.remove(); tools.remove(); outside.remove(); };
  }, { value, custom });
};
const toolbar = (page: Page) => page.locator('.contextual-host .mw-contextual-toolbar');
const action = (page: Page, id: string) => toolbar(page).locator(`[data-mw-ui-action="${id}"]`);
const select = async (page: Page, index = 0, length = 4) => {
  await page.evaluate(({ index, length }) => { window.editor.surface.focus(); window.editor.setSelection(index, length); }, { index, length });
};

test('automatic rich backward context preserves mixed state, native range and one formatting undo without taking focus', async ({ page }) => {
  const before = '<p><strong>Bold</strong> plain</p>';
  await initialize(page, before);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!.lastChild!, 6, root.querySelector('strong')!.firstChild!, 0);
    window.contextualUI.refresh();
  });
  await expect(toolbar(page)).toBeVisible();
  await expect(action(page, 'bold')).toHaveAttribute('aria-pressed', 'mixed');
  expect(await page.evaluate(() => ({ focused: document.activeElement === window.editor.surface, html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ focused: true, html: before, undo: false, changes: 0 });
  await action(page, 'bold').click();
  expect(await page.evaluate(() => window.editor.getFormats().bold)).toBe(true);
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['user']);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { html: window.editor.getHTML(), backward: selection.anchorNode === root.querySelector('p')!.lastChild && selection.anchorOffset === 6 && selection.focusNode === root.querySelector('strong')!.firstChild && selection.focusOffset === 0, undo: window.editor.canUndo() };
  })).toEqual({ html: before, backward: true, undo: false });
});

test('explicit range projection is side-effect-free and remembered shell state survives a lost native Selection', async ({ page }) => {
  await initialize(page, undefined, true);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    editor.setSelection(10);
    editor.format('italic', true);
    const selection = document.getSelection()!;
    const anchor = selection.anchorNode;
    const offset = selection.anchorOffset;
    const active = document.activeElement;
    const range = document.createRange();
    range.selectNodeContents(root.querySelector('strong')!);
    const projected = editor.getFormats(range);
    const foreign = document.createRange();
    foreign.selectNodeContents(document.createTextNode('Detached'));
    const detached = editor.getFormats(foreign);
    let malformed = false;
    try { editor.getFormats({} as Range); } catch { malformed = true; }
    return { bold: projected.bold, noPendingItalic: !projected.italic, nativeItalic: editor.getFormats().italic, detached, malformed, unchanged: selection.anchorNode === anchor && selection.anchorOffset === offset && document.activeElement === active, html: editor.getHTML(), undo: editor.canUndo() };
  })).toEqual({ bold: true, noPendingItalic: true, nativeItalic: true, detached: {}, malformed: true, unchanged: true, html: '<p><strong>Bold</strong> plain</p>', undo: false });
  await select(page);
  await expect(toolbar(page)).toBeVisible();
  await action(page, 'projected').focus();
  await page.evaluate(() => { document.getSelection()!.removeAllRanges(); window.contextualUI.refresh(); });
  await expect(toolbar(page)).toBeVisible();
  await expect(action(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(action(page, 'projected')).toHaveAccessibleName('Projected bold');
  await expect(action(page, 'projected')).toBeEnabled();
  await expect(action(page, 'projected')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.getSelection()!.rangeCount)).toBe(0);
  await action(page, 'projected').click();
  expect(await page.evaluate(() => window.editor.getFormats().underline)).toBe(true);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 4 });
});

test('Alt+F10 and Escape use exact selection and suppress queued reopening until a fresh selection or explicit shortcut', async ({ page }) => {
  await initialize(page);
  await select(page);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'bold')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(action(page, 'italic')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toolbar(page)).toBeHidden();
  expect(await page.evaluate(() => ({ focused: document.activeElement === window.editor.surface, selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ focused: true, selection: { index: 0, length: 4 }, undo: false });
  await page.evaluate(async () => {
    document.dispatchEvent(new Event('selectionchange'));
    window.contextualUI.refresh();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await expect(toolbar(page)).toBeHidden();
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'bold')).toBeFocused();
  await page.keyboard.press('Escape');
  await select(page, 0, 2);
  await expect(toolbar(page)).toBeVisible();
  await select(page, 2, 0);
  await page.keyboard.press('Alt+F10');
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 2);
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(async () => {
    window.editor.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true }));
    window.editor.setSelection(2);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    window.editor.setSelection(0, 2);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await expect(toolbar(page)).toBeVisible();
  expect(await page.evaluate(() => document.activeElement === window.editor.surface)).toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.editor.setSelection(2, 2); window.editor.setSelection(0, 2); });
  await expect(toolbar(page)).toBeVisible();
  await page.getByLabel('Outside contextual', { exact: true }).focus();
  await page.keyboard.press('Alt+F10');
  await expect(toolbar(page)).toBeHidden();
});

test('outside, read-only, composition and API replacement dismiss stale controls without resurrecting a selection', async ({ page }) => {
  await initialize(page);
  await select(page);
  await expect(toolbar(page)).toBeVisible();
  await page.getByLabel('Outside contextual', { exact: true }).click();
  await expect(toolbar(page)).toBeHidden();
  await expect(page.getByLabel('Outside contextual', { exact: true })).toBeFocused();
  await page.evaluate(() => window.contextualUI.refresh());
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 3);
  await expect(toolbar(page)).toBeVisible();
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    const button = window.contextualUI.element.querySelector<HTMLButtonElement>('[data-mw-ui-action="bold"]')!;
    document.querySelector<HTMLInputElement>('[aria-label="Outside contextual"]')!.focus();
    button.click();
    return { unchanged: window.editor.getHTML() === before, undo: window.editor.canUndo() };
  })).toEqual({ unchanged: true, undo: false });
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 4);
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(toolbar(page)).toBeHidden();
  await action(page, 'bold').dispatchEvent('click');
  await page.evaluate(() => { window.editor.setReadOnly(false); window.contextualUI.refresh(); });
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 2);
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(toolbar(page)).toBeHidden();
  await page.evaluate(() => { window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })); window.contextualUI.refresh(); });
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 4);
  await expect(toolbar(page)).toBeVisible();
  await action(page, 'bold').focus();
  await page.evaluate(() => window.editor.setHTML('<p>External</p>'));
  await expect(toolbar(page)).toBeHidden();
  await action(page, 'bold').dispatchEvent('click');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>External</p>', undo: false });
  await page.evaluate(() => window.contextualUI.refresh());
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 3);
  await expect(toolbar(page)).toBeVisible();
  await action(page, 'bold').focus();
  await page.evaluate(() => {
    window.editor.surface.addEventListener('focusin', () => window.editor.setHTML('<p>Focus replacement</p>'), { once: true });
    window.contextualUI.element.querySelector<HTMLButtonElement>('[data-mw-ui-action="bold"]')!.click();
  });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>Focus replacement</p>', undo: false });
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 4);
  await expect(toolbar(page)).toBeVisible();
  await page.getByLabel('Outside contextual', { exact: true }).focus();
  await page.evaluate(async () => {
    const host = window.contextualUI.element.parentElement!;
    window.contextualUI.destroy();
    const path = '/packages/plugins/dist/ui/contextual.js';
    const { createContextualToolbar } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual');
    window.contextualUI = createContextualToolbar(host, window.editor);
  });
  await expect(toolbar(page)).toBeHidden();
  await select(page, 0, 4);
  await expect(toolbar(page)).toBeVisible();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>Focus replacement</p>', undo: false });
});

test('collapsed, root, nontext, semantic and foreign selection shapes never show mutating context UI', async ({ page }) => {
  await initialize(page, '<p>Text</p><p><img src="/logo.svg" alt="Local"><br></p>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    const selection = document.getSelection()!;
    const panel = window.contextualUI.element;
    const hidden: boolean[] = [];
    const inspect = (range: Range): void => {
      root.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      window.contextualUI.refresh();
      hidden.push(panel.hidden || getComputedStyle(panel).display === 'none');
    };
    const caret = document.createRange();
    caret.setStart(root.querySelector('p')!.firstChild!, 1);
    caret.collapse(true);
    inspect(caret);
    const rootRange = document.createRange();
    rootRange.setStart(root, 0);
    rootRange.setEnd(root, 1);
    inspect(rootRange);
    const image = document.createRange();
    image.selectNode(root.querySelector('img')!);
    inspect(image);
    const line = document.createRange();
    line.selectNode(root.querySelector('br')!);
    inspect(line);
    const paragraph = root.querySelector('p')!;
    paragraph.setAttribute('data-mw-node', 'app:semantic');
    const semantic = document.createRange();
    semantic.selectNodeContents(paragraph.firstChild!);
    inspect(semantic);
    paragraph.removeAttribute('data-mw-node');
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    foreign.textContent = 'Foreign';
    paragraph.append(foreign);
    const foreignRange = document.createRange();
    foreignRange.selectNodeContents(foreign.firstChild!);
    inspect(foreignRange);
    foreign.remove();
    return { hidden, undo: editor.canUndo(), changes: window.changes.length };
  })).toEqual({ hidden: Array(6).fill(true), undo: false, changes: 0 });
});

test('viewport clamping, clipping scroll and queued geometry cleanup leave content and selection untouched', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 500 });
  await initialize(page, '<p>Selected text</p><p style="height: 400px">Spacer</p>');
  await page.evaluate(() => {
    const clip = document.querySelector<HTMLElement>('.contextual-clip')!;
    clip.style.margin = '0';
    clip.style.height = '90px';
    const root = window.editor.surface;
    root.style.padding = '0';
    root.style.minHeight = '0';
    (root.querySelector('p') as HTMLElement).style.margin = '0';
  });
  await select(page, 0, 8);
  await expect(toolbar(page)).toBeVisible();
  const box = await toolbar(page).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(500);
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }));
  await page.locator('.contextual-clip').evaluate((node) => { node.scrollTop = 250; node.dispatchEvent(new Event('scroll')); });
  await expect(toolbar(page)).toBeHidden();
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual(before.selection);
  await page.locator('.contextual-clip').evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await expect(toolbar(page)).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.overflowY = 'scroll';
    document.body.style.minHeight = '2000px';
    document.querySelector<HTMLElement>('.contextual-clip')!.style.marginTop = '1100px';
    window.scrollTo(0, 1050);
  });
  await expect(toolbar(page)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY > innerHeight)).toBe(true);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('.contextual-clip')!.style.marginTop = '20px';
    window.editor.setHTML('<pre>Selected text\nline two\nline three\nline four\nline five</pre><p>Keep</p>');
    const pre = window.editor.surface.querySelector('pre')!;
    pre.style.height = '25px';
    pre.style.overflow = 'auto';
    pre.style.margin = '0';
  });
  await select(page, 0, 8);
  await expect(toolbar(page)).toBeVisible();
  await page.locator('.contextual-clip .mw-content pre').evaluate((node) => { node.scrollTop = 200; node.dispatchEvent(new Event('scroll')); });
  await expect(toolbar(page)).toBeHidden();
  await page.locator('.contextual-clip .mw-content pre').evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await expect(toolbar(page)).toBeVisible();
  const afterGeometry = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const host = window.contextualUI.element.parentElement!;
    window.dispatchEvent(new Event('resize'));
    window.contextualUI.destroy();
    window.contextualUI.destroy();
    return { empty: host.childNodes.length === 0, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ empty: true, html: afterGeometry, undo: false });
  await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  await expect(page.locator('.contextual-host')).toBeEmpty();
});

test('instances isolate ranges, shortcuts and lifecycle while malformed setup leaves accepted hosts empty', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/contextual.js';
    const { createContextualToolbar } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual');
    const invalid = [{ gap: -1 }, { gap: NaN }, { gap: 33 }, { gap: Infinity }, { gap: null }, { groups: null }, { extra: true }, { groups: [] }];
    const rejected = invalid.map((options) => {
      const host = document.createElement('div');
      document.body.append(host);
      let failed = false;
      try { createContextualToolbar(host, window.editor, options as never); } catch { failed = true; }
      const clean = !host.childNodes.length;
      host.remove();
      return failed && clean;
    });
    const nonempty = document.createElement('div');
    const marker = document.createElement('span');
    marker.textContent = 'Application node';
    nonempty.append(marker);
    document.body.append(nonempty);
    const inside = document.createElement('div');
    window.editor.surface.append(inside);
    const foreign = document.implementation.createHTMLDocument('Foreign');
    const foreignHost = foreign.createElement('div');
    foreign.body.append(foreignHost);
    const hostRejected = [nonempty, inside, foreignHost, document.createElement('div')].map((host) => {
      const before = host.innerHTML;
      try { createContextualToolbar(host, window.editor); return false; }
      catch { return before === host.innerHTML; }
    });
    const sameApplicationNode = nonempty.firstChild === marker;
    nonempty.remove();
    inside.remove();
    const failedHost = document.createElement('div');
    document.body.append(failedHost);
    const beforeError = window.editor.getHTML();
    const errors: unknown[] = [];
    const failedUI = createContextualToolbar(failedHost, window.editor, { onError: (error) => errors.push(error), groups: [[{ id: 'fail', label: () => { throw new Error('Reader setup failed'); }, run: () => {} }]] });
    const safeError = errors.some((error) => error instanceof Error && error.message === 'Reader setup failed')
      && Boolean(failedUI.element.querySelector<HTMLButtonElement>('[data-mw-ui-action="fail"]')?.disabled)
      && failedUI.element.querySelector('.mw-ui-status')?.textContent === 'Unable to apply this action. Check the selection and try again.';
    failedUI.destroy();
    const errorCleanup = failedHost.childNodes.length === 0 && window.editor.getHTML() === beforeError && !window.editor.canUndo();
    failedHost.remove();
    const editorHost = document.createElement('div');
    const tools = document.createElement('div');
    tools.className = 'contextual-second';
    document.body.append(editorHost, tools);
    const second = window.createEditor(editorHost, { value: '<p>Second editor</p>', locale: 'en' });
    const ui = createContextualToolbar(tools, second);
    window.editor.providePlugin('contextual-second-editor', second);
    window.editor.providePlugin('contextual-second-ui', ui);
    return { rejected, hostRejected, sameApplicationNode, safeError, errorCleanup };
  })).toEqual({ rejected: Array(8).fill(true), hostRejected: Array(4).fill(true), sameApplicationNode: true, safeError: true, errorCleanup: true });
  await select(page);
  await expect(toolbar(page)).toBeVisible();
  await expect(page.locator('.contextual-second .mw-contextual-toolbar')).toBeHidden();
  await page.evaluate(() => window.editor.getPlugin<Editor>('contextual-second-editor')!.setSelection(0, 6));
  await expect(page.locator('.contextual-second .mw-contextual-toolbar')).toBeVisible();
  await expect(toolbar(page)).toBeHidden();
  await page.keyboard.press('Alt+F10');
  await expect(page.locator('.contextual-second [data-mw-ui-action="bold"]')).toBeFocused();
  expect(await page.evaluate(() => {
    const second = window.editor.getPlugin<Editor>('contextual-second-editor')!;
    const ui = window.editor.getPlugin<ContextualToolbarController>('contextual-second-ui')!;
    const button = ui.element.querySelector<HTMLButtonElement>('[data-mw-ui-action="bold"]')!;
    second.destroy();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    let stale = false;
    try { ui.refresh(); } catch { stale = true; }
    return { stale, empty: document.querySelector('.contextual-second')!.childNodes.length === 0, first: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ stale: true, empty: true, first: '<p><strong>Bold</strong> plain</p>', undo: false });
});

test('contextual public imports and localized catalogs are SSR-safe without DOM, global registration or network', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    for (const key of ['document', 'window', 'customElements']) Object.defineProperty(globalThis, key, { get: () => { throw new Error('DOM accessed'); } });
    globalThis.fetch = () => { throw new Error('Network accessed'); };
    const { createContextualToolbar, contextualToolbarMessages } = await import('@morfira-dev/wysiwyg/ui/contextual');
    console.log(JSON.stringify({ factory: typeof createContextualToolbar, locales: Object.keys(contextualToolbarMessages).sort() }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual({ factory: 'function', locales: ['en', 'ru'] });
});
