import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`print demo requests only a validated reading snapshot in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/playground' : '/ru/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-reading');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: t('Загрузить пример чтения', 'Load reading sample'), exact: true }).click();
  await expect(content.locator('h2').first()).toHaveText(t('План документа', 'Document plan'));
  const before = await content.evaluate((node) => node.innerHTML);
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await page.evaluate(() => {
    const original = window.print;
    window.print = () => {
      const surface = document.querySelector('[data-mw-print-surface]');
      document.body.dataset.docsPrintSnapshot = JSON.stringify({
        exists: Boolean(surface),
        directBody: surface?.parentElement === document.body,
        text: surface?.textContent,
        images: surface?.querySelectorAll('img').length,
        navigation: surface?.querySelectorAll('[href],[src],[srcset]').length,
        merged: surface?.querySelector('th')?.getAttribute('colspan'),
        active: document.body.hasAttribute('data-mw-print-active'),
        chrome: surface?.querySelectorAll('button,.mw-toolbar').length,
      });
      window.print = original;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  const print = panel.getByRole('button', { name: t('Печать', 'Print'), exact: true });
  await expect(print).toBeEnabled();
  await print.click();
  const snapshot = await page.evaluate(() => JSON.parse(document.body.dataset.docsPrintSnapshot!));
  expect(snapshot).toMatchObject({ exists: true, directBody: true, images: 0, navigation: 0, merged: '2', active: true, chrome: 0 });
  expect(snapshot.text).toContain(t('План документа', 'Document plan'));
  expect(snapshot.text).toContain(t('Изображение примера', 'Sample image'));
  expect(await content.evaluate((node) => node.innerHTML)).toBe(before);
  await expect(page.locator('[data-mw-print-surface]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-mw-print-active');
  await expect(panel.locator('[data-print-hint]')).toContainText(t('настоящий диалог', 'actual browser dialog'));
  await expect(panel.getByRole('link', { name: t('Подключение печати', 'Print setup'), exact: true })).toHaveAttribute('href', english ? '/print' : '/ru/print');
});
