import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`HTML source uses localized modal, normalized text and one-step Undo (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const t = (russian: string, translated: string) => english ? translated : russian;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(english ? '/source-editing' : '/ru/source-editing');
  const demo = page.locator('.source-editing-example');
  const open = demo.getByRole('button', { name: t('Открыть HTML-исходник', 'Open HTML source'), exact: true });
  await expect(open).toBeEnabled();
  const before = await demo.locator('.mw-content').innerHTML();
  await demo.getByRole('button', { name: t('Пример неподдерживаемой разметки', 'Unsupported markup example'), exact: true }).click();
  const dialog = demo.getByRole('dialog', { name: t('HTML-исходник', 'HTML source'), exact: true });
  await expect(dialog).toBeVisible();
  const preview = dialog.getByRole('textbox', { name: t('Нормализованный HTML', 'Normalized HTML'), exact: true });
  await expect(preview).toHaveValue(/<strong>Supported bold<\/strong>/);
  expect(await preview.inputValue()).not.toMatch(/onclick|javascript:|<script/);
  expect(await demo.locator('.mw-content').innerHTML()).toBe(before);
  const draft = dialog.getByRole('textbox', { name: t('Черновик HTML', 'HTML draft'), exact: true });
  await draft.fill('<h2>From HTML</h2><p>Supported replacement</p>');
  await dialog.getByRole('button', { name: t('Применить HTML', 'Apply HTML'), exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(demo.locator('.mw-content h2')).toHaveText('From HTML');
  await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  expect(await demo.locator('.mw-content').innerHTML()).toBe(before);
  await demo.getByRole('checkbox', { name: t('Только чтение', 'Read only'), exact: true }).check();
  await expect(open).toBeDisabled();
  expect(errors).toEqual([]);
});
