import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './contextual-link.types.js';

const rich = '<p>Before <a href="/contextual-link-destination" title="Original"><em>Label</em><strong> text</strong><img src="/logo.svg" alt="Linked image"></a> after</p>';
const replacement = '<p><a href="/replacement">Replacement</a></p>';
const panel = (page: Page) => page.locator('.link-context-host .mw-contextual-link');
const action = (page: Page, name: 'open' | 'edit' | 'remove') => panel(page).locator('[data-mw-link-action="' + name + '"]');
const form = (page: Page) => panel(page).getByRole('form');

const initialize = async (page: Page, value = rich) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    await Promise.all(['core/dist/style.css', 'plugins/dist/ui/forms.css', 'plugins/dist/ui/contextual-link.css'].map((path) => new Promise<void>((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/packages/' + path;
      css.onload = () => resolve();
      css.onerror = () => reject(new Error('Could not load ' + path));
      document.head.append(css);
    })));
    const mount = document.createElement('div');
    mount.style.cssText = 'margin:80px 16px 20px;max-width:400px';
    const host = document.createElement('div');
    host.className = 'link-context-host';
    const outside = document.createElement('input');
    outside.setAttribute('aria-label', 'Outside link context');
    outside.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2001;width:160px';
    document.body.prepend(mount, host, outside);
    window.changes = [];
    window.editor = window.createEditor(mount, { value, locale: 'en', onChange: (change) => window.changes.push(change) });
    const path = '/packages/plugins/dist/ui/contextual-link.js';
    const { createContextualLinkUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual-link');
    window.contextualLinkUI = createContextualLinkUI(host, window.editor);
    window.dispose = () => { window.contextualLinkUI.destroy(); window.editor.destroy(); mount.remove(); host.remove(); outside.remove(); };
  }, value);
};
const caret = async (page: Page, selector = 'a em', offset = 2) => {
  await page.evaluate(({ selector, offset }) => {
    const surface = window.editor.surface;
    surface.focus();
    const text = surface.querySelector(selector)!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, offset, text, offset);
    window.contextualLinkUI.refresh();
  }, { selector, offset });
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('linked caret previews and explicitly opens one isolated native tab without changing content or selection', async ({ page, context }) => {
  let requests = 0;
  await context.route('**/contextual-link-destination', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'text/html', body: '<p>Local destination</p>' });
  });
  await initialize(page);
  await caret(page);
  await expect(panel(page).locator('.mw-contextual-link-url')).toContainText('/contextual-link-destination');
  await expect(action(page, 'open')).toHaveAttribute('target', '_blank');
  const rel = (await action(page, 'open').getAttribute('rel'))!.split(/\s+/);
  expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { focused: document.activeElement === window.editor.surface, exact: selection.isCollapsed && selection.anchorNode === window.editor.surface.querySelector('em')!.firstChild && selection.anchorOffset === 2, changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ focused: true, exact: true, changes: 0, undo: false });
  expect(context.pages()).toHaveLength(1);
  expect(requests).toBe(0);
  const target = context.waitForEvent('page');
  await action(page, 'open').click();
  const opened = await target;
  await expect(opened.getByText('Local destination')).toBeVisible();
  expect(await opened.evaluate(() => window.opener === null)).toBe(true);
  expect(requests).toBe(1);
  expect(await html(page)).toBe(rich);
  await opened.close();
});

test('edit restores a lost native caret, preserves a translated draft and rich children, and unlink has its own Undo', async ({ page, context }) => {
  let previewRequests = 0;
  await context.route('**/contextual-link-destination', async (route) => {
    previewRequests++;
    await route.fulfill({ contentType: 'text/html', body: 'Unexpected navigation during editing' });
  });
  await initialize(page);
  await caret(page);
  await expect(action(page, 'edit')).toBeVisible();
  const children = await page.evaluateHandle(() => [...window.editor.surface.querySelector('a')!.childNodes]);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'open')).toBeFocused();
  const retainedOpen = await action(page, 'open').elementHandle();
  await page.evaluate(() => { document.getSelection()!.removeAllRanges(); window.contextualLinkUI.refresh(); });
  await action(page, 'edit').click();
  const href = form(page).getByLabel('Link URL', { exact: true });
  await expect(href).toBeFocused();
  expect(await retainedOpen!.evaluate(async (link) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const inert = !link.hasAttribute('href');
    (link as HTMLAnchorElement).click();
    return inert;
  })).toBe(true);
  await href.fill('/updated');
  expect(context.pages()).toHaveLength(1);
  expect(previewRequests).toBe(0);
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(form(page).getByLabel('Адрес ссылки', { exact: true })).toHaveValue('/updated');
  await form(page).getByRole('button', { name: 'Обновить ссылку' }).click();
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', '/updated');
  expect(await children.evaluate((nodes) => nodes.every((node, index) => node === window.editor.surface.querySelector('a')!.childNodes[index]))).toBe(true);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), changes: window.changes.map((change) => change.source) }))).toEqual({ selection: { index: 9, length: 0 }, changes: ['user'] });
  const edited = await html(page);
  // A fresh caret action opens the preview whether the submitted form stayed open or closed.
  await page.getByLabel('Outside link context').click();
  await caret(page, 'a strong', 2);
  await action(page, 'remove').click();
  expect(await html(page)).toBe('<p>Before <em>Label</em><strong> text</strong><img src="/logo.svg" alt="Linked image"> after</p>');
  expect(await children.evaluate((nodes) => nodes.every((node) => window.editor.surface.contains(node)))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(edited);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(rich);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('unsafe live hrefs and base protocols disable Open before activation and ordinary content clicks preserve navigation rules', async ({ page }) => {
  await initialize(page);
  await caret(page);
  await expect(action(page, 'open')).toBeVisible();
  expect(await page.evaluate(() => {
    const actual = window.editor.surface.querySelector('a')!;
    const opened = window.contextualLinkUI.element.querySelector<HTMLElement>('[data-mw-link-action="open"]')!;
    const prevented = (target: HTMLElement, options: MouseEventInit = {}): boolean => {
      let blocked: boolean | undefined;
      // Record the controller decision before suppressing all real navigation in this probe.
      const observe = (event: MouseEvent): void => { blocked = event.defaultPrevented; event.preventDefault(); };
      document.addEventListener('click', observe, { once: true });
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
      target.dispatchEvent(event);
      document.removeEventListener('click', observe);
      return blocked ?? event.defaultPrevented;
    };
    const content = [prevented(actual), prevented(actual, { ctrlKey: true })];
    actual.setAttribute('href', 'java\nscript:alert(1)');
    // The formerly safe preview must reject the click even before a refresh runs.
    const stale = new MouseEvent('click', { bubbles: true, cancelable: true });
    let beforeDefault: boolean | undefined;
    const intercept = (event: MouseEvent): void => { beforeDefault = event.defaultPrevented; event.preventDefault(); };
    document.addEventListener('click', intercept, { once: true });
    opened.dispatchEvent(stale);
    document.removeEventListener('click', intercept);
    const refused = beforeDefault ?? stale.defaultPrevented;
    const hidden: boolean[] = [];
    for (const href of ['javascript:alert(1)', '//other.example/path', '/\\other.example/path', 'https://exa mple.invalid/']) {
      actual.setAttribute('href', href);
      window.contextualLinkUI.refresh();
      hidden.push(window.contextualLinkUI.element.hidden);
    }
    actual.setAttribute('href', 'relative');
    const base = document.createElement('base');
    base.href = 'ftp://example.invalid/folder/';
    document.head.prepend(base);
    const protocol = new URL(actual.getAttribute('href')!, document.baseURI).protocol;
    window.contextualLinkUI.refresh();
    hidden.push(window.contextualLinkUI.element.hidden);
    base.remove();
    window.editor.setReadOnly(true);
    content.push(prevented(actual));
    return { content, refused, hidden, protocol };
  })).toEqual({ content: [true, false, false], refused: true, hidden: [true, true, true, true, true], protocol: 'ftp:' });
});

test('ineligible shapes and Escape dismiss the preview without stealing the caret or reopening from a queued refresh', async ({ page }) => {
  await initialize(page, '<p><a href="/text"><em>Label</em></a><a href="/picture"><img src="/logo.svg" alt="Picture"></a></p>');
  await caret(page);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'open')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await page.evaluate(async () => {
    document.dispatchEvent(new Event('selectionchange'));
    window.contextualLinkUI.refresh();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return document.activeElement === window.editor.surface && selection.anchorNode === window.editor.surface.querySelector('em')!.firstChild && selection.anchorOffset === 2 && selection.isCollapsed;
  })).toBe(true);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'open')).toBeFocused();
  await page.getByLabel('Outside link context').click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByLabel('Outside link context')).toBeFocused();
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    const text = surface.querySelector('em')!.firstChild!;
    const selection = document.getSelection()!;
    surface.focus();
    const inspect = (node: Node, start: number, end = start): boolean => {
      selection.setBaseAndExtent(node, start, node, end);
      window.contextualLinkUI.refresh();
      return window.contextualLinkUI.element.hidden;
    };
    // This range includes an image-only anchor and remains ineligible.
    const expanded = inspect(surface.querySelector('p')!, 0, 2);
    const shortcut = new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true });
    surface.dispatchEvent(shortcut);
    const boundary = inspect(surface.querySelector('p')!, 1);
    const imageOnly = inspect(surface.querySelectorAll('a')[1], 0);
    surface.querySelector('em')!.setAttribute('data-mw-node', 'app:owned');
    const semantic = inspect(text, 1);
    return { expanded, shortcut: shortcut.defaultPrevented, boundary, imageOnly, semantic };
  })).toEqual({ expanded: true, shortcut: false, boundary: true, imageOnly: true, semantic: true });
});

test('readonly and composition close editing; a stale action during focus restoration cannot modify an API replacement', async ({ page }) => {
  await initialize(page);
  await caret(page);
  await action(page, 'edit').click();
  await form(page).getByLabel('Link URL', { exact: true }).fill('/uncommitted');
  const retained = await form(page).getByRole('button', { name: 'Update link' }).elementHandle();
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(form(page)).toBeHidden();
  await retained!.evaluate((button) => (button as HTMLElement).click());
  expect(await html(page)).toBe(rich);
  await page.evaluate(() => window.editor.setReadOnly(false));
  await caret(page, 'a em', 3);
  await expect(action(page, 'remove')).toBeVisible();
  const oldRemove = await action(page, 'remove').elementHandle();
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(panel(page)).toBeHidden();
  await oldRemove!.evaluate((button) => (button as HTMLElement).click());
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  expect(await html(page)).toBe(rich);
  await caret(page, 'a em', 1);
  await expect(action(page, 'remove')).toBeVisible();
  await action(page, 'remove').focus();
  expect(await page.evaluate((replacement) => {
    const editor = window.editor;
    const remove = window.contextualLinkUI.element.querySelector<HTMLButtonElement>('[data-mw-link-action="remove"]')!;
    editor.surface.addEventListener('focusin', () => editor.setHTML(replacement), { once: true });
    remove.click();
    remove.click();
    return { html: editor.getHTML(), undo: editor.canUndo(), changes: window.changes.map((change) => change.source), hidden: window.contextualLinkUI.element.hidden };
  }, replacement)).toEqual({ html: replacement, undo: false, changes: ['api'], hidden: true });
  const pair = '<p><a href="/one">One</a> and <a href="/two">Two</a></p>';
  await page.evaluate((value) => window.editor.setHTML(value), pair);
  await caret(page, 'a', 1);
  await action(page, 'edit').click();
  await form(page).getByLabel('Link URL', { exact: true }).fill('/draft-for-one');
  const staleSubmit = await form(page).getByRole('button', { name: 'Update link' }).elementHandle();
  await caret(page, 'a:nth-of-type(2)', 1);
  await staleSubmit!.evaluate((button) => (button as HTMLElement).click());
  expect(await html(page)).toBe(pair);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await caret(page, 'a', 2);
  await action(page, 'edit').click();
  await form(page).getByLabel('Link URL', { exact: true }).fill('/stale');
  const draftText = form(page).getByLabel('Link URL', { exact: true });
  await draftText.fill('/must-not-insert');
  const retainedDraft = await draftText.elementHandle();
  expect(await retainedDraft!.evaluate((input) => {
    const editor = window.editor;
    editor.surface.querySelector('a')!.remove();
    const before = editor.getHTML();
    const changes = window.changes.length;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return { unchanged: editor.getHTML() === before, userChanges: window.changes.length - changes, undo: editor.canUndo() };
  })).toEqual({ unchanged: true, userChanges: 0, undo: false });
});

test('two controllers isolate shortcuts and stale controls; malformed setup and disposal preserve their host and editor', async ({ page, context }) => {
  let staleRequests = 0;
  await context.route('**/second', async (route) => {
    staleRequests++;
    await route.fulfill({ contentType: 'text/html', body: 'Unexpected navigation' });
  });
  await initialize(page);
  await caret(page);
  await expect(action(page, 'edit')).toBeVisible();
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/contextual-link.js';
    const { createContextualLinkUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual-link');
    const bad = document.createElement('div');
    document.body.prepend(bad);
    const rejected = [NaN, -1, 33, null].every((gap) => {
      try { createContextualLinkUI(bad, window.editor, { gap } as never); return false; }
      catch { return bad.childNodes.length === 0; }
    });
    bad.remove();
    const mount = document.createElement('div');
    const host = document.createElement('div');
    document.body.prepend(mount, host);
    const second = window.createEditor(mount, { value: '<p><a href="/second">Second</a></p>' });
    const controller = createContextualLinkUI(host, second);
    second.setSelection(2);
    const shortcut = new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true });
    second.surface.dispatchEvent(shortcut);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const separate = window.contextualLinkUI.element.hidden && controller.element.contains(document.activeElement);
    const remove = controller.element.querySelector<HTMLElement>('[data-mw-link-action="remove"]')!;
    const open = controller.element.querySelector<HTMLAnchorElement>('[data-mw-link-action="open"]')!;
    window.dispatchEvent(new Event('resize'));
    controller.destroy();
    controller.destroy();
    remove.click();
    const inertOpen = !open.hasAttribute('href');
    open.click();
    let staleRefresh = false;
    try { controller.refresh(); } catch { staleRefresh = true; }
    const stillOwned = host.childNodes.length === 0 && second.getHTML() === '<p><a href="/second">Second</a></p>' && !second.canUndo();
    second.setHTML('<p>Still usable</p>');
    const usable = second.getText() === 'Still usable';
    const hostAfterDestroy = window.contextualLinkUI.element.parentElement!;
    window.editor.destroy();
    const autoDisposed = hostAfterDestroy.childNodes.length === 0;
    second.destroy(); host.remove(); mount.remove();
    return { rejected, separate, staleRefresh, inertOpen, stillOwned, usable, autoDisposed };
  })).toEqual({ rejected: true, separate: true, staleRefresh: true, inertOpen: true, stillOwned: true, usable: true, autoDisposed: true });
  await page.evaluate(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  expect(staleRequests).toBe(0);
  expect(context.pages()).toHaveLength(1);
});

test('a clipped linked caret hides on scroll and reappears inside the narrow viewport without moving the caret', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 440 });
  await initialize(page, '<p><a href="/one">Visible text</a></p><p style="height: 400px">Spacer</p>');
  await page.evaluate(() => {
    const surface = window.editor.surface;
    const clip = surface.closest('.mw-editor')!.parentElement!;
    clip.classList.add('link-context-clip');
    clip.style.cssText = 'margin:12px 8px;height:80px;width:180px;overflow:auto';
    surface.style.padding = '0';
    surface.querySelector('p')!.style.margin = '0';
  });
  await caret(page, 'a', 3);
  await expect(panel(page)).toBeVisible();
  const box = await panel(page).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(440);
  const clip = page.locator('.link-context-clip');
  await clip.evaluate((node) => { node.scrollTop = 250; });
  await expect(panel(page)).toBeHidden();
  await clip.evaluate((node) => { node.scrollTop = 0; });
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { caret: selection.isCollapsed && selection.anchorNode === window.editor.surface.querySelector('a')!.firstChild && selection.anchorOffset === 3, focused: document.activeElement === window.editor.surface, changes: window.changes.length };
  })).toEqual({ caret: true, focused: true, changes: 0 });
});

test('contextual link exports load in SSR without consulting DOM or opening a URL', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    for (const key of ['document', 'window', 'fetch']) Object.defineProperty(globalThis, key, { get: () => { throw new Error(key); } });
    const { createContextualLinkUI, contextualLinkUIMessages } = await import('@morfira-dev/wysiwyg/ui/contextual-link');
    console.log(JSON.stringify([typeof createContextualLinkUI, Object.keys(contextualLinkUIMessages).sort()]));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual(['function', ['en', 'ru']]);
});
