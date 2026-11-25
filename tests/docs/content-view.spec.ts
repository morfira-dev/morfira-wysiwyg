import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`standalone saved content displays without an editor in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/content-view' : '/ru/content-view');
    const demo = page.locator('.content-view-example');
    const article = demo.locator('.mw-content-view');
    await expect(article).toContainText(t('Опубликованная статья', 'Published article'));
    await expect(demo.locator('.mw-editor,[contenteditable]')).toHaveCount(0);
    await expect(article.locator('img')).toHaveCount(0);
    await expect(article.locator('a')).not.toHaveAttribute('href');
    await expect(article.locator('h2')).toHaveCSS('border-top-width', '0px');
    await demo.getByRole('button', { name: t('Перезагрузить сохранённую копию', 'Reload saved copy') }).click();
    await expect(demo.getByRole('status')).toHaveText(t('Сохранённый контент отображён', 'Saved content displayed'));
    await demo.getByRole('button', { name: t('Показать сохранённый JSON', 'Show saved JSON') }).click();
    await expect(demo.locator('.content-view-json')).toContainText('"version": 1');
    await expect(demo.locator('.content-view-json')).toContainText('"src": "/logo.svg"');
    await demo.getByRole('checkbox', { name: t('Разрешить загрузку изображений', 'Allow image requests') }).check();
    await expect(article.locator('img')).toHaveAttribute('src', /\/logo\.svg$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
