import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './contextual-image.types.js';

const sample = '<p>Before</p><figure title="Expanded figure"><img src="/expanded-context.svg" alt="Expanded image" width="120" height="80"><figcaption><em>Rich caption</em> <a href="https://example.com">Caption link</a> <code>Code</code></figcaption></figure><p>After</p>';
const replacement = '<p>Replacement</p><figure><img src="/expanded-context.svg" alt="New image" width="120" height="80"><figcaption>New caption</figcaption></figure>';
const panel = (page: Page) => page.locator('.expanded-context-host .mw-contextual-image');
const action = (page: Page, name: 'edit' | 'remove') => panel(page).locator(`[data-mw-image-action="${name}"]`);
const form = (page: Page) => panel(page).getByRole('form');
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const initialize = async (page: Page, value = sample, requested?: () => void) => {
  await page.route('**/expanded-context.svg', (route) => {
    requested?.();
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="navy"/></svg>' });
  });
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    await Promise.all(['core/dist/style.css', 'plugins/dist/ui/forms.css', 'plugins/dist/ui/contextual-image.css'].map((path) => new Promise<void>((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/packages/' + path;
      css.onload = () => resolve(); css.onerror = () => reject(new Error('Could not load ' + path));
      document.head.append(css);
    })));
    const mount = document.createElement('div');
    mount.className = 'expanded-image-editor';
    mount.style.cssText = 'margin:100px 16px 20px;max-width:420px';
    const host = document.createElement('div'); host.className = 'expanded-context-host';
    const outside = document.createElement('input'); outside.setAttribute('aria-label', 'Outside expanded images');
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
const select = (page: Page, kind: 'figure' | 'caption', offset = 2, backward = false) => page.evaluate(({ kind, offset, backward }) => {
  window.editor.focus();
  const range = document.createRange();
  if (kind === 'figure') range.selectNode(window.editor.surface.querySelector('figure')!);
  else {
    range.setStart(window.editor.surface.querySelector('figcaption em')!.firstChild!, offset);
    range.collapse(true);
  }
  const native = document.getSelection()!;
  if (backward) native.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
  else { native.removeAllRanges(); native.addRange(range); }
  window.contextualImageUI.refresh();
}, { kind, offset, backward });

test('whole-figure context is observational and uses image geometry rather than a long caption without cloning resources', async ({ page }) => {
  let requests = 0;
  await initialize(page, sample.replace('Rich caption', 'Long caption '.repeat(160)), () => { requests++; });
  await expect.poll(() => requests).toBe(1);
  const image = await page.locator('.expanded-image-editor img').elementHandle();
  const before = await html(page);
  await select(page, 'figure', 0, true);
  await expect(panel(page)).toBeVisible();
  expect(await page.evaluate(() => {
    const figure = window.editor.surface.querySelector('figure')!;
    const native = document.getSelection()!;
    const range = native.getRangeAt(0);
    const imageRect = figure.querySelector('img')!.getBoundingClientRect();
    const uiRect = window.contextualImageUI.element.getBoundingClientRect();
    return { selected: range.startContainer.childNodes[range.startOffset] === figure,
      backward: native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset,
      focus: document.activeElement === window.editor.surface, undo: window.editor.canUndo(), changes: window.changes.length,
      previews: window.contextualImageUI.element.querySelectorAll('img').length,
      near: Math.min(Math.abs(uiRect.bottom - imageRect.top), Math.abs(uiRect.top - imageRect.bottom)) < 20 };
  })).toEqual({ selected: true, backward: true, focus: true, undo: false, changes: 0, previews: 0, near: true });
  expect(await image!.evaluate((node) => node === window.editor.surface.querySelector('img'))).toBe(true);
  expect(await html(page)).toBe(before);
  expect(requests).toBe(1);
});

test('whole-figure metadata edit retains rich caption and remove uses one undo while keeping surrounding blocks', async ({ page }) => {
  await initialize(page);
  const original = await html(page);
  const owned = await page.evaluateHandle(() => ({ image: window.editor.surface.querySelector('img')!, caption: window.editor.surface.querySelector('figcaption em')! }));
  await select(page, 'figure', 0, true);
  await action(page, 'edit').click();
  await form(page).getByLabel('Alt', { exact: true }).fill('Changed figure');
  await form(page).getByLabel('Alt', { exact: true }).press('Enter');
  await expect(page.locator('.expanded-image-editor img')).toHaveAttribute('alt', 'Changed figure');
  expect(await owned.evaluate(({ image, caption }) => image === window.editor.surface.querySelector('img') && caption === window.editor.surface.querySelector('figcaption em'))).toBe(true);
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['user']);
  const edited = await html(page);
  await page.getByLabel('Outside expanded images', { exact: true }).focus();
  await select(page, 'figure');
  await action(page, 'remove').click();
  await expect(page.locator('.expanded-image-editor figure')).toHaveCount(0);
  await expect(page.locator('.expanded-image-editor .mw-content')).toHaveText('BeforeAfter');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(edited);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('caption keyboard properties and Escape restore the exact rich-text caret without a document operation', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  await select(page, 'caption', 3);
  const point = await page.evaluateHandle(() => window.editor.surface.querySelector('figcaption em')!.firstChild!);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'edit')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(form(page).getByLabel('Image URL', { exact: true })).toBeFocused();
  await form(page).getByLabel('Alt', { exact: true }).fill('Uncommitted draft');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  expect(await point.evaluate((node) => {
    const range = document.getSelection()!.getRangeAt(0);
    return { node: range.startContainer === node, offset: range.startOffset, collapsed: range.collapsed,
      focus: document.activeElement === window.editor.surface, changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ node: true, offset: 3, collapsed: true, focus: true, changes: 0, undo: false });
  await page.evaluate(() => window.contextualImageUI.refresh());
  await expect(panel(page)).toBeHidden();
  expect(await html(page)).toBe(before);
});

test('caption edits remain atomic and retained controls cannot mutate readonly or composition-canceled targets', async ({ page }) => {
  await initialize(page);
  await select(page, 'caption');
  await action(page, 'edit').click();
  const before = await html(page);
  await form(page).getByLabel('Alt', { exact: true }).fill('Discard readonly');
  const submit = await form(page).getByRole('button', { name: 'Update image', exact: true }).elementHandle();
  await page.evaluate(() => window.editor.setReadOnly(true));
  await submit!.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.setReadOnly(false));
  await select(page, 'caption');
  const remove = await action(page, 'remove').elementHandle();
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await remove!.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.setHTML(window.editor.getHTML().replace('Rich caption', 'Fresh caption')));
  await select(page, 'caption');
  await action(page, 'edit').click();
  await form(page).getByLabel('Image caption', { exact: true }).fill('Literal <b>caption</b>');
  await form(page).getByLabel('Image caption', { exact: true }).press('Enter');
  await expect(page.locator('.expanded-image-editor figcaption')).toHaveText('Literal <b>caption</b>');
  await expect(page.locator('.expanded-image-editor figcaption b')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.expanded-image-editor figcaption em')).toHaveText('Fresh caption');
});

test('expanded caption, linked/code/semantic/hidden carets and complex figures stay outside image-context ownership', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const inspect = (range: Range): boolean => {
      window.editor.focus();
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      window.contextualImageUI.refresh();
      return window.contextualImageUI.element.hidden;
    };
    const caption = root.querySelector('figcaption')!;
    const range = document.createRange(); range.selectNodeContents(caption);
    const expanded = inspect(range);
    const at = (node: Node) => { const caret = document.createRange(); caret.setStart(node, 0); caret.collapse(true); return inspect(caret); };
    const link = at(caption.querySelector('a')!.firstChild!);
    const code = at(caption.querySelector('code')!.firstChild!);
    const rich = caption.querySelector<HTMLElement>('em')!;
    rich.setAttribute('data-mw-node', 'app:protected');
    const semantic = at(rich.firstChild!);
    rich.removeAttribute('data-mw-node'); rich.hidden = true;
    const hidden = at(rich.firstChild!);
    const whole = document.createRange(); whole.selectNode(caption.parentElement!);
    const wholeHiddenDescendant = inspect(whole);
    rich.hidden = false;
    caption.hidden = true;
    const wholeCaption = document.createRange(); wholeCaption.selectNode(caption.parentElement!);
    const wholeHiddenCaption = inspect(wholeCaption);
    caption.hidden = false;
    const extra = document.createElement('img'); caption.append(extra);
    const complex = at(rich.firstChild!); extra.remove();
    return { expanded, link, code, semantic, hidden, wholeHiddenDescendant, wholeHiddenCaption, complex, changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ expanded: true, link: true, code: true, semantic: true, hidden: true, wholeHiddenDescendant: true, wholeHiddenCaption: true, complex: true, changes: 0, undo: false });
});

test('focus-time replacement and disposal invalidate caption and figure actions without retargeting a draft', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page);
  await select(page, 'caption');
  await expect(panel(page)).toBeVisible();
  await action(page, 'edit').focus();
  await page.evaluate((value) => {
    window.editor.surface.addEventListener('focusin', () => window.editor.setHTML(value), { once: true });
    window.contextualImageUI.element.querySelector<HTMLButtonElement>('[data-mw-image-action="edit"]')!.click();
  }, replacement);
  await expect(page.locator('.expanded-image-editor img')).toHaveAttribute('alt', 'New image');
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.setHTML('<figure><img src="/expanded-context.svg" alt="New image" width="120" height="80"><figcaption><em>Replacement caption</em></figcaption></figure>'));
  await select(page, 'figure');
  const retained = await action(page, 'remove').elementHandle();
  const before = await html(page);
  await page.evaluate(() => window.contextualImageUI.destroy());
  await retained!.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await html(page)).toBe(before);
  await expect(page.locator('.expanded-image-editor img')).toHaveCount(1);
  expect(errors).toEqual([]);
});
