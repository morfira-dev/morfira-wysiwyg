import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  const t = (ru: string, en: string) => english ? en : ru;
  test(`extension guide maps positions, keeps views external and persists atom identity (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(english ? '/en/plugin-extensions' : '/plugin-extensions');
    const demo = page.locator('.plugin-extensions-example');
    await expect(demo.getByRole('button', { name: t('Сбросить пример', 'Reset example'), exact: true })).toBeEnabled();
    const output = demo.getByRole('textbox', { name: t('HTML расширений SDK', 'SDK extensions HTML'), exact: true });
    await expect(output).toHaveValue(/data-mw-node="demo:token"/);
    await expect(demo.locator('[data-position]')).toHaveText('6');
    await expect(demo.locator('.sdk-external-views .sdk-node-card')).toHaveText(/Token \/ ID 42/);
    await expect(demo.locator('.mw-content .sdk-node-card')).toHaveCount(0);

    await demo.getByRole('button', { name: t('Вставить префикс с mapping', 'Insert prefix with mapping'), exact: true }).click();
    await expect(output).toHaveValue(/<p>\+\+Start /);
    await expect(demo.locator('[data-position]')).toHaveText('8');
    await expect(output).not.toHaveValue(/contenteditable|sdk-node-card/);
    await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(demo.locator('[data-position]')).toHaveText('6');

    await demo.getByRole('button', { name: t('Изменить узел', 'Update node'), exact: true }).click();
    await expect(demo.locator('.sdk-external-views .sdk-node-card')).toHaveText(/Updated \/ ID 42/);
    await expect(output).toHaveValue(/>Updated<\/span>/);
    await demo.getByRole('button', { name: t('Вставить атом', 'Insert atom'), exact: true }).click();
    await expect(demo.locator('.mw-content [data-mw-node="demo:token"]')).toHaveCount(2);
    await expect(demo.locator('.sdk-external-views .sdk-node-card')).toHaveCount(2);
    await expect(output).toHaveValue(/data-id="43"/);
    expect(errors).toEqual([]);
  });
}
