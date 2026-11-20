import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { initializeLinkedRange, rangeAction, rangeForm, rangeHTML, rangePanel } from './contextual-link-range.fixture.js';

const sample = '<p><a href="/first" title="First" target="_blank" rel="noopener noreferrer"><strong>Alpha</strong></a> + plain + <a href="/second" title="Second"><em>Beta</em></a> tail</p>';
const choose = (page: Page, backward = true) => page.evaluate((backward) => {
  window.editor.focus();
  const first = window.editor.surface.querySelector('strong')!.firstChild!;
  const last = window.editor.surface.querySelector('em')!.firstChild!;
  document.getSelection()!.setBaseAndExtent(backward ? last : first, 2, backward ? first : last, 2);
  // Simulate genuine re-selection, including reopening a previously dismissed range.
  window.editor.surface.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  window.contextualLinkUI.refresh();
}, backward);
const selected = (page: Page) => page.evaluate(() => {
  const native = document.getSelection()!;
  const range = native.getRangeAt(0);
  return { text: native.toString(), logical: window.editor.getSelection(),
    backward: native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset };
});

test('mixed linked ranges own actions without ambiguous navigation and pure text keeps the formatting toolbar', async ({ page }) => {
  await initializeLinkedRange(page, sample, true);
  await choose(page);
  const before = await selected(page);
  await expect(rangePanel(page)).toBeVisible();
  await expect(rangeAction(page, 'open')).toBeHidden();
  await expect(rangeAction(page, 'open')).not.toHaveAttribute('href');
  await expect(rangeAction(page, 'edit')).toHaveText('Set link for selection');
  await expect(page.locator('.link-range-text-host .mw-contextual-toolbar')).toBeHidden();
  expect(await selected(page)).toEqual(before);
  expect(await rangeHTML(page)).toBe(sample);
  await page.evaluate(() => {
    const node = window.editor.surface.querySelector('a')!.nextSibling!;
    window.editor.focus();
    document.getSelection()!.setBaseAndExtent(node, 1, node, 6);
    window.contextualLinkUI.refresh(); window.contextualUI.refresh();
  });
  await expect(rangePanel(page)).toBeHidden();
  await expect(page.locator('.link-range-text-host .mw-contextual-toolbar')).toBeVisible();
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('partial mixed unlink preserves outside metadata and rich marks with backward selection in one history step', async ({ page }) => {
  await initializeLinkedRange(page, sample);
  await choose(page);
  const before = await selected(page);
  await rangeAction(page, 'remove').click();
  const content = page.locator('.mw-content');
  await expect(content.locator('a')).toHaveCount(2);
  await expect(content.locator('a').first()).toHaveText('Al');
  await expect(content.locator('a').first()).toHaveAttribute('title', 'First');
  await expect(content.locator('a').first()).toHaveAttribute('target', '_blank');
  await expect(content.locator('a').last()).toHaveText('ta');
  await expect(content.locator('a').last()).toHaveAttribute('href', '/second');
  await expect(content.locator('a').last()).toHaveAttribute('title', 'Second');
  await expect(content).toHaveText('Alpha + plain + Beta tail');
  await expect(content.locator('strong').filter({ hasText: 'pha' })).toHaveText('pha');
  await expect(content.locator('em').filter({ hasText: 'Be' })).toHaveText('Be');
  expect(await selected(page)).toEqual(before);
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['user']);
  const changed = await rangeHTML(page);
  await page.evaluate(() => window.editor.undo());
  expect(await rangeHTML(page)).toBe(sample);
  expect(await selected(page)).toEqual(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await rangeHTML(page)).toBe(changed);
  expect(await selected(page)).toEqual(before);
});

test('mixed editing starts with empty drafts, rejects unsafe URLs and patches only selected text through history', async ({ page }) => {
  await initializeLinkedRange(page, sample);
  await choose(page);
  const before = await selected(page);
  await rangeAction(page, 'edit').click();
  const form = rangeForm(page);
  const href = form.getByLabel('Link URL', { exact: true });
  await expect(href).toHaveValue('');
  await expect(form.getByLabel('Link title', { exact: true })).toHaveValue('');
  await href.fill('javascript:alert(1)');
  await form.getByRole('button', { name: 'Update link', exact: true }).click();
  expect(await rangeHTML(page)).toBe(sample);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(href).toHaveValue('javascript:alert(1)');
  await href.fill('/joined');
  await form.getByLabel('Link title', { exact: true }).fill('Joined');
  await form.getByRole('button', { name: 'Update link', exact: true }).click();
  const content = page.locator('.mw-content');
  await expect(content.locator('a')).toHaveCount(3);
  await expect(content.locator('a[href="/joined"]')).toHaveText(before.text);
  await expect(content.locator('a[href="/joined"]')).toHaveAttribute('title', 'Joined');
  await expect(content.locator('a[href="/first"]')).toHaveText('Al');
  await expect(content.locator('a[href="/second"]')).toHaveText('ta');
  await expect(content.locator('a[href="/joined"] strong')).toHaveText('pha');
  await expect(content.locator('a[href="/joined"] em')).toHaveText('Be');
  expect(await selected(page)).toEqual(before);
  await page.evaluate(() => window.editor.undo());
  expect(await rangeHTML(page)).toBe(sample);
  expect(await selected(page)).toEqual(before);
});

test('selection form removes linked text when both boundaries are outside anchors without guessing first metadata', async ({ page }) => {
  await initializeLinkedRange(page, sample);
  expect(await page.evaluate(async () => {
    window.editor.focus();
    const paragraph = window.editor.surface.querySelector('p')!;
    document.getSelection()!.setBaseAndExtent(paragraph, paragraph.childNodes.length, paragraph, 0);
    const path = '/packages/plugins/dist/ui/links.js';
    const { createLinkForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/links');
    const host = document.createElement('div'); document.body.append(host);
    const form = createLinkForm(host, window.editor, { scope: 'selection' });
    const drafts = form.getValues();
    const unlink = [...form.element.querySelectorAll('button')].find((node) => node.textContent === 'Unlink')!;
    const enabled = !unlink.disabled;
    unlink.click();
    const native = document.getSelection()!;
    const range = native.getRangeAt(0);
    const result = { drafts, enabled, links: window.editor.surface.querySelectorAll('a').length,
      text: window.editor.surface.textContent, backward: native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset,
      changes: window.changes.length };
    form.destroy(); host.remove(); return result;
  })).toEqual({ drafts: { href: '', title: '', text: '', newTab: false }, enabled: true, links: 0,
    text: 'Alpha + plain + Beta tail', backward: true, changes: 1 });
});

test('resource, structural, semantic, unsafe and hidden mixed ranges refuse before cloning source contents', async ({ page }) => {
  await initializeLinkedRange(page, sample);
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    const original = Range.prototype.cloneContents;
    let clones = 0;
    Range.prototype.cloneContents = () => { clones++; return document.createDocumentFragment(); };
    const first = surface.querySelector('strong')!.firstChild!;
    const last = surface.querySelector('em')!.firstChild!;
    const choose = () => { surface.focus(); document.getSelection()!.setBaseAndExtent(first, 2, last, 2); window.contextualLinkUI.refresh(); return window.contextualLinkUI.element.hidden; };
    const bad: boolean[] = [];
    try {
      const middle = surface.querySelector('a')!.nextSibling!;
      for (const tag of ['img', 'code', 'span']) {
        const node = document.createElement(tag);
        if (tag === 'span') node.setAttribute('data-mw-node', 'test:protected');
        middle.parentNode!.insertBefore(node, middle);
        bad.push(choose()); node.remove();
      }
      const second = surface.querySelectorAll('a')[1];
      second.setAttribute('href', 'javascript:alert(1)'); bad.push(choose()); second.setAttribute('href', '/second');
      second.hidden = true; bad.push(choose()); second.hidden = false;
      return { bad, clones, undo: window.editor.canUndo() };
    }
    finally { Range.prototype.cloneContents = original; }
  })).toEqual({ bad: [true, true, true, true, true], clones: 0, undo: false });
});

test('readonly and IME disable mixed edits while locale and keyboard restore exact ranges and stale forms remain inert', async ({ page }) => {
  await initializeLinkedRange(page, sample);
  await choose(page);
  const before = await selected(page);
  await page.keyboard.press('Alt+F10');
  await expect(rangeAction(page, 'edit')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual(before);
  await choose(page);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(rangeAction(page, 'edit')).toBeDisabled();
  await expect(rangeAction(page, 'remove')).toBeDisabled();
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.setLocale('ru'); });
  await choose(page);
  await expect(rangeAction(page, 'remove')).toHaveText('Убрать ссылки из выделения');
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(rangePanel(page)).toBeHidden();
  await page.evaluate((value) => window.editor.setHTML(value + '<p>Reset</p>'), sample);
  await choose(page);
  await rangeAction(page, 'edit').click();
  const retained = await rangeForm(page).getByRole('button', { name: 'Обновить ссылку', exact: true }).elementHandle();
  await page.evaluate(() => window.editor.setHTML('<p>Replacement</p>'));
  await retained!.evaluate((node) => (node as HTMLButtonElement).click());
  await expect(page.locator('.mw-content')).toHaveText('Replacement');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('focus-time replacement and retained disposed range actions never redirect a mixed operation', async ({ page }) => {
  await initializeLinkedRange(page, sample);
  await choose(page);
  await page.keyboard.press('Alt+F10');
  const retained = await rangeAction(page, 'remove').elementHandle();
  await page.evaluate(() => {
    window.editor.surface.addEventListener('focus', () => window.editor.setHTML('<p>New baseline</p>'), { once: true });
  });
  await rangeAction(page, 'remove').click();
  await expect(page.locator('.mw-content')).toHaveText('New baseline');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.contextualLinkUI.destroy());
  await retained!.evaluate((node) => (node as HTMLButtonElement).click());
  expect(await rangeHTML(page)).toBe('<p>New baseline</p>');
});
