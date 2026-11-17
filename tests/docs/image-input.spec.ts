import { expect, test } from '@playwright/test';

test('Russian homepage file paste uses the explicit local callback and ignores accompanying markup', async ({ page }) => {
  await page.goto('/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  await page.getByLabel('Пример документа', { exact: true }).selectOption('empty');
  await page.getByRole('button', { name: 'Загрузить пример', exact: true }).click();
  await expect(content).toHaveText('');
  await content.locator('p').first().click();
  await expect(page.locator('.demo-input-hint')).toContainText('файл не отправляется и не сохраняется');
  await content.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['demo'], 'photo.png', { type: 'image/png' }));
    transfer.setData('text/html', '<strong>Ignored fallback</strong>');
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: transfer });
    element.dispatchEvent(paste);
  });
  await expect(content.locator('figure img')).toHaveAttribute('src', '/logo.svg');
  await expect(content).not.toContainText('Ignored fallback');
  await page.getByRole('toolbar', { name: 'Форматирование', exact: true }).locator('[data-mw-ui-action="undo"]').click();
  await expect(content.locator('img')).toHaveCount(0);
});

test('English playground rejects SVG file input while keeping the document unchanged', async ({ page }) => {
  await page.goto('/en/playground');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  await page.getByLabel('Document sample', { exact: true }).selectOption('empty');
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();
  await expect(content).toHaveText('');
  await content.locator('p').first().click();
  await expect(page.locator('.demo-input-hint')).toContainText('files are not uploaded or stored');
  const before = await content.innerHTML();
  const prevented = await content.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['<svg/>'], 'photo.svg', { type: 'image/svg+xml' }));
    transfer.setData('text/html', '<strong>Ignored fallback</strong>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(content).toHaveJSProperty('innerHTML', before);
  await expect(content.locator('img')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Formatting', exact: true }).locator('[data-mw-ui-action="undo"]')).toBeDisabled();
});
