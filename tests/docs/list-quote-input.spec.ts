import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`list quote boundary guide uses native keys and public history controls (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const t = (russian: string, translated: string) => english ? translated : russian;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(english ? '/list-quote-input' : '/ru/list-quote-input');
  const demo = page.locator('.list-quote-input-example');
  const content = demo.locator('.mw-content');
  const scenario = demo.getByRole('combobox', { name: t('Сценарий границы', 'Boundary scenario'), exact: true });
  const start = demo.getByRole('button', { name: t('Начало правого блока — Backspace', 'Right block start — Backspace'), exact: true });
  const end = demo.getByRole('button', { name: t('Конец левого блока — Delete', 'Left block end — Delete'), exact: true });
  const undo = demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true });
  const redo = demo.getByRole('button', { name: t('Повторить', 'Redo'), exact: true });
  const output = demo.getByRole('textbox', { name: t('HTML границ цитат', 'Quote boundary HTML'), exact: true });
  await expect(start).toBeEnabled();
  const before = await output.inputValue();
  await start.click();
  await expect(content).toBeFocused();
  await expect(demo.getByRole('status')).toContainText('Backspace');
  await page.keyboard.press('Backspace');
  await expect(content.locator('[title="Left body"]')).toHaveText('Alpha oneBeta tail');
  await expect(content.locator('[title="Right body"]')).toHaveCount(0);
  await expect(content.locator('[title="First quote"]')).toHaveCSS('text-align', 'center');
  await expect(content.locator('[title="Nested branch"]')).toHaveText('Nested branch');
  await expect(content.locator('[title="After branch"]')).toHaveText('After branch');
  await expect(undo).toBeEnabled();
  const after = await output.inputValue();
  await undo.click();
  await expect(output).toHaveValue(before);
  await redo.click();
  await expect(output).toHaveValue(after);

  // Different localized examples cover distinct public sample choices without
  // repeating the full engine boundary matrix on documentation pages.
  await scenario.selectOption(english ? 'quote-quote' : 'body-quote');
  await end.click();
  await expect(content).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(content.locator('[title="Left body"]')).toHaveText('Alpha oneBeta tail');
  await expect(content.locator('[title="Second quote"]')).toHaveText('Quote suffix');
  await expect(content.locator('[title="Quote suffix"]')).toHaveText('Quote suffix');

  await scenario.selectOption('branch');
  const barrier = await output.inputValue();
  await start.click();
  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue(barrier);
  await expect(undo).toBeDisabled();
  await demo.getByRole('checkbox', { name: t('Только чтение', 'Read only'), exact: true }).check();
  await expect(scenario).toBeDisabled();
  await expect(demo.getByRole('button', { name: t('Восстановить пример', 'Reset example'), exact: true })).toBeDisabled();
  await expect(start).toBeEnabled();
  await start.click();
  await page.keyboard.press('Backspace');
  await expect(output).toHaveValue(barrier);
  await expect(content).toHaveAttribute('contenteditable', 'false');
  expect(errors).toEqual([]);
});

test('homepage quote editor mounts lazily and releases its document on collapse', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Deletion at list quote boundaries' }) });
  const demo = section.locator('.list-quote-input-example');
  await expect(demo).toHaveCount(0);
  await section.locator('summary').click();
  await expect(demo.locator('.mw-content')).toBeVisible();
  await expect(demo.getByRole('button', { name: 'Right block start — Backspace', exact: true })).toBeEnabled();
  await section.locator('summary').click();
  await expect(demo).toHaveCount(0);
  await section.locator('summary').click();
  await expect(demo.locator('.mw-content')).toBeVisible();
});
