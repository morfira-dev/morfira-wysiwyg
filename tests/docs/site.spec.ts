import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const sample = async (page: Page, value: string, english = false) => {
  await page.getByLabel(english ? 'Document sample' : 'Пример документа', { exact: true }).selectOption(value);
  await page.getByRole('button', { name: english ? 'Load sample' : 'Загрузить пример', exact: true }).click();
};
const replaceHTML = async (page: Page, value: string) => {
  await page.getByLabel('Формат документа', { exact: true }).selectOption('html');
  await page.getByLabel('Исходник документа', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Применить документ', exact: true }).click();
};

test('homepage exposes the complete laboratory, tables, theme and HTML/JSON', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Morfira WYSIWYG');
  await expect(page.getByRole('textbox', { name: 'Попробуйте Morfira', exact: true })).toBeVisible();
  await expect(page.getByText('Буфер диапазона · HTML / TSV', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Верхний индекс', exact: true })).toBeVisible();
  await sample(page, 'empty');
  await page.getByRole('button', { name: 'Вставить таблицу', exact: true }).click();
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  await page.getByRole('button', { name: 'Сменить тему', exact: true }).click();
  await expect(page.locator('.demo-shell')).toHaveClass(/dark-demo/);
  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  await expect(page.getByLabel('Исходник документа', { exact: true })).toHaveValue(/<table/);
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.getByLabel('Исходник документа', { exact: true })).toHaveValue(/"version": 1/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/docs-preview.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('full demo formats text, changes blocks and inserts a checked link and local image', async ({ page }) => {
  await page.goto('/playground'); await replaceHTML(page, '<p>Hello world</p>');
  const content = page.getByRole('textbox', { name: 'Попробуйте Morfira', exact: true });
  await content.focus();
  await content.evaluate((element) => {
    const range = document.createRange(); const text = element.querySelector('p')!.firstChild!;
    range.setStart(text, 0); range.setEnd(text, 5);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Hello');
  await page.getByRole('button', { name: 'Полужирный', exact: true }).click(); await expect(page.locator('.mw-content strong')).toHaveText('Hello');
  await page.getByLabel('Формат блока', { exact: true }).selectOption('3'); await expect(page.locator('.mw-content h3')).toHaveText('Hello world');
  await content.focus();
  await content.evaluate((element) => {
    const range = document.createRange(); const text = element.querySelector('h3 strong')!.firstChild!;
    range.setStart(text, 0); range.setEnd(text, 5);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByText('Ссылки и изображения', { exact: true }).click();
  await page.getByLabel('Адрес ссылки', { exact: true }).fill('https://example.com/article');
  await page.getByRole('button', { name: 'Создать ссылку', exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', 'https://example.com/article');
  await page.getByRole('button', { name: 'Вставить изображение', exact: true }).click();
  await expect(page.locator('.mw-content img')).toHaveAttribute('src', '/logo.svg');
});

test('table controls preserve a range while using forms, merge/split and paste TSV', async ({ page }) => {
  await page.goto('/playground'); await sample(page, 'empty');
  await page.getByRole('button', { name: 'Вставить таблицу', exact: true }).click();
  await page.locator('.mw-content td').first().click();
  await page.getByRole('button', { name: 'Выделить диапазон', exact: true }).click();
  await expect(page.locator('.mw-content [data-mw-selected]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Объединить', exact: true }).click();
  await expect(page.locator('.mw-content td[colspan="2"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Разделить', exact: true }).click();
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  await page.getByLabel('До строки', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Выделить диапазон', exact: true }).click();
  await page.getByLabel('Содержимое буфера', { exact: true }).fill('One\tTwo\nThree\tFour');
  await page.getByRole('button', { name: 'Вставить диапазон', exact: true }).click();
  await expect(page.locator('.mw-content td').first()).toHaveText('One');
  await expect(page.locator('.mw-content tr').nth(1).locator('td').nth(1)).toHaveText('Four');
});

test('invalid JSON is rejected visibly without altering the editor', async ({ page }) => {
  await page.goto('/playground'); const before = await page.locator('.mw-content').innerHTML();
  await page.getByLabel('Формат документа', { exact: true }).selectOption('json');
  await page.getByLabel('Исходник документа', { exact: true }).fill('{"version":99,"children":[]}');
  await page.getByRole('button', { name: 'Применить документ', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); expect(await page.locator('.mw-content').innerHTML()).toBe(before);
});

test('English homepage and lab localize controls and support readonly', async ({ page }) => {
  await page.goto('/en/'); await expect(page.getByText('Try everything that works today.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Buffer contents', { exact: true })).toBeVisible();
  await page.goto('/en/guide'); await expect(page.getByRole('heading', { name: /^Getting started/ })).toBeVisible();
  await page.goto('/en/playground'); await page.getByRole('button', { name: 'Read only', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Try Morfira', exact: true })).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Insert table', exact: true })).toBeDisabled();
});

for (const route of ['/', '/playground', '/en/']) {
  test(`mobile full laboratory has no horizontal page overflow: ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(route);
    await expect(page.locator('.mw-content')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const english of [false, true]) {
  test(`homepage list sample exposes nesting, format controls and localized toolbar: ${english ? 'en' : 'ru'}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(english ? '/en/' : '/'); await sample(page, 'lists', english);
    const toolbar = page.getByRole('toolbar', { name: english ? 'Formatting' : 'Форматирование', exact: true });
    await expect(toolbar).toBeVisible(); await expect(page.locator('.mw-content ul > li > ol')).toHaveCount(1);
    await page.locator('.mw-content > ul > li').nth(1).evaluate((item) => { const range = document.createRange(); range.selectNodeContents(item); range.collapse(true); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range); });
    await expect(toolbar.getByRole('button', { name: english ? 'Indent list' : 'Увеличить отступ', exact: true })).toBeEnabled();
    await toolbar.getByRole('button', { name: english ? 'Indent list' : 'Увеличить отступ', exact: true }).click();
    await expect(page.locator('.mw-content > ul > li')).toHaveCount(2);
    await page.keyboard.press('Enter'); await page.keyboard.type(english ? 'New item' : 'Новый пункт');
    await expect(page.locator('.mw-content')).toContainText(english ? 'New item' : 'Новый пункт');
    await page.getByLabel(english ? 'Text alignment' : 'Выравнивание текста', { exact: true }).selectOption('right');
    await expect(page.locator('.mw-content [style*="text-align: right"]')).toHaveCount(1);
    await expect(page.getByLabel(english ? 'Text alignment' : 'Выравнивание текста', { exact: true })).toHaveValue('right');
    await sample(page, 'lists', english);
    await page.locator('.mw-content > ul > li').nth(1).click();
    await page.screenshot({ path: `artifacts/lists-home-${english ? 'en' : 'ru'}.png`, fullPage: true });
    await page.locator('.demo-editing').screenshot({ path: `artifacts/lists-editor-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
    expect(errors).toEqual([]);
  });
}

test('homepage dropdowns retain a multi-paragraph range and show mixed list state', async ({ page }) => {
  await page.goto('/'); await replaceHTML(page, '<p>A</p><p>B</p><p>C</p>');
  await page.locator('.mw-content').evaluate((root) => { const range = document.createRange(); const blocks = root.querySelectorAll('p'); range.setStart(blocks[0].firstChild!, 0); range.setEnd(blocks[1].firstChild!, 1); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range); });
  await page.getByLabel('Тип списка', { exact: true }).selectOption('ordered');
  await expect(page.locator('.mw-content > ol > li')).toHaveCount(2); await expect(page.locator('.mw-content > p')).toHaveText('C');
  await page.locator('.mw-content').evaluate((root) => { const range = document.createRange(); range.selectNodeContents(root); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range); });
  await expect(page.getByLabel('Тип списка', { exact: true })).toHaveValue('mixed');
  await expect(page.getByRole('button', { name: 'Нумерованный список', exact: true })).toHaveAttribute('aria-pressed', 'mixed');
});

for (const english of [false, true]) test(`colors and link forms preserve caret and drafts on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/');
  await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'styling', english);
  const colored = page.locator('.mw-content span').first();
  await colored.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); (element.closest('.mw-content') as HTMLElement).focus(); });
  await page.getByLabel(t('Цвет текста', 'Text color'), { exact: true }).fill('#00ff00');
  await page.getByRole('button', { name: t('Применить цвет', 'Apply color'), exact: true }).click();
  await expect(page.locator('.mw-content span').first()).toHaveCSS('color', 'rgb(0, 255, 0)');
  await page.getByRole('button', { name: t('Сбросить цвет', 'Reset color'), exact: true }).click();
  expect(await page.locator('.mw-content').innerHTML()).not.toContain('rgb(0, 255, 0)');
  await page.locator('.mw-content a').evaluate((anchor) => { const range = document.createRange(); range.setStart(anchor.firstChild!, 3); range.collapse(true); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); (anchor.closest('.mw-content') as HTMLElement).focus(); });
  await page.getByText(t('Ссылки и изображения', 'Links and images'), { exact: true }).click();
  await expect(page.getByLabel(t('Адрес ссылки', 'Link URL'), { exact: true })).toHaveValue('https://example.com');
  await page.getByLabel(t('Адрес ссылки', 'Link URL'), { exact: true }).fill('/updated');
  await page.getByLabel(t('Заголовок ссылки', 'Link title'), { exact: true }).fill('Updated title');
  await page.getByRole('button', { name: t('Обновить ссылку', 'Update link'), exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', '/updated');
  await expect(page.locator('.mw-content a')).toHaveAttribute('title', 'Updated title');
  await expect(page.locator('.mw-content a')).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await page.evaluate(() => window.getSelection()?.anchorOffset)).toBe(3);
  await page.locator('.demo-inspector details').first().locator('summary').click();
  await page.locator('.demo-workspace').screenshot({ path: `artifacts/colors-links-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
});
