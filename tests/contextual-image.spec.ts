import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './contextual-image.types.js';

const figure = '<p>Before</p><figure title="Owned image"><img src="/context-image.svg" alt="Image label" width="120" height="80"><figcaption><em>Rich caption</em></figcaption></figure><p>After</p>';
const replacement = '<p>Replacement</p><figure><img src="/context-image.svg" alt="New image"></figure><p>End</p>';
const panel = (page: Page) => page.locator('.image-context-host .mw-contextual-image');
const action = (page: Page, name: 'edit' | 'remove') => panel(page).locator('[data-mw-image-action="' + name + '"]');
const form = (page: Page) => panel(page).getByRole('form');
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

const initialize = async (page: Page, value = figure) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    await Promise.all(['core/dist/style.css', 'plugins/dist/ui/forms.css', 'plugins/dist/ui/contextual-image.css'].map((path) => new Promise<void>((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/packages/' + path;
      css.onload = () => resolve();
      css.onerror = () => reject(new Error('Could not load ' + path));
      document.head.append(css);
    })));
    const mount = document.createElement('div');
    mount.className = 'image-context-mount';
    mount.style.cssText = 'margin:100px 16px 20px;max-width:400px';
    const host = document.createElement('div');
    host.className = 'image-context-host';
    const outside = document.createElement('input');
    outside.setAttribute('aria-label', 'Outside image context');
    outside.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2001;width:160px';
    document.body.prepend(mount, host, outside);
    const imagePath = '/packages/plugins/dist/images.js';
    const { images, imageCommands } = await import(/* @vite-ignore */ imagePath) as typeof import('@morfira-dev/wysiwyg/plugins/images');
    const uiPath = '/packages/plugins/dist/ui/contextual-image.js';
    const { createContextualImageUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/contextual-image');
    window.changes = [];
    window.editor = window.createEditor(mount, { value, locale: 'en', plugins: [images()], onChange: (change) => window.changes.push(change) });
    window.contextualImageAPI = imageCommands(window.editor);
    window.contextualImageUI = createContextualImageUI(host, window.editor);
    window.dispose = () => { window.contextualImageUI.destroy(); window.editor.destroy(); mount.remove(); host.remove(); outside.remove(); };
  }, value);
};
const select = async (page: Page, selector = 'img') => {
  await page.evaluate((selector) => {
    window.contextualImageAPI.select(window.editor.surface.querySelector<HTMLImageElement>(selector)!);
    window.contextualImageUI.refresh();
  }, selector);
};

test('native image context previews literal metadata without taking focus, cloning an image or creating history', async ({ page }) => {
  let requests = 0;
  await page.route('**/context-image.svg', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="navy"/></svg>' });
  });
  await initialize(page);
  await expect(page.locator('.mw-content img')).toBeVisible();
  await expect.poll(() => requests).toBe(1);
  const before = await html(page);
  await page.locator('.mw-content img').click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator('.mw-contextual-image-summary')).toHaveText('Image label');
  await expect(panel(page).locator('.mw-contextual-image-dimensions')).toHaveText('120 × 80');
  expect(await page.evaluate(() => {
    const range = document.getSelection()!.getRangeAt(0);
    const image = window.editor.surface.querySelector('img')!;
    return { focus: document.activeElement === window.editor.surface, image: range.startContainer.childNodes[range.startOffset] === image && range.endOffset === range.startOffset + 1, changes: window.changes.length, undo: window.editor.canUndo(), previews: window.contextualImageUI.element.querySelectorAll('img').length };
  })).toEqual({ focus: true, image: true, changes: 0, undo: false, previews: 0 });
  expect(await html(page)).toBe(before);
  expect(requests).toBe(1);
  // An application-owned FIGURE outside the editor is not a persisted image owner.
  const wrappedVisible = await page.evaluate(async () => {
    const mount = document.querySelector('.image-context-mount')!;
    const image = window.editor.surface.querySelector('img')!;
    const originalFigure = image.parentElement!;
    const inline = document.createElement('p');
    inline.append(image);
    originalFigure.replaceWith(inline);
    const outer = document.createElement('figure');
    mount.before(outer);
    outer.append(mount);
    window.contextualImageAPI.select(window.editor.surface.querySelector('img')!);
    window.contextualImageUI.refresh();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const visible = !window.contextualImageUI.element.hidden;
    outer.before(mount);
    outer.remove();
    window.contextualImageAPI.select(window.editor.surface.querySelector('img')!);
    window.contextualImageUI.refresh();
    return visible;
  });
  expect(wrappedVisible).toBe(true);
  await expect(panel(page)).toBeVisible();
  expect(requests).toBe(1);
});

test('properties restore a lost node selection, preserve a localized draft and rich caption, and removal has one Undo', async ({ page }) => {
  await initialize(page);
  await select(page);
  const before = await html(page);
  const original = await page.evaluateHandle(() => ({ image: window.editor.surface.querySelector('img')!, caption: window.editor.surface.querySelector('figcaption em')! }));
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'edit')).toBeFocused();
  const retainedRemove = await action(page, 'remove').elementHandle();
  await page.evaluate(() => { document.getSelection()!.removeAllRanges(); window.contextualImageUI.refresh(); });
  await action(page, 'edit').click();
  await expect(form(page).getByLabel('Image URL', { exact: true })).toBeFocused();
  await retainedRemove!.evaluate((button) => (button as HTMLButtonElement).click());
  await form(page).getByLabel('Alt', { exact: true }).fill('Updated');
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(form(page).getByLabel('Alt', { exact: true })).toHaveValue('Updated');
  await form(page).getByLabel('Ширина изображения', { exact: true }).fill('');
  await form(page).getByLabel('Высота изображения', { exact: true }).fill('90');
  await form(page).getByLabel('Высота изображения', { exact: true }).press('Enter');
  await expect(page.locator('.mw-content img')).toHaveAttribute('alt', 'Updated');
  await expect(page.locator('.mw-content img')).not.toHaveAttribute('width');
  await expect(page.locator('.mw-content img')).toHaveAttribute('height', '90');
  expect(await original.evaluate(({ image, caption }) => window.editor.surface.querySelector('img') === image && window.editor.surface.querySelector('figcaption em') === caption)).toBe(true);
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['user']);
  const edited = await html(page);
  await page.getByLabel('Outside image context').click();
  await select(page);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'edit')).toBeFocused();
  await action(page, 'remove').click();
  await expect(page.locator('.mw-content figure')).toHaveCount(0);
  await expect(page.locator('.mw-content')).toContainText('Before');
  await expect(page.locator('.mw-content')).toContainText('After');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(edited);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('invalid metadata stays atomic and corrected captions remain literal text', async ({ page }) => {
  await initialize(page);
  await select(page);
  const before = await html(page);
  await action(page, 'edit').click();
  const src = form(page).getByLabel('Image URL', { exact: true });
  await src.fill('javascript:alert(1)');
  await src.press('Enter');
  expect(await html(page)).toBe(before);
  await expect(src).toHaveValue('javascript:alert(1)');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await src.fill('/context-image.svg');
  await form(page).getByLabel('Image caption', { exact: true }).fill('<img src=x onerror=alert(1)>');
  await form(page).getByLabel('Image caption', { exact: true }).press('Enter');
  await expect(page.locator('.mw-content figcaption')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.mw-content img')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('inline caption promotion in a merged cell keeps adjacent cells and supports one Undo', async ({ page }) => {
  await initialize(page, '<table><tbody><tr><td rowspan="2"><p><em>Left</em><img src="/context-image.svg" alt="Inline">Right</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>After</p>');
  await select(page);
  const before = await html(page);
  const neighbors = await page.evaluateHandle(() => [...window.editor.surface.querySelectorAll('td')].slice(1));
  await action(page, 'edit').click();
  await form(page).getByLabel('Image caption', { exact: true }).fill('Promoted caption');
  await form(page).getByLabel('Image caption', { exact: true }).press('Enter');
  const cell = page.locator('.mw-content td').first();
  await expect(cell).toHaveAttribute('rowspan', '2');
  await expect(cell.locator('figure figcaption')).toHaveText('Promoted caption');
  await expect(cell).toContainText('Left');
  await expect(cell).toContainText('Right');
  expect(await neighbors.evaluate((nodes) => nodes.every((node) => node.isConnected) && nodes.map((node) => node.textContent).join('') === 'AB')).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('ineligible figure, caption, mixed, semantic and foreign selections do not expose image actions', async ({ page }) => {
  await initialize(page);
  await select(page);
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    const image = surface.querySelector('img')!;
    const figure = image.parentElement!;
    const inspect = (node: Node, contents = false): boolean => {
      const range = document.createRange();
      if (contents) range.selectNodeContents(node);
      else range.selectNode(node);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      window.contextualImageUI.refresh();
      return window.contextualImageUI.element.hidden;
    };
    const wholeFigure = inspect(figure);
    const caption = figure.querySelector('figcaption')!;
    const caret = document.createRange();
    caret.selectNodeContents(caption);
    caret.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(caret);
    window.contextualImageUI.refresh();
    const captionCaret = window.contextualImageUI.element.hidden;
    const mixed = inspect(surface, true);
    const nested = document.createElement('img');
    caption.append(nested);
    const multi = inspect(image);
    nested.remove();
    figure.setAttribute('data-mw-node', 'app:owned');
    const semantic = inspect(image);
    figure.removeAttribute('data-mw-node');
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'img');
    surface.append(foreign);
    const foreignRange = inspect(foreign);
    return { wholeFigure, captionCaret, mixed, multi, semantic, foreignRange };
  })).toEqual({ wholeFigure: true, captionCaret: true, mixed: true, multi: true, semantic: true, foreignRange: true });
});

test('read-only, IME, API replacement and focus-time destruction keep retained actions inert', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page);
  await select(page);
  await action(page, 'edit').click();
  await form(page).getByLabel('Alt', { exact: true }).fill('Discard');
  const retained = await form(page).getByRole('button', { name: 'Update image', exact: true }).elementHandle();
  const before = await html(page);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await retained!.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.setReadOnly(false));
  await select(page);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'edit')).toBeFocused();
  await page.evaluate((value) => {
    window.editor.surface.addEventListener('focusin', () => window.editor.setHTML(value), { once: true });
    window.contextualImageUI.element.querySelector<HTMLButtonElement>('[data-mw-image-action="edit"]')!.click();
  }, replacement);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), hidden: window.contextualImageUI.element.hidden, text: window.editor.getText().replace(/\s+/g, ' ').trim(), image: window.editor.surface.querySelector('img')?.getAttribute('alt') }))).toEqual({ undo: false, hidden: true, text: 'Replacement End', image: 'New image' });
  await select(page);
  await expect(panel(page)).toBeVisible();
  const remove = await action(page, 'remove').elementHandle();
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(panel(page)).toBeHidden();
  await remove!.evaluate((button) => (button as HTMLButtonElement).click());
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await select(page);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'edit')).toBeFocused();
  await page.evaluate(() => window.editor.surface.addEventListener('focusin', () => window.editor.destroy(), { once: true }));
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.contextualImageUI.element.isConnected)).toBe(false);
  expect(errors).toEqual([]);
});

test('narrow clipped geometry hides and returns without moving the selected image and Escape suppresses queued reopening', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await initialize(page);
  await page.locator('.image-context-mount').evaluate((mount) => { (mount as HTMLElement).style.cssText = 'margin:90px 8px 20px;width:280px;height:180px;overflow:auto'; });
  await select(page);
  await expect(panel(page)).toBeVisible();
  const box = await panel(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  await page.locator('.image-context-mount').evaluate((mount) => {
    const spacer = document.createElement('div');
    spacer.style.height = '900px';
    mount.append(spacer);
    mount.scrollTop = 800;
    mount.dispatchEvent(new Event('scroll'));
  });
  await expect(panel(page)).toBeHidden();
  await page.locator('.image-context-mount').evaluate((mount) => { mount.scrollTop = 0; mount.dispatchEvent(new Event('scroll')); });
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => window.contextualImageAPI.getSelected()?.alt)).toBe('Image label');
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'edit')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.contextualImageUI.refresh());
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => ({ selected: window.contextualImageAPI.getSelected()?.alt, focus: document.activeElement === window.editor.surface, undo: window.editor.canUndo() }))).toEqual({ selected: 'Image label', focus: true, undo: false });
  // Escape also cancels an Alt+F10 opening before its first animation frame.
  await page.evaluate(async () => {
    const surface = window.editor.surface;
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true }));
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(panel(page)).toBeHidden();
});

test('independent controllers, invalid setup, disposal and SSR keep ownership and imports bounded', async ({ page }) => {
  await initialize(page);
  await select(page);
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(async () => {
    const uiPath = '/packages/plugins/dist/ui/contextual-image.js';
    const { createContextualImageUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/contextual-image');
    const mount = document.createElement('div');
    const host = document.createElement('div');
    document.body.append(mount, host);
    const other = window.createEditor(mount, { value: '<p>Other</p>', locale: 'en' });
    let missing = false;
    try { createContextualImageUI(host, other); } catch { missing = true; }
    other.destroy();
    const imagePath = '/packages/plugins/dist/images.js';
    const { images, imageCommands } = await import(/* @vite-ignore */ imagePath) as typeof import('@morfira-dev/wysiwyg/plugins/images');
    const second = window.createEditor(mount, { value: '<p><img src="/context-image.svg" alt="Second" width="40" height="30"></p>', plugins: [images()] });
    const ui = createContextualImageUI(host, second);
    imageCommands(second).select(second.surface.querySelector('img')!);
    ui.refresh();
    window.contextualImageUI.refresh();
    const isolated = window.contextualImageUI.element.hidden;
    ui.destroy();
    ui.destroy();
    const empty = host.childNodes.length === 0;
    let refreshThrows = false;
    try { ui.refresh(); } catch { refreshThrows = true; }
    let invalid = false;
    try { createContextualImageUI(host, second, { gap: Infinity }); } catch { invalid = true; }
    const clean = host.childNodes.length === 0;
    second.destroy();
    mount.remove();
    host.remove();
    const retained = window.contextualImageUI.element.querySelector<HTMLButtonElement>('[data-mw-image-action="remove"]')!;
    const before = window.editor.getHTML();
    window.contextualImageUI.destroy();
    retained.click();
    return { missing, isolated, empty, refreshThrows, invalid, clean, unchanged: window.editor.getHTML() === before };
  })).toEqual({ missing: true, isolated: true, empty: true, refreshThrows: true, invalid: true, clean: true, unchanged: true });
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', "delete globalThis.window; delete globalThis.document; const ui = await import('@morfira-dev/wysiwyg/ui/contextual-image'); if (typeof ui.createContextualImageUI !== 'function') throw new Error('Missing factory');"], { encoding: 'utf8' });
  expect(output).toBe('');
});
