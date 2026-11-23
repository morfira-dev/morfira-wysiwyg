import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  const t = (ru: string, en: string) => english ? en : ru;
  test(`media/formula guide keeps previews external and supports localized modal actions (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/^https:\/\/(?:www\.youtube-nocookie\.com|player\.vimeo\.com)\//, async (route) => {
      requests.push(route.request().url());
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Intercepted video</title>' });
    });
    await page.goto(english ? '/en/media-formula' : '/media-formula');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('Медиа и формулы', 'Media and formulas'));
    const demo = page.locator('.media-formula-example');
    const sample = demo.getByRole('button', { name: t('Загрузить пример', 'Load sample'), exact: true });
    await expect(sample).toBeEnabled();
    const output = demo.getByRole('textbox', { name: t('HTML media и формул', 'Media and formula HTML'), exact: true });
    const content = demo.locator('.mw-content');
    const atoms = content.locator('[data-mw-node="morfira:formula"]');
    await expect(atoms).toHaveCount(1);
    await expect(atoms).toHaveText('\\frac{1}{2}+x^2');
    await expect(demo.locator('.formula-preview-host math mfrac')).toHaveCount(1);
    await expect(content.locator('math,iframe')).toHaveCount(0);
    await expect(output).not.toHaveValue(/<math|<iframe|contenteditable/);
    await expect(demo.locator('iframe')).toHaveCount(0);
    expect(requests).toEqual([]);

    const load = demo.getByRole('button', { name: t('Загрузить внешнее видео', 'Load external video'), exact: true });
    await expect(load).toBeVisible();
    await load.click();
    await expect(demo.locator('.media-preview-host iframe')).toHaveCount(1);
    await expect.poll(() => requests.length).toBe(1);
    await expect(demo.locator('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0');
    await expect(output).not.toHaveValue(/<iframe/);
    await demo.getByRole('button', { name: t('Выгрузить внешнее видео', 'Unload external video'), exact: true }).click();
    await expect(demo.locator('iframe')).toHaveCount(0);

    await demo.getByRole('button', { name: t('Вставить формулу', 'Insert formula'), exact: true }).click();
    const formulaDialog = demo.getByRole('dialog', { name: t('Формула', 'Formula'), exact: true });
    await expect(formulaDialog).toBeVisible();
    const source = formulaDialog.getByRole('textbox', { name: t('Исходник формулы', 'Formula source'), exact: true });
    await source.fill('z^3');
    await formulaDialog.getByRole('button', { name: t('Применить формулу', 'Apply formula'), exact: true }).click();
    await expect(formulaDialog).not.toBeVisible();
    await expect(atoms).toHaveCount(2);
    await expect(atoms.last()).toHaveText('z^3');

    await demo.getByRole('button', { name: t('Изменить формулу', 'Edit formula'), exact: true }).click();
    await expect(source).toHaveValue('\\frac{1}{2}+x^2');
    await source.fill('\\sqrt{x}');
    await formulaDialog.getByRole('button', { name: t('Применить формулу', 'Apply formula'), exact: true }).click();
    await expect(atoms.first()).toHaveText('\\sqrt{x}');
    await expect(demo.locator('.formula-preview-host math msqrt')).toHaveCount(1);
    const beforeCancel = await output.inputValue();
    await demo.getByRole('button', { name: t('Изменить формулу', 'Edit formula'), exact: true }).click();
    await source.fill('cancelled');
    await formulaDialog.getByRole('button', { name: t('Закрыть формулу', 'Close formula'), exact: true }).click();
    await expect(formulaDialog).not.toBeVisible();
    await expect(output).toHaveValue(beforeCancel);

    await demo.getByRole('button', { name: t('Вставить видео', 'Insert video'), exact: true }).click();
    const mediaDialog = demo.getByRole('dialog', { name: t('Видео и медиа', 'Video and media'), exact: true });
    await expect(mediaDialog).toBeVisible();
    await expect(mediaDialog.getByRole('textbox', { name: t('Адрес медиа', 'Media URL'), exact: true })).toBeVisible();
    await mediaDialog.getByRole('button', { name: t('Закрыть форму медиа', 'Close media form'), exact: true }).click();
    await expect(mediaDialog).not.toBeVisible();
    await expect(output).toHaveValue(beforeCancel);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test(`homepage media/formula editor mounts only while its optional section is open (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(english ? '/en/' : '/');
    const optional = page.locator('.home-optional-examples');
    const summary = optional.locator('summary').filter({ hasText: t('Видео и математические формулы', 'Video and mathematical formulas') });
    const example = optional.locator('.media-formula-example');
    await expect(summary).toBeVisible();
    await expect(example).toHaveCount(0);
    await summary.click();
    await expect(example.locator('.mw-content [data-mw-node="morfira:formula"]')).toHaveText('\\frac{1}{2}+x^2');
    await expect(example.locator('.formula-preview-host math mfrac')).toHaveCount(1);
    await expect(example.getByRole('button', { name: t('Вставить формулу', 'Insert formula'), exact: true })).toBeEnabled();
    await expect(example.locator('iframe')).toHaveCount(0);
    await summary.click();
    await expect(example).toHaveCount(0);
    await summary.click();
    await expect(example).toHaveCount(1);
    await expect(example.locator('.mw-content [data-mw-node="morfira:formula"]')).toHaveText('\\frac{1}{2}+x^2');
    await expect(example.locator('.formula-preview-host math mfrac')).toHaveCount(1);
    await expect(example.locator('iframe')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
