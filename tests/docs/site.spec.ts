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

for (const english of [false, true]) test(`heading exit and block joins retain history on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  await page.getByLabel(t('Формат документа', 'Document format'), { exact: true }).selectOption('html');
  await page.getByLabel(t('Исходник документа', 'Document source'), { exact: true }).fill('<h2>Title</h2>');
  await page.getByRole('button', { name: t('Применить документ', 'Apply document'), exact: true }).click();
  await content.evaluate((root) => {
    const range = document.createRange();
    range.selectNodeContents(root.querySelector('h2')!);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    (root as HTMLElement).focus();
  });
  await page.keyboard.press('Enter');
  await expect(content.locator('h2')).toHaveText('Title');
  await expect(content.locator('p')).toHaveCount(1);
  await page.keyboard.type('Body');
  await expect(content.locator('p')).toHaveText('Body');
  await content.locator('p').evaluate((block) => {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await expect(content.locator('h2')).toHaveText('TitleBody');
  await expect(content.locator('p')).toHaveCount(0);
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(content.locator('p')).toHaveText('Body');
});

test('homepage exposes the complete laboratory, tables, theme and HTML/JSON', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Morfira WYSIWYG');
  await expect(page.getByRole('textbox', { name: 'Попробуйте Morfira', exact: true })).toBeVisible();
  await expect(page.getByText('Буфер диапазона · HTML / TSV', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Верхний индекс', exact: true })).toBeVisible();
  await sample(page, 'empty');
  await page.locator('.demo-inspector').getByRole('button', { name: 'Вставить таблицу', exact: true }).click();
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
  await page.getByRole('toolbar', { name: 'Форматирование', exact: true }).getByRole('button', { name: 'Полужирный', exact: true }).click(); await expect(page.locator('.mw-content strong')).toHaveText('Hello');
  await page.locator('.lab-block-controls').getByLabel('Формат блока', { exact: true }).selectOption('3'); await expect(page.locator('.mw-content h3')).toHaveText('Hello world');
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
  await page.locator('.demo-inspector').getByRole('button', { name: 'Вставить таблицу', exact: true }).click();
  await page.locator('.mw-content td').first().click();
  await page.locator('.lab-tables').getByRole('button', { name: 'Выделить диапазон', exact: true }).click();
  await expect(page.locator('.mw-content [data-mw-selected]')).toHaveCount(2);
  await page.locator('.lab-tables').getByRole('button', { name: 'Объединить', exact: true }).click();
  await expect(page.locator('.mw-content td[colspan="2"]')).toHaveCount(1);
  await page.locator('.lab-tables').getByRole('button', { name: 'Разделить', exact: true }).click();
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  await page.getByLabel('До строки', { exact: true }).fill('2');
  await page.locator('.lab-tables').getByRole('button', { name: 'Выделить диапазон', exact: true }).click();
  await page.getByLabel('Содержимое буфера', { exact: true }).fill('One\tTwo\nThree\tFour');
  await page.locator('.lab-data-grid').getByRole('button', { name: 'Вставить диапазон', exact: true }).click();
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
  await expect(page.getByRole('toolbar', { name: 'Formatting', exact: true }).getByRole('button', { name: 'Insert table', exact: true })).toBeDisabled();
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
    await expect(toolbar.getByRole('button', { name: english ? 'Indent list' : 'Увеличить отступ списка', exact: true })).toBeEnabled();
    await toolbar.getByRole('button', { name: english ? 'Indent list' : 'Увеличить отступ списка', exact: true }).click();
    await expect(page.locator('.mw-content > ul > li')).toHaveCount(2);
    await page.keyboard.press('Enter'); await page.keyboard.type(english ? 'New item' : 'Новый пункт');
    await expect(page.locator('.mw-content')).toContainText(english ? 'New item' : 'Новый пункт');
    await page.locator('.lab-block-controls').getByLabel(english ? 'Text alignment' : 'Выравнивание текста', { exact: true }).selectOption('right');
    await expect(page.locator('.mw-content [style*="text-align: right"]')).toHaveCount(1);
    await expect(page.locator('.lab-block-controls').getByLabel(english ? 'Text alignment' : 'Выравнивание текста', { exact: true })).toHaveValue('right');
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
  const readyList = page.getByRole('toolbar', { name: 'Форматирование', exact: true }).getByLabel('Формат списка', { exact: true });
  await expect(readyList).toHaveValue('mixed');
  await expect(readyList.locator('option:checked')).toHaveText('Разное');
});

for (const english of [false, true]) test(`colors and link forms preserve caret and drafts on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/');
  await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'styling', english);
  const colored = page.locator('.mw-content span').first();
  await colored.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); (element.closest('.mw-content') as HTMLElement).focus(); });
  await page.locator('.lab-color-controls').getByLabel(t('Цвет текста', 'Text color'), { exact: true }).fill('#00ff00');
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

for (const english of [false, true]) test(`image metadata, captions and undo work on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'images', english);
  await page.getByText(t('Ссылки и изображения', 'Links and images'), { exact: true }).click();
  const imageForm = page.locator('.demo-inspector .mw-image-form');
  await page.locator('.mw-content img').evaluate((image, label) => {
    image.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    [...document.querySelectorAll('label')].find((element) => element.textContent?.trim() === label)?.querySelector('input')?.focus();
  }, t('Ширина изображения', 'Image width'));
  await expect(imageForm.getByLabel(t('Ширина изображения', 'Image width'), { exact: true })).toHaveValue('160');
  await imageForm.getByLabel('Alt', { exact: true }).fill(t('Описание', 'Description'));
  await imageForm.getByLabel(t('Ширина изображения', 'Image width'), { exact: true }).fill('120');
  await imageForm.getByLabel(t('Высота изображения', 'Image height'), { exact: true }).fill('90');
  await imageForm.getByLabel(t('Подпись изображения', 'Image caption'), { exact: true }).fill(t('Новая подпись', 'New caption'));
  await imageForm.getByRole('button', { name: t('Обновить изображение', 'Update image'), exact: true }).click();
  await expect(page.locator('.mw-content img')).toHaveAttribute('width', '120');
  await expect(page.locator('.mw-content img')).toHaveAttribute('height', '90');
  await expect(page.locator('.mw-content img')).toHaveCSS('height', '90px');
  await expect(page.locator('.mw-content img')).toHaveAttribute('alt', t('Описание', 'Description'));
  await expect(page.locator('.mw-content figcaption')).toHaveText(t('Новая подпись', 'New caption'));
  await imageForm.getByLabel(t('URL изображения', 'Image URL'), { exact: true }).fill('javascript:evil()');
  await imageForm.getByRole('button', { name: t('Обновить изображение', 'Update image'), exact: true }).click();
  await expect(imageForm.getByRole('status')).toHaveText(t('Не удалось применить изменения. Проверьте URL, размеры и выделение изображения.', 'Unable to apply image changes. Check the image URL, dimensions and selection.')); await expect(page.locator('.mw-content img')).toHaveAttribute('src', '/logo.svg');
  await imageForm.getByRole('button', { name: t('Удалить изображение', 'Remove image'), exact: true }).click(); await expect(page.locator('.mw-content img')).toHaveCount(0);
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content figcaption')).toHaveText(t('Новая подпись', 'New caption'));
  await page.locator('.mw-content img').click();
  await page.locator('.demo-inspector details').first().locator('summary').click();
  await page.locator('.demo-workspace').screenshot({ path: `artifacts/images-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
});

for (const english of [false, true]) test(`image upload cancellation, result and file errors are visible in ${english ? 'English' : 'Russian'} demo`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'empty', english);
  await page.locator('.mw-content').click();
  await page.getByText(t('Ссылки и изображения', 'Links and images'), { exact: true }).click();
  const file = page.getByLabel(t('Файл изображения', 'Image file'), { exact: true });
  await file.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('local demo file') });
  await expect(page.getByRole('button', { name: t('Отменить загрузку', 'Cancel upload'), exact: true })).toBeEnabled();
  await page.getByRole('button', { name: t('Отменить загрузку', 'Cancel upload'), exact: true }).click();
  await expect(page.getByText(t('Загрузка отменена.', 'Upload cancelled.'), { exact: true })).toBeVisible(); await expect(page.locator('.mw-content img')).toHaveCount(0);
  await file.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('local demo file') });
  await expect(page.locator('.mw-content figure img')).toHaveAttribute('src', '/logo.svg');
  await expect(page.locator('.mw-content figcaption')).toHaveText(t('Демо результата callback загрузки', 'Demo upload callback result'));
  await expect(page.getByText(t('Изображение вставлено.', 'Image inserted.'), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content img')).toHaveCount(0);
  await file.setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('.mw-image-form [role=status]')).toHaveText(t('Не удалось загрузить изображение. Выберите поддерживаемый файл и повторите попытку.', 'Unable to upload this image. Choose a supported file and try again.')); await expect(page.locator('.mw-content img')).toHaveCount(0);
});

for (const english of [false, true]) test(`literal search, replacement forms and one-step undo on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'search', english);
  await page.locator('.lab-search summary').click();
  const panel = page.locator('.lab-search');
  await panel.getByLabel(t('Найти текст', 'Find text'), { exact: true }).fill('Morfira');
  await panel.getByLabel(t('Найти текст', 'Find text'), { exact: true }).press('Shift+Enter');
  await expect(panel.getByRole('status')).toHaveText(t('Совпадение 8 из 8', 'Match 8 of 8'));
  await expect(panel.getByLabel(t('Найти текст', 'Find text'), { exact: true })).toHaveAttribute('title', t('Enter: найти. Shift+Enter: предыдущее совпадение.', 'Enter: find. Shift+Enter: previous match.'));
  await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText(t('Совпадение 1 из 8', 'Match 1 of 8'));
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Morfira');
  await expect(page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: t('Следующее совпадение', 'Next match'), exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText(t('Совпадение 2 из 8', 'Match 2 of 8'));
  await panel.getByRole('button', { name: t('Предыдущее совпадение', 'Previous match'), exact: true }).click();
  await panel.getByLabel(t('Заменить на', 'Replace with'), { exact: true }).fill('<b>$&</b>');
  await panel.getByRole('button', { name: t('Заменить совпадение', 'Replace match'), exact: true }).click();
  await expect(page.locator('.mw-content strong').first()).toHaveText('<b>$&</b>'); await expect(page.locator('.mw-content b')).toHaveCount(0);
  await expect(panel.getByRole('status')).toHaveText(t('Заменено: 1', 'Replaced: 1'));
  await panel.getByLabel(t('Заменить на', 'Replace with'), { exact: true }).fill('Atlas');
  await panel.getByRole('button', { name: t('Заменить все', 'Replace all'), exact: true }).click();
  await expect(page.getByText(t('Заменено: 7', 'Replaced: 7'), { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText(t('Ничего не найдено.', 'No matches found.'));
  await expect(page.locator('.mw-content td[rowspan="2"]')).toHaveText('Atlas'); await expect(page.locator('.mw-content figcaption')).toHaveText('Atlas'); await expect(page.locator('.mw-content img')).toHaveCount(1);
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(panel.getByRole('status')).toContainText(t('из 7', 'of 7'));
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(panel.getByRole('status')).toContainText(t('из 8', 'of 8'));
  await page.locator('.demo-inspector details').first().locator('summary').click();
  await page.locator('.lab-statistics summary').click();
  await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click();
  await page.locator('.demo-workspace').screenshot({ path: `artifacts/search-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
});

for (const english of [false, true]) test(`search options, no results and read-only navigation on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'search', english);
  await page.locator('.lab-search summary').click(); const panel = page.locator('.lab-search');
  await panel.getByLabel(t('Целое слово', 'Whole word'), { exact: true }).check();
  await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click(); await expect(panel.getByRole('status')).toHaveText(t('Совпадение 1 из 7', 'Match 1 of 7'));
  await panel.getByLabel(t('Учитывать регистр', 'Match case'), { exact: true }).check();
  await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click(); await expect(panel.getByRole('status')).toHaveText(t('Совпадение 1 из 5', 'Match 1 of 5'));
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await panel.getByRole('button', { name: t('Следующее совпадение', 'Next match'), exact: true }).click(); await expect(panel.getByRole('status')).toHaveText(t('Совпадение 2 из 5', 'Match 2 of 5'));
  await expect(panel.getByRole('button', { name: t('Заменить все', 'Replace all'), exact: true })).toBeDisabled();
  await panel.getByLabel(t('Найти текст', 'Find text'), { exact: true }).fill('not present');
  await panel.getByRole('button', { name: t('Найти', 'Find'), exact: true }).click(); await expect(panel.getByRole('status')).toHaveText(t('Ничего не найдено.', 'No matches found.'));
  await panel.getByRole('button', { name: t('Очистить поиск', 'Clear search'), exact: true }).click(); await expect(panel.getByLabel(t('Найти текст', 'Find text'), { exact: true })).toHaveValue('');
});

for (const english of [false, true]) test(`Unicode document and selection statistics on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible();
  await sample(page, 'statistics', english); await expect(page.locator('.mw-content')).toContainText('👨‍👩‍👧‍👦');
  await page.getByLabel(t('Формат документа', 'Document format'), { exact: true }).selectOption('html');
  await page.getByLabel(t('Исходник документа', 'Document source'), { exact: true }).fill('<p><strong>e</strong>\u0301 👨‍👩‍👧‍👦 cat</p><p>dog</p><figure><img src="/logo.svg" alt="ignored words"><figcaption>caption</figcaption></figure><p><br></p>');
  await page.getByRole('button', { name: t('Применить документ', 'Apply document'), exact: true }).click();
  await page.locator('.lab-statistics summary').click(); const panel = page.locator('.lab-statistics');
  await expect(panel.locator('[data-stat="document-characters"]')).toHaveText('17'); await expect(panel.locator('[data-stat="document-compact"]')).toHaveText('15'); await expect(panel.locator('[data-stat="document-words"]')).toHaveText('4');
  await page.locator('.mw-content p').first().evaluate((element) => { const r = document.createRange(); r.selectNodeContents(element); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(r); (element.closest('.mw-content') as HTMLElement).focus(); });
  await expect(panel.locator('[data-stat="selection-characters"]')).toHaveText('7'); await expect(panel.locator('[data-stat="selection-words"]')).toHaveText('2');
  await expect(page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true })).toBeDisabled();
  await page.getByLabel(t('Исходник документа', 'Document source'), { exact: true }).fill('<p>New text</p>');
  await page.getByRole('button', { name: t('Применить документ', 'Apply document'), exact: true }).click();
  await expect(panel.locator('[data-stat="document-characters"]')).toHaveText('8'); await expect(panel.locator('[data-stat="document-words"]')).toHaveText('2');
});

for (const english of [false, true]) test(`Markdown block and inline typing with conversion history on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible();
  await page.locator('.lab-markdown summary').click(); const panel = page.locator('.lab-markdown');
  await panel.getByRole('button', { name: t('Начать с пустого абзаца', 'Start with an empty paragraph'), exact: true }).click();
  await page.keyboard.type('# '); await expect(page.locator('.mw-content h1')).toHaveCount(1);
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content p')).toHaveText('#');
  await page.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click(); await expect(page.locator('.mw-content h1')).toHaveCount(1);
  await page.keyboard.type(t('Заголовок', 'Heading')); await expect(page.locator('.mw-content h1')).toHaveText(t('Заголовок', 'Heading'));
  await panel.getByRole('button', { name: t('Начать с пустого абзаца', 'Start with an empty paragraph'), exact: true }).click();
  await page.keyboard.type('**bold**'); await expect(page.locator('.mw-content strong')).toHaveText('bold');
  await page.keyboard.type(' plain'); await expect(page.locator('.mw-content')).toHaveText('bold plain'); await expect(page.locator('.mw-content strong')).toHaveText('bold');
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content')).toHaveText('bold');
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content p')).toHaveText('**bold*');
  await page.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click(); await expect(page.locator('.mw-content strong')).toHaveText('bold');
  await page.locator('.demo-inspector details').first().locator('summary').click();
  await page.locator('.demo-workspace').screenshot({ path: `artifacts/markdown-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
});

for (const english of [false, true]) test(`Markdown literal samples, toggle and readonly on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'markdown', english);
  await expect(page.locator('.mw-content')).toContainText('**'); await expect(page.locator('.mw-content strong')).toHaveCount(0); await expect(page.locator('.mw-content h1')).toHaveCount(0);
  await page.locator('.lab-markdown summary').click(); const panel = page.locator('.lab-markdown');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await panel.getByLabel(t('Markdown при вводе', 'Markdown while typing'), { exact: true }).uncheck();
  await panel.getByRole('button', { name: t('Начать с пустого абзаца', 'Start with an empty paragraph'), exact: true }).click();
  await page.keyboard.type('**literal**'); await expect(page.locator('.mw-content')).toHaveText('**literal**'); await expect(page.locator('.mw-content strong')).toHaveCount(0);
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(panel.getByRole('button', { name: t('Начать с пустого абзаца', 'Start with an empty paragraph'), exact: true })).toBeDisabled();
  await panel.getByLabel(t('Markdown при вводе', 'Markdown while typing'), { exact: true }).check(); await expect(page.locator('.mw-content')).toHaveText('**literal**');
});

for (const english of [false, true]) test(`mentions and slash snippets support native keyboard, pointer and history on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible(); await sample(page, 'empty', english);
  await page.locator('.lab-suggestions summary').click(); const panel = page.locator('.lab-suggestions');
  await panel.getByLabel(t('Задержка, мс', 'Delay, ms'), { exact: true }).fill('0');
  await page.locator('.mw-content').click(); await page.keyboard.type('@an');
  await expect(page.getByRole('option', { name: /Anna Smith|Анна Смирнова/ })).toBeVisible();
  await page.keyboard.press('Enter'); await expect(page.locator('.mw-content')).toHaveText(t('@Анна Смирнова', '@Anna Smith'));
  await page.keyboard.type('works'); await expect(page.locator('.mw-content')).toHaveText(t('@Анна Смирнова works', '@Anna Smith works'));
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content')).toHaveText(t('@Анна Смирнова', '@Anna Smith'));
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content')).toHaveText('@an');
  await expect(page.getByRole('listbox', { name: t('Люди', 'People'), exact: true })).toBeHidden();
  await panel.getByRole('button', { name: t('Новый пример /sig', 'New /sig example'), exact: true }).click();
  await page.getByRole('option', { name: /Signature|Подпись/ }).click();
  await expect(page.locator('.mw-content')).toHaveText(t('С уважением, команда Morfira', 'Best regards, Morfira team'));
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click(); await expect(page.locator('.mw-content')).toHaveText('/sig');
  await panel.getByRole('button', { name: t('Открыть подсказки', 'Open suggestions'), exact: true }).click();
  await expect(page.getByRole('listbox', { name: t('Шаблоны', 'Snippets'), exact: true })).toBeVisible();
  await page.locator('.demo-inspector details').first().locator('summary').click();
  // Reopen after moving focus to the inspector; take proof with the live popup.
  await panel.getByRole('button', { name: t('Открыть подсказки', 'Open suggestions'), exact: true }).click();
  await expect(page.getByRole('option', { name: /Signature|Подпись/ })).toBeVisible();
  await page.locator('.demo-workspace').screenshot({ path: `artifacts/suggestions-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
});

for (const english of [false, true]) test(`suggestion empty/error/loading, cancellation and readonly on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(english ? '/en/' : '/'); await expect(page.locator('.mw-content')).toBeVisible();
  await page.locator('.lab-suggestions summary').click(); const panel = page.locator('.lab-suggestions');
  await panel.getByLabel(t('Задержка, мс', 'Delay, ms'), { exact: true }).fill('0');
  await panel.getByLabel(t('Ответ провайдера', 'Provider response'), { exact: true }).selectOption('error');
  await panel.getByRole('button', { name: t('Новый пример @an', 'New @an example'), exact: true }).click();
  await expect(page.getByText(t('Ошибка поиска людей', 'People lookup failed'), { exact: true })).toBeVisible(); await expect(page.locator('.mw-content')).toHaveText('@an');
  await panel.getByLabel(t('Ответ провайдера', 'Provider response'), { exact: true }).selectOption('empty');
  await panel.getByRole('button', { name: t('Новый пример @an', 'New @an example'), exact: true }).click();
  await expect(page.getByText(t('Люди не найдены', 'No people found'), { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await panel.getByLabel(t('Ответ провайдера', 'Provider response'), { exact: true }).selectOption('normal');
  await panel.getByLabel(t('Задержка, мс', 'Delay, ms'), { exact: true }).fill('1000');
  await panel.getByRole('button', { name: t('Новый пример @an', 'New @an example'), exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText(t('Загрузка вариантов…', 'Loading choices…'));
  await panel.getByRole('button', { name: t('Закрыть подсказки', 'Close suggestions'), exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText(t('Подсказки закрыты', 'Suggestions closed')); await expect(page.locator('.mw-content')).toHaveText('@an');
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(panel.getByRole('button', { name: t('Открыть подсказки', 'Open suggestions'), exact: true })).toBeDisabled();
  await expect(page.getByRole('listbox', { name: t('Люди', 'People'), exact: true })).toBeHidden();
});

for (const english of [false, true]) test(`structural slash headings and tables keep one-step history on ${english ? 'English' : 'Russian'} homepage`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/' : '/');
  await expect(page.locator('.mw-content')).toBeVisible();
  await page.locator('.lab-suggestions summary').click();
  const panel = page.locator('.lab-suggestions');
  const suggestions = page.getByRole('listbox', { name: t('Шаблоны', 'Snippets'), exact: true });
  await panel.getByLabel(t('Задержка, мс', 'Delay, ms'), { exact: true }).fill('0');
  await panel.getByRole('button', { name: t('Новый пример /h2', 'New /h2 example'), exact: true }).click();
  await expect(suggestions.getByRole('option', { name: /Заголовок 2|Heading 2/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mw-content h2')).toHaveCount(1);
  // One real key avoids coupling command-history proof to the 600ms typing-burst window.
  await page.keyboard.type('H');
  await expect(page.locator('.mw-content h2')).toHaveText('H');
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(page.locator('.mw-content p')).toHaveText('/h2');
  await panel.getByRole('button', { name: t('Новый пример /table', 'New /table example'), exact: true }).click();
  await suggestions.getByRole('option', { name: /Таблица 3 × 3|Table 3 × 3/ }).click();
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  await page.keyboard.type('C');
  await expect(page.locator('.mw-content td').first()).toHaveText('C');
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await page.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(page.locator('.mw-content p')).toHaveText('/table');
  await expect(page.locator('.mw-content table')).toHaveCount(0);
  await panel.getByRole('button', { name: t('Открыть подсказки', 'Open suggestions'), exact: true }).click();
  await expect(suggestions.getByRole('option', { name: /Таблица 3 × 3|Table 3 × 3/ })).toBeVisible();
  await page.locator('.demo-inspector details').first().locator('summary').click();
  await panel.getByRole('button', { name: t('Открыть подсказки', 'Open suggestions'), exact: true }).click();
  await page.locator('.demo-workspace').screenshot({ path: `artifacts/structural-slash-${english ? 'en' : 'ru'}.png`, style: '.VPNav { visibility: hidden !important; }' });
});

for (const english of [false, true]) test(`performance guide documents explicit tools without mounting an editor in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(english ? '/en/performance' : '/performance');
  await expect(page.locator('.vp-doc h1')).toContainText(english ? 'Performance and history' : 'Производительность и история');
  await expect(page.locator('.vp-doc')).toContainText('pnpm run benchmark');
  await expect(page.locator('.vp-doc')).toContainText('nativeDispatch');
  await expect(page.locator('.mw-editor')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const english of [false, true]) test(`security guide explains deployment boundaries in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(english ? '/en/security' : '/security');
  const article = page.locator('.vp-doc');
  await expect(article.locator('h1')).toHaveText(english ? 'Security and trust boundaries' : 'Безопасность и границы доверия');
  await expect(article).toContainText("require-trusted-types-for 'script'");
  await expect(article).toContainText('style-src-attr');
  await expect(article).toContainText('SSRF');
  await expect(article.getByRole('link', { name: 'MDN: style-src-attr', exact: true })).toHaveAttribute('href', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr');
  await expect(page.locator('.mw-editor')).toHaveCount(0);
  expect(errors).toEqual([]);
});
