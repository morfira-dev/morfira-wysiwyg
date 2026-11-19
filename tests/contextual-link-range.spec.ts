import { expect, test } from '@playwright/test';
import './ui-links.types.js';
import { initializeLinkedRange, linkedRangeHTML, linkedRangeSelection, rangeAction, rangeForm, rangeHTML, rangePanel, selectLinkedRange } from './contextual-link-range.fixture.js';

test('a linked text range previews and explicitly opens safely without replacing the selection', async ({ page, context }) => {
  let requests = 0;
  await context.route('**/range-destination', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'text/html', body: '<p>Selected link destination</p>' });
  });
  await initializeLinkedRange(page);
  await selectLinkedRange(page);
  const selected = await linkedRangeSelection(page);
  expect(selected).toEqual({ logical: { index: 8, length: 7 }, text: 'abel te', anchor: 'em', anchorOffset: 1, focus: 'strong', focusOffset: 3 });
  await expect(rangePanel(page)).toBeVisible();
  await expect(rangePanel(page).locator('.mw-contextual-link-url')).toHaveText('/range-destination');
  await expect(rangeAction(page, 'open')).toHaveAttribute('target', '_blank');
  expect((await rangeAction(page, 'open').getAttribute('rel'))!.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  expect(await linkedRangeSelection(page)).toEqual(selected);
  expect(await page.evaluate(() => ({ focused: document.activeElement === window.editor.surface, changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ focused: true, changes: 0, undo: false });
  expect(requests).toBe(0);
  const openedPromise = context.waitForEvent('page');
  await rangeAction(page, 'open').click();
  const opened = await openedPromise;
  await expect(opened.getByText('Selected link destination')).toBeVisible();
  expect(await opened.evaluate(() => window.opener === null)).toBe(true);
  expect(requests).toBe(1);
  expect(await rangeHTML(page)).toBe(linkedRangeHTML);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await opened.close();
});

test('backward partial-link editing and unlink preserve rich children, whole-link scope and exact selection history', async ({ page }) => {
  await initializeLinkedRange(page);
  await selectLinkedRange(page, true);
  const selected = await linkedRangeSelection(page);
  const children = await page.evaluateHandle(() => [...window.editor.surface.querySelector('a')!.childNodes]);
  await page.keyboard.press('Alt+F10');
  await expect(rangeAction(page, 'open')).toBeFocused();
  // Keyboard control focus may erase native Selection in WebKit; retain the exact saved range.
  await page.evaluate(() => { document.getSelection()!.removeAllRanges(); window.contextualLinkUI.refresh(); });
  await rangeAction(page, 'edit').click();
  await expect(rangeForm(page).getByLabel('Link URL', { exact: true })).toBeFocused();
  await rangeForm(page).getByLabel('Link URL', { exact: true }).fill('/updated-range');
  await rangeForm(page).getByLabel('Link title', { exact: true }).fill('Updated');
  await rangeForm(page).getByRole('button', { name: 'Update link', exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveCount(2);
  await expect(page.locator('.mw-content a').first()).toHaveAttribute('href', '/updated-range');
  await expect(page.locator('.mw-content a').first()).toHaveAttribute('title', 'Updated');
  await expect(page.locator('.mw-content a').first()).toHaveText('Label text');
  expect(await children.evaluate((nodes) => nodes.every((node, index) => node === window.editor.surface.querySelector('a')!.childNodes[index]))).toBe(true);
  expect(await linkedRangeSelection(page)).toEqual(selected);
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['user']);
  const edited = await rangeHTML(page);
  await page.evaluate(() => window.editor.undo());
  expect(await rangeHTML(page)).toBe(linkedRangeHTML);
  expect(await linkedRangeSelection(page)).toEqual(selected);
  await page.evaluate(() => window.editor.redo());
  expect(await rangeHTML(page)).toBe(edited);
  expect(await linkedRangeSelection(page)).toEqual(selected);
  // Re-select against the reconstructed history nodes before a separate unlink.
  await selectLinkedRange(page, true);
  await rangeAction(page, 'remove').click();
  await expect(page.locator('.mw-content a')).toHaveCount(1);
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', '/second');
  expect(await rangeHTML(page)).toContain('Before <em>Label</em><strong> text</strong> after');
  expect(await linkedRangeSelection(page)).toEqual(selected);
  await page.evaluate(() => window.editor.undo());
  expect(await rangeHTML(page)).toBe(edited);
  expect(await linkedRangeSelection(page)).toEqual(selected);
  await page.evaluate(() => window.editor.undo());
  expect(await rangeHTML(page)).toBe(linkedRangeHTML);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('only text ranges owned by one anchor enable context, including full anchor child boundaries', async ({ page }) => {
  await initializeLinkedRange(page, '<p>Before <a href="/range-destination"><em>Label</em><span>Middle</span><strong> text</strong></a> after <a href="/second">Second</a></p>');
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    const anchor = surface.querySelector('a')!;
    const selection = document.getSelection()!;
    surface.focus();
    const inspect = (start: Node, startOffset: number, end: Node, endOffset: number): boolean => {
      selection.setBaseAndExtent(start, startOffset, end, endOffset);
      window.contextualLinkUI.refresh();
      return window.contextualLinkUI.element.hidden;
    };
    const first = anchor.querySelector('em')!.firstChild!;
    const last = anchor.querySelector('strong')!.firstChild!;
    const full = inspect(anchor, 0, anchor, anchor.childNodes.length);
    const across = inspect(first, 1, surface.querySelectorAll('a')[1].firstChild!, 2);
    const outside = inspect(first, 1, anchor.nextSibling!, 3);
    anchor.querySelector('span')!.setAttribute('data-mw-node', 'app:protected');
    const protectedMiddle = inspect(first, 1, last, 3);
    // Whole-anchor commands must also protect descendants outside the selected interval.
    const protectedOutside = inspect(first, 1, first, 3);
    anchor.querySelector('span')!.removeAttribute('data-mw-node');
    const image = document.createElement('img');
    image.alt = 'Selected image';
    anchor.insertBefore(image, anchor.querySelector('strong'));
    const imageMixed = inspect(first, 1, last, 3);
    const shortcut = new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true });
    surface.dispatchEvent(shortcut);
    return { full, across, outside, protectedMiddle, protectedOutside, imageMixed, shortcut: shortcut.defaultPrevented, undo: window.editor.canUndo() };
  })).toEqual({ full: false, across: true, outside: true, protectedMiddle: true, protectedOutside: true, imageMixed: true, shortcut: false, undo: false });
});

test('a changed range during focus restoration and an API replacement invalidate retained range actions', async ({ page }) => {
  await initializeLinkedRange(page);
  await selectLinkedRange(page);
  await rangeAction(page, 'remove').focus();
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const remove = window.contextualLinkUI.element.querySelector<HTMLButtonElement>('[data-mw-link-action="remove"]')!;
    const focus = editor.surface.focus.bind(editor.surface);
    let called = false;
    editor.surface.focus = (options) => {
      editor.surface.focus = focus;
      focus(options);
      called = true;
      const text = editor.surface.querySelector('em')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(text, 0, text, 1);
    };
    try { remove.click(); }
    finally { editor.surface.focus = focus; }
    return { called, html: editor.getHTML(), undo: editor.canUndo(), changes: window.changes.length };
  })).toEqual({ called: true, html: linkedRangeHTML, undo: false, changes: 0 });
  await selectLinkedRange(page, true);
  await rangeAction(page, 'remove').focus();
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const remove = window.contextualLinkUI.element.querySelector<HTMLButtonElement>('[data-mw-link-action="remove"]')!;
    const focus = editor.surface.focus.bind(editor.surface);
    const replacement = '<p><a href="/replacement">Replacement</a></p>';
    let called = false;
    editor.surface.focus = (options) => {
      editor.surface.focus = focus;
      focus(options);
      called = true;
      editor.setHTML(replacement);
    };
    try { remove.click(); remove.click(); }
    finally { editor.surface.focus = focus; }
    return { called, html: editor.getHTML(), undo: editor.canUndo(), changes: window.changes.map((change) => change.source), hidden: window.contextualLinkUI.element.hidden };
  })).toEqual({ called: true, html: '<p><a href="/replacement">Replacement</a></p>', undo: false, changes: ['api'], hidden: true });
});

test('range drafts do not retarget another range in the same anchor and readonly or composition disables mutations', async ({ page }) => {
  await initializeLinkedRange(page);
  await selectLinkedRange(page);
  await rangeAction(page, 'edit').click();
  await rangeForm(page).getByLabel('Link URL', { exact: true }).fill('/old-range-draft');
  const submit = await rangeForm(page).getByRole('button', { name: 'Update link', exact: true }).elementHandle();
  await page.evaluate(() => {
    const surface = window.editor.surface;
    surface.focus();
    const text = surface.querySelector('em')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    window.contextualLinkUI.refresh();
  });
  await submit!.evaluate((button) => (button as HTMLElement).click());
  expect(await rangeHTML(page)).toBe(linkedRangeHTML);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await selectLinkedRange(page, true);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(rangeAction(page, 'open')).toBeVisible();
  await expect(rangeAction(page, 'edit')).toBeDisabled();
  await expect(rangeAction(page, 'remove')).toBeDisabled();
  await page.evaluate(() => window.editor.setReadOnly(false));
  await selectLinkedRange(page);
  const remove = await rangeAction(page, 'remove').elementHandle();
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(rangePanel(page)).toBeHidden();
  await remove!.evaluate((button) => (button as HTMLElement).click());
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  expect(await rangeHTML(page)).toBe(linkedRangeHTML);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ undo: false, changes: 0 });
});

test('link context takes priority over an earlier text toolbar and releases that preference on destruction', async ({ page }) => {
  await initializeLinkedRange(page, linkedRangeHTML, true);
  await selectLinkedRange(page, true);
  const toolbar = page.locator('.link-range-text-host .mw-contextual-toolbar');
  await expect(rangePanel(page)).toBeVisible();
  await expect(toolbar).toBeHidden();
  await page.keyboard.press('Alt+F10');
  await expect(rangeAction(page, 'open')).toBeFocused();
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/contextual.js';
    const { createContextualToolbar } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual');
    const mount = document.createElement('div');
    const host = document.createElement('div');
    mount.style.cssText = 'margin:80px 16px';
    document.body.prepend(mount, host);
    const second = window.createEditor(mount, { value: '<p><a href="/independent">Independent link</a></p>' });
    const ui = createContextualToolbar(host, second);
    try {
      second.surface.focus();
      const text = second.surface.querySelector('a')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(text, 1, text, 5);
      ui.refresh();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return { visible: !ui.element.hidden, unchanged: second.getHTML(), undo: second.canUndo() };
    } finally {
      ui.destroy();
      second.destroy();
      mount.remove();
      host.remove();
    }
  })).toEqual({ visible: true, unchanged: '<p><a href="/independent">Independent link</a></p>', undo: false });
  await selectLinkedRange(page, true);
  const selected = await linkedRangeSelection(page);
  await page.evaluate(() => window.contextualLinkUI.destroy());
  // No explicit text-toolbar refresh: removing the preference must notify its owner.
  await expect(toolbar).toBeVisible();
  expect(await linkedRangeSelection(page)).toEqual(selected);
  await page.keyboard.press('Alt+F10');
  await expect(toolbar.locator('[data-mw-ui-action="bold"]')).toBeFocused();
  expect(await rangeHTML(page)).toBe(linkedRangeHTML);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});
