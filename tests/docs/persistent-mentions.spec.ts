import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`persistent mention controls retain ID and inspect read-only in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-persistent-mentions');
  await panel.locator('summary').click();
  await expect(panel).toContainText('persistent: true');
  await panel.getByRole('button', { name: t('Выбрать упоминание @an', 'Choose an @an mention'), exact: true }).click();
  await page.getByRole('option', { name: new RegExp(t('Анна Смирнова', 'Anna Smith')) }).click();
  const mention = content.locator('span[data-mw-node="morfira:mention"]');
  await expect(mention).toHaveAttribute('data-mention-id', 'anna');
  await expect(mention).toHaveText(t('@Анна Смирнова', '@Anna Smith'));
  await expect(mention).toHaveAttribute('contenteditable', 'false');
  await panel.getByRole('button', { name: t('Показать ID упоминаний', 'Show mention IDs'), exact: true }).click();
  await expect(panel.locator('[data-mention-references]')).toContainText('"id": "anna"');
  const undo = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).locator('[data-mw-ui-action="undo"]');
  await undo.click();
  await expect(mention).toHaveCount(0);
  await expect(content).toHaveText('@an');
  const redo = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).locator('[data-mw-ui-action="redo"]');
  await redo.click();
  await expect(mention).toHaveAttribute('data-mention-id', 'anna');
  for (const kind of ['HTML', 'JSON']) {
    await panel.getByRole('button', { name: t(`Проверить ${kind} round-trip`, `Check ${kind} round-trip`), exact: true }).click();
    await expect(mention).toHaveAttribute('data-mention-id', 'anna');
    await expect(panel.locator('[data-mention-references]')).toContainText('"id": "anna"');
  }
  const before = await content.innerHTML();
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(panel.getByRole('button', { name: t('Загрузить сохранённое упоминание', 'Load a saved mention'), exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: t('Проверить JSON round-trip', 'Check JSON round-trip'), exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: t('Показать ID упоминаний', 'Show mention IDs'), exact: true }).click();
  await expect(panel.locator('[data-mention-references]')).toContainText('"id": "anna"');
  expect(await content.innerHTML()).toBe(before);
  await panel.getByRole('link', { name: t('Хранение ID и границы упоминаний', 'Mention ID storage and boundaries'), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${english ? '/en' : ''}/persistent-mentions$`));
  await expect(page.locator('.vp-doc')).toContainText(t('не атомарный токен', 'not an atomic token'));
});
