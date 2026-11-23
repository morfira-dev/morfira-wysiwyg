import { expect, test } from '@playwright/test';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { EditorUIController } from '@morfira-dev/wysiwyg/ui/editor';
import { setupAccessibleToolbar } from './editor-ui-accessibility.fixture.js';

test('direct native select focus updates the roving stop and Tab leaves the toolbar', async ({ page }) => {
  await setupAccessibleToolbar(page);
  const first = page.locator('[data-accessible-toolbar="first"]');
  const select = first.getByRole('combobox', { name: 'Block format', exact: true });
  const bold = first.getByRole('button', { name: 'Bold', exact: true });
  await bold.focus();
  await expect(bold).toHaveAttribute('tabindex', '0');
  await select.focus();
  await expect(select).toHaveAttribute('tabindex', '0');
  await expect(bold).toHaveAttribute('tabindex', '-1');
  await select.press('Tab');
  await expect(first.getByLabel('After first', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(select).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(first.getByLabel('Before first', { exact: true })).toBeFocused();
});

test('native select and color keys retain focus and are not cancelled by shell navigation', async ({ page }) => {
  await setupAccessibleToolbar(page);
  const first = page.locator('[data-accessible-toolbar="first"]');
  for (const action of ['block', 'color']) {
    const control = first.locator(`[data-mw-ui-action="${action}"]`);
    await control.focus();
    const result = await control.evaluate((node) => {
      const before = document.querySelector('[data-accessible-toolbar="first"] .mw-content')!.innerHTML;
      const preserved = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].map((key) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        node.dispatchEvent(event);
        return !event.defaultPrevented && document.activeElement === node;
      });
      return { preserved, unchanged: before === document.querySelector('[data-accessible-toolbar="first"] .mw-content')!.innerHTML };
    });
    expect(result.preserved).toEqual([true, true, true, true, true, true]);
    expect(result.unchanged).toBe(true);
    await expect(control).toHaveAttribute('tabindex', '0');
    await control.press('Shift+Tab');
    await expect(first.getByLabel('Before first', { exact: true })).toBeFocused();
  }
});

test('disabled and localized refresh repairs Tab stops without changing another instance', async ({ page }) => {
  await setupAccessibleToolbar(page);
  const first = page.locator('[data-accessible-toolbar="first"]');
  const second = page.locator('[data-accessible-toolbar="second"]');
  await first.getByRole('button', { name: 'Bold', exact: true }).focus();
  await page.evaluate(() => {
    const editor = window.editor.getPlugin<Editor>('accessible-first')!;
    editor.setReadOnly(true);
    editor.setLocale('ru');
  });
  await expect(first.locator('[data-mw-ui-action="bold"]')).toBeDisabled();
  await expect(first.locator('[data-mw-ui-action="bold"]')).toHaveAttribute('tabindex', '-1');
  await expect(first.getByRole('button', { name: 'Inspect', exact: true })).toHaveAttribute('tabindex', '0');
  await expect(first.locator('[role="toolbar"] [tabindex="0"]')).toHaveCount(1);
  await expect(second.getByRole('combobox', { name: 'Block format', exact: true })).toHaveAttribute('tabindex', '0');
  await page.evaluate(() => window.editor.getPlugin<Editor>('accessible-first')!.setReadOnly(false));
  await first.locator('[data-mw-ui-action="color"]').focus();
  await page.evaluate(() => window.editor.getPlugin<Editor>('accessible-first')!.getPlugin<EditorUIController>('accessible-ui')!.refresh());
  await expect(first.locator('[data-mw-ui-action="color"]')).toHaveAttribute('tabindex', '0');
  await expect(first.locator('[role="toolbar"] [tabindex="0"]')).toHaveCount(1);
});

test('keyboard overflow focus and Escape belong to the active toolbar instance', async ({ page }) => {
  await setupAccessibleToolbar(page, true);
  const first = page.locator('[data-accessible-toolbar="first"]');
  const second = page.locator('[data-accessible-toolbar="second"]');
  const more = first.locator('[data-mw-ui-more]');
  await expect(more).toBeVisible();
  await more.focus();
  await more.press('Enter');
  const region = first.locator('.mw-ui-overflow');
  const firstControl = region.locator('button:enabled,select:enabled,input:enabled').first();
  await expect(firstControl).toBeFocused();
  await expect(firstControl).toHaveAttribute('tabindex', '0');
  const color = region.locator('[data-mw-ui-action="color"]');
  await color.focus();
  await expect(color).toHaveAttribute('tabindex', '0');
  await expect(firstControl).toHaveAttribute('tabindex', '-1');
  await color.press('Escape');
  await expect(region).toBeHidden();
  await expect(more).toBeFocused();
  await expect(second.locator('.mw-ui-overflow')).toBeHidden();
  await expect(region.locator('[tabindex="0"]')).toHaveCount(0);
});

test('Escape recovers editor focus after replacement and disposed controls stay inert', async ({ page }) => {
  await setupAccessibleToolbar(page);
  const first = page.locator('[data-accessible-toolbar="first"]');
  await first.getByRole('button', { name: 'Bold', exact: true }).focus();
  await page.evaluate(() => window.editor.getPlugin<Editor>('accessible-first')!.setHTML('<p>Replacement</p>'));
  await first.getByRole('button', { name: 'Bold', exact: true }).press('Escape');
  await expect(first.locator('.mw-content')).toBeFocused();
  const result = await page.evaluate(() => {
    const first = window.editor.getPlugin<Editor>('accessible-first')!;
    const second = window.editor.getPlugin<Editor>('accessible-second')!;
    const ui = first.getPlugin<EditorUIController>('accessible-ui')!;
    const button = ui.element.querySelector<HTMLButtonElement>('[data-mw-ui-action="bold"]')!;
    ui.destroy();
    button.click();
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    return { first: first.getHTML(), second: second.getHTML(), undo: first.canUndo(), connected: button.isConnected };
  });
  expect(result).toEqual({ first: '<p>Replacement</p>', second: '<p>Text</p>', undo: false, connected: false });
});

test('forced-colors keyboard focus keeps a visible system outline on a pressed action', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await setupAccessibleToolbar(page);
  const first = page.locator('[data-accessible-toolbar="first"]');
  await page.evaluate(() => {
    const editor = window.editor.getPlugin<Editor>('accessible-first')!;
    editor.focus();
    editor.setSelection(0, 4);
    editor.format('bold', true);
  });
  await first.getByLabel('Before first', { exact: true }).focus();
  // Enter through keyboard navigation so :focus-visible reflects real modality.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press('Alt+ArrowRight');
  const bold = first.getByRole('button', { name: 'Bold', exact: true });
  // Block -> color -> bold; color-reset is disabled when no color is applied.
  await expect(bold).toBeFocused();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(bold).toHaveCSS('outline-style', 'solid');
  await expect(bold).toHaveCSS('outline-width', '2px');
});

test.describe('coarse primary pointer', () => {
  test.use({ hasTouch: true });
  test('compact toolbar controls retain 44px touch targets', async ({ page }) => {
    await setupAccessibleToolbar(page);
    const first = page.locator('[data-accessible-toolbar="first"]');
    await first.locator('.mw-editor-ui').evaluate((element) => { element.setAttribute('data-density', 'compact'); });
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const sizes = await first.locator('button:enabled,select:enabled,input[type="color"]:enabled').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
  });
});
