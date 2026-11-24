import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const replaceDocument = async (page: Page, value: string, english: boolean) => {
  await page.getByLabel(english ? 'Document format' : 'Формат документа', { exact: true }).selectOption('html');
  await page.getByLabel(english ? 'Document source' : 'Исходник документа', { exact: true }).fill(value);
  await page.getByRole('button', { name: english ? 'Apply document' : 'Применить документ', exact: true }).click();
};
const select = async (page: Page, selector: string, from = 0, length = 0) => {
  await page.locator('.mw-content').evaluate((root, { selector, from, length }) => {
    const element = root.querySelector(selector)!;
    const text = element.firstChild;
    const range = document.createRange();
    if (text?.nodeType === 3) {
      range.setStart(text, from);
      range.setEnd(text, from + length);
    }
    else {
      range.selectNodeContents(element);
      range.collapse(true);
    }
    (root as HTMLElement).focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  }, { selector, from, length });
};

for (const english of [false, true]) {
  const t = (ru: string, en: string) => english ? en : ru;
  test(`ready homepage toolbar composes link, table and search panels with history in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(english ? '/' : '/ru/');
    const ui = page.locator('.mw-standard-editor-ui');
    const toolbar = ui.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    const panel = ui.locator('.mw-ui-panel');
    const content = page.locator('.mw-content');
    await expect(toolbar).toBeVisible();
    await replaceDocument(page, '<p>A<strong>word</strong>Z</p>', english);
    await select(page, 'strong', 0, 4);
    await toolbar.locator('[data-mw-ui-action="link"]').click();
    await expect(panel).toBeVisible();
    await panel.getByLabel(t('Адрес ссылки', 'Link URL'), { exact: true }).fill('https://example.com/ready-ui');
    await panel.getByRole('button', { name: t('Создать ссылку', 'Create link'), exact: true }).click();
    await expect(content.locator('a')).toHaveText('word');
    await expect(content.locator('a')).toHaveAttribute('href', 'https://example.com/ready-ui');
    await expect(content.locator('strong')).toHaveText('word');
    await panel.getByRole('button', { name: t('Закрыть панель', 'Close panel'), exact: true }).click();
    await toolbar.locator('[data-mw-ui-action="undo"]').click();
    await expect(content.locator('a')).toHaveCount(0);
    await expect(content.locator('strong')).toHaveText('word');
    await toolbar.locator('[data-mw-ui-action="redo"]').click();
    await expect(content.locator('a')).toHaveAttribute('href', 'https://example.com/ready-ui');

    await replaceDocument(page, '<p><br></p>', english);
    await select(page, 'p');
    await toolbar.locator('[data-mw-ui-action="table"]').click();
    const tableForm = panel.locator('.mw-table-form');
    await tableForm.getByLabel(t('Строки таблицы', 'Table rows'), { exact: true }).fill('2');
    await tableForm.getByLabel(t('Столбцы таблицы', 'Table columns'), { exact: true }).fill('2');
    await tableForm.getByRole('button', { name: t('Вставить таблицу', 'Insert table'), exact: true }).click();
    await expect(content.locator('td')).toHaveCount(4);
    await expect(panel).toBeHidden();
    await toolbar.locator('[data-mw-ui-action="undo"]').click();
    await expect(content.locator('table')).toHaveCount(0);

    await replaceDocument(page, '<p>word word</p>', english);
    await toolbar.locator('[data-mw-ui-action="search"]').click();
    await panel.getByLabel(t('Найти текст', 'Find text'), { exact: true }).fill('word');
    await panel.getByLabel(t('Заменить на', 'Replace with'), { exact: true }).fill('term');
    await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText(t('Совпадение 1 из 2', 'Match 1 of 2'));
    await panel.getByRole('button', { name: t('Заменить все', 'Replace all'), exact: true }).click();
    await expect(content).toHaveText('term term');
    await toolbar.locator('[data-mw-ui-action="undo"]').click();
    await expect(content).toHaveText('word word');
    expect(errors).toEqual([]);
  });

  test(`ready playground wraps at narrow width with keyboard, themes and read-only in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(english ? '/playground' : '/ru/playground');
    const ui = page.locator('.mw-standard-editor-ui');
    const toolbar = ui.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    const panel = ui.locator('.mw-ui-panel');
    const content = page.locator('.mw-content');
    await expect(toolbar).toBeVisible();
    await ui.evaluate((element) => (element as HTMLElement).style.setProperty('--mw-ui-font-size', '18px'));
    await replaceDocument(page, '<p>abcd</p>', english);
    await select(page, 'p', 0, 2);
    const bold = toolbar.locator('[data-mw-ui-action="bold"]');
    await bold.click();
    await expect(content.locator('strong')).toHaveText('ab');
    await bold.focus();
    await bold.press('Home');
    await expect(toolbar.locator('[data-mw-ui-action="undo"]')).toBeFocused();
    const block = toolbar.locator('[data-mw-ui-action="block"]');
    await block.focus();
    await block.press('Alt+ArrowRight');
    await expect(toolbar.locator('[data-mw-ui-action="list"]')).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('.demo-workspace').screenshot({ path: `artifacts/ready-ui-narrow-light-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });

    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(content).toHaveAttribute('contenteditable', 'false');
    await expect(bold).toBeDisabled();
    await expect(toolbar.locator('[data-mw-ui-action="block"]')).toBeDisabled();
    await expect(toolbar.locator('[data-mw-ui-action="search"]')).toBeEnabled();
    await toolbar.locator('[data-mw-ui-action="search"]').click();
    await panel.getByLabel(t('Найти текст', 'Find text'), { exact: true }).fill('ab');
    await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText(t('Совпадение 1 из 1', 'Match 1 of 1'));
    await expect(panel.getByRole('button', { name: t('Заменить все', 'Replace all'), exact: true })).toBeDisabled();
    await panel.getByLabel(t('Найти текст', 'Find text'), { exact: true }).press('Escape');
    await expect(panel).toBeHidden();
    await expect(toolbar.locator('[data-mw-ui-action="search"]')).toBeFocused();
    await page.getByRole('button', { name: t('Сменить тему', 'Toggle theme'), exact: true }).click();
    await expect(page.locator('.demo-shell')).toHaveClass(/dark-demo/);
    await expect(content.locator('strong')).toHaveText('ab');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('.demo-workspace').screenshot({ path: `artifacts/ready-ui-narrow-dark-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
  });
}
