import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  const t = (russian: string, translated: string) => english ? translated : russian;

  test(`advanced Markdown guide exposes explicit options and working localized import/export (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(english ? '/markdown-codec' : '/ru/markdown-codec');
    const demo = page.locator('.advanced-markdown-example');
    const content = demo.locator('.mw-content');
    const source = demo.getByRole('textbox', { name: t('Исходный Markdown', 'Markdown source'), exact: true });
    const importButton = demo.getByRole('button', { name: t('Импортировать Markdown', 'Import Markdown'), exact: true });
    const exportButton = demo.getByRole('button', { name: t('Экспортировать Markdown', 'Export Markdown'), exact: true });
    const tasks = demo.getByRole('checkbox', { name: t('Метаданные чек-листов', 'Task-list metadata'), exact: true });
    const alignment = demo.getByRole('checkbox', { name: t('Выравнивание столбцов', 'Column alignment'), exact: true });
    await expect(importButton).toBeEnabled();
    await expect(content.locator('h1')).toHaveText('Morfira ©');
    await expect(tasks).toBeChecked();
    await expect(alignment).toBeChecked();
    await expect(content.locator('li[data-checklist-checked="true"]')).toHaveText('Reviewed');
    await expect(content.locator('th').nth(1)).toHaveCSS('text-align', 'center');

    const authored = '- [x] Local review\n\n| First | Second |\n| :--- | ---: |\n| A | B |';
    await source.fill(authored);
    await importButton.click();
    await expect(content.locator('li[data-checklist-checked="true"]')).toHaveText('Local review');
    const document = await content.innerHTML();
    await exportButton.click();
    await expect(source).toHaveValue(/- \[x\] Local review/);
    await expect(source).toHaveValue(/\| :--- \| ---: \|/);
    expect(await content.innerHTML()).toBe(document);
    await expect(demo.getByRole('status')).toHaveText(t('Канонический Markdown экспортирован.', 'Canonical Markdown exported.'));

    await tasks.uncheck();
    await alignment.uncheck();
    await source.fill(authored);
    await importButton.click();
    await expect(content.locator('li')).toHaveText('[x] Local review');
    await expect(content.locator('li[data-checklist-checked]')).toHaveCount(0);
    await expect(content.locator('th[style], td[style]')).toHaveCount(0);
    await expect(demo.getByRole('status')).toHaveText(t('Импорт завершён. Предыдущая история сброшена.', 'Imported. Previous history was reset.'));

    await tasks.check();
    await alignment.check();
    await demo.getByRole('button', { name: t('Восстановить пример', 'Reset example'), exact: true }).click();
    await expect(content.locator('h1')).toHaveText('Morfira ©');
    await expect(content.locator('li[data-checklist-checked="true"]')).toHaveText('Reviewed');
    expect(errors).toEqual([]);
  });

  test(`homepage advanced Markdown editor mounts only while its optional section is open (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(english ? '/' : '/ru/');
    const optional = page.locator('.home-optional-examples');
    const summary = optional.locator('summary').filter({ hasText: t('Расширенный Markdown: импорт и экспорт', 'Extended Markdown import and export') });
    const example = optional.locator('.advanced-markdown-example');
    await expect(summary).toBeVisible();
    await expect(example).toHaveCount(0);
    await summary.click();
    await expect(example.locator('.mw-content h1')).toHaveText('Morfira ©');
    await expect(example.getByRole('button', { name: t('Экспортировать Markdown', 'Export Markdown'), exact: true })).toBeEnabled();
    await summary.click();
    await expect(example).toHaveCount(0);
    await summary.click();
    await expect(example).toHaveCount(1);
    await expect(example.locator('.mw-content h1')).toHaveText('Morfira ©');
    expect(errors).toEqual([]);
  });
}
