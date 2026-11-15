import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { EditorUIController, EditorUIOptions } from '@morfira-dev/wysiwyg/ui/editor';

const mount = async (page: Page, options: { hidden?: boolean; wrap?: boolean } = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ hidden, wrap }) => {
    window.dispose();
    const host = document.createElement('div');
    const tools = document.createElement('div');
    tools.className = 'overflow-host';
    tools.style.width = '270px';
    tools.hidden = Boolean(hidden);
    const outside = document.createElement('input');
    outside.setAttribute('aria-label', 'Outside overflow');
    const outsideAction = document.createElement('button');
    outsideAction.type = 'button';
    outsideAction.setAttribute('aria-label', 'Outside action');
    outsideAction.dataset.activations = '0';
    outsideAction.textContent = 'Outside action: 0';
    outsideAction.style.display = 'block';
    outsideAction.style.minHeight = '36px';
    outsideAction.addEventListener('click', () => {
      const activations = Number(outsideAction.dataset.activations) + 1;
      outsideAction.dataset.activations = String(activations);
      outsideAction.textContent = `Outside action: ${activations}`;
    });
    document.body.append(host, tools, outside, outsideAction);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/packages/plugins/dist/ui/editor.css';
    const dimensions = document.createElement('style');
    dimensions.textContent = '.overflow-host .mw-ui-group { width:90px !important; flex:0 0 90px !important; padding:0 !important; border:0 !important; } .overflow-host .mw-ui-select { width:80px; }';
    document.head.append(css, dimensions);
    window.changes = [];
    window.editor = window.createEditor(host, { value: '<p>A<em>word</em>Z</p>', locale: 'en', onChange: (change) => window.changes.push(change) });
    window.editor.setSelection(1, 4);
    const path = '/packages/plugins/dist/ui/editor.js';
    const { createEditorUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/editor');
    const ui = createEditorUI(tools, window.editor, { groups: [['bold'], ['italic'], ['block']], groupPriorities: [10, 0, 0], ...(wrap ? {} : { overflow: 'more' }) });
    window.editor.providePlugin('overflow-ui', ui);
    window.dispose = () => {
      ui.destroy();
      window.editor.destroy();
      host.remove();
      tools.remove();
      outside.remove();
      outsideAction.remove();
      css.remove();
      dimensions.remove();
    };
  }, options);
};
const host = (page: Page) => page.locator('.overflow-host').first();
const more = (page: Page) => host(page).locator('[data-mw-ui-more]');
const region = (page: Page) => host(page).locator('.mw-ui-overflow');
const visibleGroups = (page: Page) => host(page).locator('.mw-editor-toolbar > .mw-ui-group');
const resize = async (page: Page, width: number) => {
  await host(page).evaluate((node, width) => { (node as HTMLElement).style.width = `${width}px`; }, width);
};

test('measured priorities move whole controls, keep tie order and recover a hidden host while wrap remains the default', async ({ page }) => {
  await mount(page, { hidden: true });
  const select = await host(page).locator('[data-mw-ui-action="block"]').elementHandle();
  await host(page).evaluate((node) => { (node as HTMLElement).hidden = false; });
  await expect(more(page)).toBeVisible();
  await expect(visibleGroups(page)).toHaveCount(2);
  await expect(region(page).locator('[data-mw-ui-action="block"]')).toHaveCount(1);
  await expect(visibleGroups(page).nth(0).locator('button')).toHaveAttribute('data-mw-ui-action', 'bold');
  await expect(visibleGroups(page).nth(1).locator('button')).toHaveAttribute('data-mw-ui-action', 'italic');
  await resize(page, 180);
  await expect(visibleGroups(page)).toHaveCount(1);
  await expect(region(page).locator('.mw-ui-group')).toHaveCount(2);
  await resize(page, 1000);
  await expect(visibleGroups(page)).toHaveCount(3);
  await expect(more(page)).toBeHidden();
  expect(await select!.evaluate((node) => node === document.querySelector('.overflow-host [data-mw-ui-action="block"]'))).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: '<p>A<em>word</em>Z</p>', undo: false, changes: 0 });
  await mount(page, { wrap: true });
  await expect(visibleGroups(page)).toHaveCount(3);
  await expect(more(page)).toBeHidden();
});

test('keyboard More preserves a rich backward range and native selector keys with one formatting undo', async ({ page }) => {
  await mount(page);
  await resize(page, 180);
  await expect(visibleGroups(page)).toHaveCount(1);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('em')!.firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(text, 4, text, 0);
  });
  await more(page).focus();
  await page.keyboard.press('Enter');
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
  const italic = region(page).getByRole('button', { name: 'Italic', exact: true });
  await expect(italic).toBeFocused();
  const select = region(page).getByLabel('Block format', { exact: true });
  await select.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(select).toBeFocused();
  await italic.focus();
  await page.keyboard.press('Enter');
  await expect(region(page)).toBeHidden();
  await expect(page.locator('.mw-content')).toBeFocused();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AwordZ</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const text = window.editor.surface.querySelector('em')!.firstChild;
    return { html: window.editor.getHTML(), backward: selection.anchorNode === text && selection.focusNode === text && selection.anchorOffset === 4 && selection.focusOffset === 0, undo: window.editor.canUndo() };
  })).toEqual({ html: '<p>A<em>word</em>Z</p>', backward: true, undo: false });
});

test('responsive layout pins a focused group and dismissal leaves no closed-region Tab stops', async ({ page }) => {
  await mount(page);
  await resize(page, 1000);
  await expect(visibleGroups(page)).toHaveCount(3);
  const block = host(page).getByLabel('Block format', { exact: true });
  await block.focus();
  await resize(page, 180);
  await page.evaluate(() => window.editor.getPlugin<EditorUIController>('overflow-ui')!.refresh());
  await expect(block).toBeFocused();
  expect(await block.evaluate((node) => Boolean(node.closest('.mw-editor-toolbar')))).toBe(true);
  await page.getByLabel('Outside overflow', { exact: true }).focus();
  await expect(region(page).locator('[data-mw-ui-action="block"]')).toHaveCount(1);
  await more(page).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(more(page)).toBeFocused();
  await expect(region(page)).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Outside overflow', { exact: true })).toBeFocused();
  await more(page).click();
  await expect(region(page)).toBeVisible();
  await page.getByLabel('Outside overflow', { exact: true }).click();
  await expect(region(page)).toBeHidden();
  await expect(page.getByLabel('Outside overflow', { exact: true })).toBeFocused();
  await page.setViewportSize({ width: 430, height: 500 });
  await more(page).click();
  await expect(region(page)).toBeVisible();
  const outsideAction = page.getByRole('button', { name: 'Outside action', exact: true });
  await outsideAction.focus();
  // Collapsing the in-flow region during pointerdown can move this physical
  // target before mouseup and swallow its actual click handler.
  await outsideAction.click();
  await expect(outsideAction).toHaveAttribute('data-activations', '1');
  // Native button clicks can clear focus in WebKit; dismissal must not steal
  // the browser's resulting focus back into the owned editor UI.
  expect(await host(page).evaluate((node) => node.contains(document.activeElement))).toBe(false);
  await expect(region(page)).toBeHidden();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>A<em>word</em>Z</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('ready overflow localizes guards and hands focus to a link form without restoring an obsolete API target', async ({ page }) => {
  await mount(page);
  await page.evaluate(async () => {
    window.editor.getPlugin<EditorUIController>('overflow-ui')!.destroy();
    window.editor.destroy();
    const presetPath = '/packages/plugins/dist/presets/standard.js';
    const uiPath = '/packages/plugins/dist/ui/standard.js';
    const { createStandardPreset } = await import(/* @vite-ignore */ presetPath) as typeof import('@morfira-dev/wysiwyg/presets/standard');
    const { createStandardEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/standard');
    const target = document.createElement('div');
    document.body.append(target);
    const tools = document.querySelector<HTMLElement>('.overflow-host')!;
    tools.style.width = '180px';
    window.editor = window.createEditor(target, createStandardPreset({ value: '<p>word</p>', locale: 'en' }));
    window.editor.setSelection(0, 4);
    const ui = createStandardEditorUI(tools, window.editor, { overflow: 'more' });
    window.editor.providePlugin('overflow-ui', ui);
    window.dispose = () => { ui.destroy(); window.editor.destroy(); };
  });
  await expect(more(page)).toHaveAccessibleName('More');
  await more(page).click();
  const link = region(page).locator('[data-mw-ui-action="link"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(region(page)).toBeHidden();
  await expect(host(page).getByLabel('Link URL', { exact: true })).toBeFocused();
  await host(page).getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(more(page)).toHaveAccessibleName('Ещё');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await more(page).click();
  await region(page).locator('[data-mw-ui-action="link"]').click();
  await expect(host(page).getByRole('button', { name: 'Создать ссылку', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>word</p>', undo: false });
  await host(page).getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  if (await more(page).getAttribute('aria-expanded') !== 'true') await more(page).click();
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.setSelection(0, 4);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await expect(region(page).locator('[data-mw-ui-action="link"]')).toBeDisabled();
  // Keep focus outside while replacing the document so the UI cannot capture
  // a fresh native editor caret and mistake it for the obsolete remembered one.
  await page.getByLabel('Outside overflow', { exact: true }).focus();
  await page.evaluate(() => window.editor.setHTML('<p>External</p>'));
  await region(page).locator('[data-mw-ui-action="link"]').dispatchEvent('click');
  await expect(host(page).locator('.mw-ui-panel')).toBeHidden();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>External</p>', undo: false });
  await page.evaluate(() => window.editor.setSelection(0, 8));
  if (await more(page).getAttribute('aria-expanded') !== 'true') await more(page).click();
  await region(page).locator('[data-mw-ui-action="link"]').click();
  await expect(host(page).getByLabel('Адрес ссылки', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('two instances own disclosure IDs and destroying queued layout leaves detached controls inert', async ({ page }) => {
  await mount(page);
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/editor.js';
    const { createEditorUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/editor');
    const editorHost = document.createElement('div');
    const tools = document.createElement('div');
    tools.className = 'overflow-host';
    tools.style.width = '180px';
    document.body.append(editorHost, tools);
    const second = window.createEditor(editorHost, { value: '<p>Second</p>', locale: 'en' });
    const ui = createEditorUI(tools, second, { groups: [['bold'], ['italic'], ['block']], overflow: 'more' });
    window.editor.providePlugin('overflow-second', second);
    window.editor.providePlugin('overflow-second-ui', ui);
  });
  const secondHost = page.locator('.overflow-host').nth(1);
  await expect(secondHost.locator('[data-mw-ui-more]')).toBeVisible();
  const firstID = await more(page).getAttribute('aria-controls');
  expect(await secondHost.locator('[data-mw-ui-more]').getAttribute('aria-controls')).not.toBe(firstID);
  await more(page).click();
  await expect(secondHost.locator('.mw-ui-overflow')).toBeHidden();
  expect(await page.evaluate(() => {
    const ui = window.editor.getPlugin<EditorUIController>('overflow-ui')!;
    const detached = ui.element.querySelector<HTMLButtonElement>('[data-mw-ui-more]')!;
    const tools = ui.element.parentElement!;
    tools.style.width = '1000px';
    ui.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const expanded = detached.getAttribute('aria-expanded');
    ui.destroy();
    ui.destroy();
    detached.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    let stale = false;
    try { ui.refresh(); } catch { stale = true; }
    return { stale, inert: detached.getAttribute('aria-expanded') === expanded, removed: tools.childNodes.length === 0, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ stale: true, inert: true, removed: true, html: '<p>A<em>word</em>Z</p>', undo: false });
  await page.evaluate(() => window.editor.getPlugin<EditorUIController>('overflow-second-ui')!.refresh());
  await secondHost.locator('[data-mw-ui-more]').click();
  await expect(secondHost.locator('.mw-ui-overflow')).toBeVisible();
  await expect(host(page)).toBeEmpty();
  await page.evaluate(() => {
    window.editor.getPlugin<EditorUIController>('overflow-second-ui')!.destroy();
    window.editor.getPlugin<Editor>('overflow-second')!.destroy();
  });
});

test('malformed overflow configuration rejects before mounting while explicit refresh works without ResizeObserver', async ({ page }) => {
  await mount(page);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/editor.js';
    const { createEditorUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/editor');
    const options: unknown[] = [{ overflow: 'menu' }, { groupPriorities: [1] }, { groupPriorities: [0, NaN] }, { groupPriorities: [0, Infinity] }];
    return options.map((input) => {
      const target = document.createElement('div');
      document.body.append(target);
      let rejected = false;
      try { createEditorUI(target, window.editor, { groups: [['bold'], ['italic']], ...(input as EditorUIOptions) }); }
      catch { rejected = true; }
      const result = { rejected, empty: target.childNodes.length === 0 };
      target.remove();
      return result;
    });
  })).toEqual(Array.from({ length: 4 }, () => ({ rejected: true, empty: true })));
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/editor.js';
    const { createEditorUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/editor');
    const target = document.createElement('div');
    document.body.append(target);
    const captured = { button: undefined as HTMLButtonElement | undefined };
    const descriptor = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
    let rejected = false;
    try {
      class FailingResizeObserver {
        observe = (node: Element): void => {
          captured.button = node.parentElement?.querySelector<HTMLButtonElement>('[data-mw-ui-more]') ?? undefined;
          throw new Error('Resize observer setup failed');
        };
        disconnect = (): void => {};
        unobserve = (): void => {};
      }
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: FailingResizeObserver });
      try { createEditorUI(target, window.editor, { groups: [['bold'], ['italic']], overflow: 'more' }); }
      catch (error) { rejected = error instanceof Error && error.message === 'Resize observer setup failed'; }
    }
    finally {
      if (descriptor) Object.defineProperty(window, 'ResizeObserver', descriptor);
      else Reflect.deleteProperty(window, 'ResizeObserver');
    }
    const detached = captured.button;
    if (!detached) throw new Error('The setup failure did not reach observer attachment.');
    // Exercise the stale handler independently of its initial hidden state.
    detached.hidden = false;
    detached.setAttribute('aria-expanded', 'false');
    detached.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const result = { rejected, empty: target.childNodes.length === 0, inert: detached.getAttribute('aria-expanded') === 'false', undo: window.editor.canUndo() };
    target.remove();
    return result;
  })).toEqual({ rejected: true, empty: true, inert: true, undo: false });
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/editor.js';
    const { createEditorUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/editor');
    window.editor.getPlugin<EditorUIController>('overflow-ui')!.destroy();
    const descriptor = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
    try {
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: undefined });
      const ui = createEditorUI(document.querySelector<HTMLElement>('.overflow-host')!, window.editor, { groups: [['bold'], ['italic'], ['block']], overflow: 'more' });
      window.editor.providePlugin('overflow-fallback', ui);
    }
    finally {
      if (descriptor) Object.defineProperty(window, 'ResizeObserver', descriptor);
      else Reflect.deleteProperty(window, 'ResizeObserver');
    }
  });
  await resize(page, 180);
  await page.evaluate(() => window.editor.getPlugin<EditorUIController>('overflow-fallback')!.refresh());
  await expect(more(page)).toBeVisible();
  await expect(visibleGroups(page)).toHaveCount(1);
  await page.evaluate(() => window.editor.getPlugin<EditorUIController>('overflow-fallback')!.destroy());
});
