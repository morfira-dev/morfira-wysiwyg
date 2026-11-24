import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  const t = (russian: string, translated: string) => english ? translated : russian;
  test(`remembered-selection guide controls preserve target and refuse replacement (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    await page.goto(english ? '/plugin-sdk' : '/ru/plugin-sdk');
    const demo = page.locator('.selection-sdk-example');
    const select = demo.getByRole('button', { name: t('Выделить пример', 'Select sample'), exact: true });
    await expect(select).toBeEnabled();
    const output = demo.getByRole('textbox', { name: t('HTML сохранённого выделения', 'Remembered selection HTML'), exact: true });
    await select.click();
    await demo.getByRole('button', { name: t('Сохранить выделение', 'Remember selection'), exact: true }).click();
    const external = demo.getByRole('textbox', { name: t('Внешнее поле приложения', 'External application field'), exact: true });
    await expect(external).toBeFocused();
    await external.fill('application-owned field');
    await demo.getByRole('button', { name: t('Применить жирный', 'Apply bold'), exact: true }).click();
    await expect(output).toHaveValue('<p><strong>Morfira</strong> — selection handles.</p>');
    await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(output).toHaveValue('<p>Morfira — selection handles.</p>');

    await select.click();
    await demo.getByRole('button', { name: t('Сохранить выделение', 'Remember selection'), exact: true }).click();
    await demo.getByRole('button', { name: t('Заменить документ', 'Replace document'), exact: true }).click();
    await demo.getByRole('button', { name: t('Применить жирный', 'Apply bold'), exact: true }).click();
    await expect(output).toHaveValue('<p>Morfira — replacement document.</p>');
    await expect(demo.getByRole('status')).toContainText(t('Цель устарела', 'The target expired'));
  });
}
