import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const selectExample = async (page: Page) => {
  const block = page.locator('.mw-content [title="Contextual sample"]');
  await block.scrollIntoViewIfNeeded();
  await block.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    let offset = 0;
    let start: Node | undefined;
    let end: Node | undefined;
    let startOffset = 0;
    let endOffset = 0;
    while ((text = walker.nextNode())) {
      const length = text.textContent!.length;
      if (!start && offset + length >= 7) { start = text; startOffset = 7 - offset; }
      if (offset + length >= 15) { end = text; endOffset = 15 - offset; break; }
      offset += length;
    }
    node.closest<HTMLElement>('.mw-content')!.focus();
    document.getSelection()!.setBaseAndExtent(end!, endOffset, start!, startOffset);
    document.dispatchEvent(new Event('selectionchange'));
  });
};

for (const english of [false, true]) test(`optional contextual controls in ${english ? 'English dark desktop playground' : 'Russian narrow homepage'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.setViewportSize({ width: english ? 1280 : 390, height: 900 });
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const toggle = page.getByRole('checkbox', { name: t('Контекстная панель', 'Contextual toolbar'), exact: true });
  await expect(toggle).toBeChecked();
  if (english) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  const panel = page.locator('.lab-contextual');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: t('Загрузить пример выделения', 'Load selection sample'), exact: true }).click();
  await selectExample(page);
  const originalText = await content.textContent();
  const selected = await page.evaluate(() => document.getSelection()!.toString());
  const contentNode = await content.elementHandle();
  const contextual = page.locator('.mw-contextual-toolbar');
  const contextToolbar = contextual.getByRole('toolbar', { name: t('Форматирование выделения', 'Selection formatting'), exact: true });
  await expect(contextual).toBeVisible();
  await expect(contextToolbar).toBeVisible();
  expect(await content.evaluate((node) => document.activeElement === node)).toBe(true);
  const underline = contextToolbar.getByRole('button', { name: t('Подчёркнутый', 'Underline'), exact: true });
  await underline.click();
  await expect.poll(async () => (await content.locator('u').allTextContents()).join('')).toBe(selected);
  expect(await content.textContent()).toBe(originalText);
  await expect(content.locator('[title="Contextual sample"] a')).toHaveAttribute('href', 'https://example.com');
  const readyToolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  await readyToolbar.locator('[data-mw-ui-action="undo"]').click();
  await expect(content.locator('u')).toHaveCount(0);
  await expect(readyToolbar.locator('[data-mw-ui-action="undo"]')).toBeDisabled();
  await readyToolbar.locator('[data-mw-ui-action="redo"]').click();
  await expect.poll(async () => (await content.locator('u').allTextContents()).join('')).toBe(selected);
  await selectExample(page);
  await page.keyboard.press('Alt+F10');
  await expect(contextual).toBeVisible();
  await expect(contextToolbar.getByRole('button', { name: t('Полужирный', 'Bold'), exact: true })).toBeFocused();
  if (english) {
    expect(await contextToolbar.evaluate((node) => getComputedStyle(node).getPropertyValue('--mw-toolbar-bg').trim())).toBe('#222839');
    expect(await contextToolbar.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(34, 40, 57)');
  }
  const box = await contextual.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.keyboard.press('Escape');
  await expect(contextual).toBeHidden();
  expect(await content.evaluate((node) => document.activeElement === node)).toBe(true);
  await toggle.uncheck();
  await expect(contextual).toHaveCount(0);
  expect(await contentNode!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await content.textContent()).toBe(originalText);
  await toggle.check();
  await selectExample(page);
  await expect(contextual).toBeVisible();
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(contextual).toBeHidden();
  expect(await content.textContent()).toBe(originalText);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
