import { expect, test } from '@playwright/test';
import { setupResponsiveUI } from './ui-responsive.fixture.js';

for (const viewport of [320, 1200]) test(`320px forms and docked search fit their large-text host in a ${viewport}px viewport`, async ({ page }) => {
  await page.setViewportSize({ width: viewport, height: 700 });
  await setupResponsiveUI(page);
  if (viewport === 1200) await page.locator('[data-responsive]').evaluate((element) => { (element as HTMLElement).style.width = '320px'; });
  await page.locator('[data-mw-ui-action="search"]').click();
  const search = page.locator('.mw-ui-search-docked');
  await expect(search).toBeVisible();
  await expect(search.locator('input').first()).toBeVisible();
  const result = await page.evaluate(() => {
    const root = document.querySelector('[data-responsive]')!;
    const host = root.getBoundingClientRect();
    const forms = [...root.querySelectorAll<HTMLElement>('.mw-form')].filter((element) => element.getClientRects().length);
    const bounded = forms.every((form) => {
      const rect = form.getBoundingClientRect();
      return rect.left >= host.left - 1 && rect.right <= host.right + 1 && form.scrollWidth <= form.clientWidth + 1;
    });
    const grid = getComputedStyle(root.querySelector('.mw-search-form')!).gridTemplateColumns.split(' ').length;
    return { bounded, grid, pageFits: document.documentElement.scrollWidth <= innerWidth + 1, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ bounded: true, grid: 2, pageFits: true, html: '<p><a href="https://example.org">word</a> word</p>', undo: false });
});

for (const kind of ['media', 'formula', 'image'] as const) {
  test(`${kind} native modal fits a short narrow viewport and keeps the final action reachable`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 260 });
    await setupResponsiveUI(page);
    await page.evaluate((name) => {
      const { editor } = window.responsiveUI;
      editor.setSelection(1);
      window.responsiveUI[name].open();
    }, kind);
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    const bounds = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        client: element.clientHeight, scroll: element.scrollHeight, overflow: getComputedStyle(element).overflowY };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(321);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(261);
    expect(bounds.overflow).toBe('auto');
    const last = dialog.locator('button:visible:enabled').last();
    await last.focus();
    await expect(last).toBeFocused();
    await expect(last).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() })))
      .toEqual({ html: '<p><a href="https://example.org">word</a> word</p>', undo: false });
  });
}

test.describe('coarse primary pointer optional forms', () => {
  test.use({ hasTouch: true });
  test('form actions, checkbox labels and contextual actions expose 44px activation height', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await setupResponsiveUI(page);
    const result = await page.evaluate(() => {
      const root = document.querySelector('[data-responsive]')!;
      const controls = [...root.querySelectorAll<HTMLElement>('.mw-form button,.mw-form label:has(input[type=checkbox])')]
        .filter((element) => element.getClientRects().length);
      return { coarse: matchMedia('(pointer:coarse)').matches, count: controls.length,
        large: controls.every((element) => element.getBoundingClientRect().height >= 44) };
    });
    expect(result.coarse).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(result.large).toBe(true);
    await page.evaluate(() => {
      window.editor.focus();
      window.editor.setSelection(1);
      window.responsiveUI.contextual.refresh();
    });
    const contextual = page.locator('.mw-contextual-link');
    await expect(contextual).toBeVisible();
    for (const button of await contextual.locator('.mw-contextual-link-actions button').all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

test('media and formula keyboard focus stays visibly outlined in forced colors', async ({ page, browserName }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await setupResponsiveUI(page);
  for (const kind of ['media', 'formula'] as const) {
    await page.evaluate((name) => { window.editor.setSelection(1); window.responsiveUI[name].open(); }, kind);
    const dialog = page.locator('dialog[open]');
    const action = dialog.locator('button:visible:enabled').first();
    // Stay inside the owned controls; macOS WebKit uses Option+Tab for non-text controls.
    await dialog.locator('input:visible:enabled').last().focus();
    await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
    await expect(action).toBeFocused();
    const outline = await action.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Escape');
  }
});
