import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './ui-images.types.js';

const initialize = async (page: Page, html = '<p><strong>abcd</strong></p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    window.dispose();
    const editorHost = document.createElement('div');
    editorHost.className = 'image-form-editor';
    const formHost = document.createElement('div');
    formHost.className = 'image-form-host';
    document.body.append(editorHost, formHost);
    window.imageFormSignals = [];
    window.imageFormCompleters = [];
    window.imageFormFailures = [];
    window.changes = [];
    window.editor = window.createEditor(editorHost, {
      value,
      plugins: [window.createImages({ upload: (_file, { signal }) => {
        window.imageFormSignals.push(signal);
        return new Promise((resolve) => window.imageFormCompleters.push(resolve));
      } })],
      onChange: (change) => window.changes.push(change),
    });
    window.editor.setSelection(2);
    window.imageForm = createImageForm(formHost, window.editor, {
      initialValues: { src: '/logo.svg' },
      onError: (error) => window.imageFormFailures.push(String(error)),
    });
  }, html);
};
const content = (page: Page) => page.locator('.image-form-editor .mw-content');
const upload = (page: Page) => page.getByLabel('Файл изображения', { exact: true }).setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: Buffer.from('png') });

test('image form restores rich selection through field focus and inserts one undoable image', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Alt', { exact: true }).fill('A <literal>');
  await page.getByLabel('Ширина изображения', { exact: true }).fill('80');
  await page.getByLabel('Высота изображения', { exact: true }).fill('60');
  await page.getByLabel('Подпись изображения', { exact: true }).fill('<b>Caption</b>');
  await page.getByRole('button', { name: 'Вставить изображение', exact: true }).click();
  await expect(content(page).locator(':scope > p strong')).toHaveText(['ab', 'cd']);
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'A <literal>');
  await expect(content(page).locator('img')).toHaveAttribute('width', '80');
  await expect(content(page).locator('figcaption')).toHaveText('<b>Caption</b>');
  await expect(content(page).locator('figcaption b')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><strong>abcd</strong></p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.evaluate(() => window.editor.redo());
  await expect(content(page).locator('img')).toHaveCount(1);
});

test('selected image metadata populates once, preserves drafts and update/remove retain history', async ({ page }) => {
  await initialize(page, '<figure><img src="/logo.svg" alt="Original" width="80" height="60"><figcaption>Caption</figcaption></figure><p>Tail</p>');
  await content(page).locator('img').evaluate((image) => {
    image.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.querySelector<HTMLInputElement>('.mw-image-form input')!.focus();
  });
  await expect(page.getByLabel('Alt', { exact: true })).toHaveValue('Original');
  await page.getByLabel('Alt', { exact: true }).fill('Edited');
  await page.getByLabel('Ширина изображения', { exact: true }).fill('');
  await page.getByLabel('Подпись изображения', { exact: true }).fill('New caption');
  await page.evaluate(() => window.imageForm.refresh());
  await expect(page.getByLabel('Alt', { exact: true })).toHaveValue('Edited');
  await page.getByRole('button', { name: 'Обновить изображение', exact: true }).click();
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Edited');
  expect(await content(page).locator('img').getAttribute('width')).toBeNull();
  await expect(content(page).locator('figcaption')).toHaveText('New caption');
  await page.getByRole('button', { name: 'Удалить изображение', exact: true }).click();
  await expect(content(page).locator('img')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Edited');
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Original');
  await content(page).locator('figcaption').evaluate((caption) => {
    const range = document.createRange();
    range.selectNodeContents(caption);
    range.collapse(false);
    (caption.closest('.mw-content') as HTMLElement).focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.type('!');
  await expect(page.getByLabel('Подпись изображения', { exact: true })).toHaveValue('Caption!');
});

test('field focus retains an empty paragraph inside a merged table cell', async ({ page }) => {
  const original = '<table><tbody><tr><td rowspan="2"><p><br></p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p>Tail</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const paragraph = window.editor.surface.querySelector('td p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(true);
    window.editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.imageForm.refresh();
  });
  await page.getByLabel('Alt', { exact: true }).fill('Merged');
  await page.getByRole('button', { name: 'Вставить изображение', exact: true }).click();
  await expect(content(page).locator('td[rowspan="2"] img')).toHaveAttribute('alt', 'Merged');
  await expect(content(page).locator('tr')).toHaveCount(2);
  await expect(content(page).locator(':scope > p')).toHaveText('Tail');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => {
    const anchor = document.getSelection()!.anchorNode!;
    const element = anchor.nodeType === 1 ? anchor as Element : anchor.parentElement!;
    return element.closest('td') === window.editor.surface.querySelector('td');
  })).toBe(true);
});

test('invalid dimensions retain drafts and errors localize without exposing raw diagnostics', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Ширина изображения', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Вставить изображение', exact: true }).click();
  await expect(content(page).locator('img')).toHaveCount(0);
  await expect(page.getByLabel('Ширина изображения', { exact: true })).toHaveValue('0');
  await expect(page.locator('.mw-image-form [role="status"]')).toContainText('Не удалось применить');
  expect(await page.evaluate(() => window.imageFormFailures[0])).toContain('Image dimensions');
  await page.evaluate(() => window.editor.setLocale('en', { 'ui.images.insert': '<b>Insert</b>' }));
  await expect(page.getByRole('button', { name: '<b>Insert</b>', exact: true })).toBeVisible();
  await expect(page.locator('.mw-image-form button b')).toHaveCount(0);
  await expect(page.locator('.mw-image-form [role="status"]')).toContainText('Unable to apply');
  await expect(page.getByLabel('Image width', { exact: true })).toHaveValue('0');
  await page.getByLabel('Image width', { exact: true }).fill('80');
  await page.getByRole('button', { name: '<b>Insert</b>', exact: true }).click();
  await expect(content(page).locator('img')).toHaveAttribute('width', '80');
});

test('external replacement invalidates old targets and read-only permits draft inspection only', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Alt', { exact: true }).fill('Draft');
  await page.evaluate(() => window.editor.setHTML('<p>External</p>'));
  await page.getByRole('button', { name: 'Вставить изображение', exact: true }).click();
  await expect(content(page)).toHaveText('External');
  await expect(content(page).locator('img')).toHaveCount(0);
  await expect(page.locator('.mw-image-form [role="status"]')).toContainText('Выберите место');
  await page.evaluate(() => { window.editor.setSelection(8); window.editor.setReadOnly(true); });
  await expect(page.getByRole('button', { name: 'Вставить изображение', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Alt', { exact: true })).toBeDisabled();
  await page.evaluate(() => window.editor.setLocale('en'));
  await expect(page.getByRole('button', { name: 'Insert image', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('disposing the form cancels only its upload and leaves a newer application upload active', async ({ page }) => {
  await initialize(page);
  await upload(page);
  await expect.poll(() => page.evaluate(() => window.imageFormSignals.length)).toBe(1);
  await page.evaluate(() => {
    window.editor.setSelection(2);
    window.imageFormExternalAbort = new AbortController();
    void window.imageCommands(window.editor).upload(new File(['png'], 'external.png', { type: 'image/png' }), { signal: window.imageFormExternalAbort.signal }).then((ok) => window.imageFormExternalOutcome = ok);
    window.imageForm.destroy();
  });
  await expect.poll(() => page.evaluate(() => window.imageFormSignals.length)).toBe(2);
  expect(await page.evaluate(() => window.imageFormSignals.map((signal) => signal.aborted))).toEqual([true, false]);
  await page.evaluate(() => window.imageFormCompleters[1]({ src: '/logo.svg', alt: 'Application' }));
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Application');
  expect(await page.evaluate(() => window.imageFormExternalOutcome)).toBe(true);
  await expect(page.locator('.mw-image-form')).toHaveCount(0);
});

test('upload cancellation and editor disposal ignore late results and detached controls are inert', async ({ page }) => {
  await initialize(page);
  await upload(page);
  await expect(page.getByRole('button', { name: 'Отменить загрузку', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Отменить загрузку', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.imageFormSignals[0].aborted)).toBe(true);
  await page.evaluate(() => window.imageFormCompleters[0]({ src: '/logo.svg', alt: 'Late' }));
  await expect(content(page).locator('img')).toHaveCount(0);
  await page.evaluate(() => {
    const button = window.imageForm.element.querySelector('button')!;
    window.editor.providePlugin('detached-image-button', button);
    window.editor.destroy();
    button.click();
  });
  await expect(page.locator('.mw-image-form')).toHaveCount(0);
});

test('invalid upload files report a localized error and leave the chooser usable', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Файл изображения', { exact: true }).setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('.mw-image-form [role="status"]')).toContainText('Не удалось загрузить');
  expect(await page.evaluate(() => window.imageFormSignals.length)).toBe(0);
  expect(await page.evaluate(() => window.imageFormFailures[0])).toContain('supported raster image');
  await expect(page.getByLabel('Файл изображения', { exact: true })).toBeEnabled();
  await upload(page);
  await expect.poll(() => page.evaluate(() => window.imageFormSignals.length)).toBe(1);
  await page.getByRole('button', { name: 'Отменить загрузку', exact: true }).click();
  await expect(page.locator('.mw-image-form [role="status"]')).toHaveText('Загрузка отменена.');
});

test('two image forms keep drafts, locale and disposal independent across editors', async ({ page }) => {
  await initialize(page);
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    const editorHost = document.createElement('div');
    editorHost.className = 'second-image-editor';
    const formHost = document.createElement('div');
    document.body.append(editorHost, formHost);
    const secondEditor = window.createEditor(editorHost, { locale: 'en', value: '<p>Second</p>', plugins: [window.createImages()] });
    secondEditor.setSelection(0);
    const second = createImageForm(formHost, secondEditor, { initialValues: { src: '/logo.svg', alt: 'Second draft' } });
    window.editor.providePlugin('second-image-form', second);
    window.imageForm.setValues({ alt: 'First draft' });
    window.editor.setLocale('en', { 'ui.images.label': 'First images' });
  });
  const first = page.getByRole('form', { name: 'First images', exact: true });
  const second = page.getByRole('form', { name: 'Images', exact: true });
  await expect(first.getByLabel('Alt', { exact: true })).toHaveValue('First draft');
  await expect(second.getByLabel('Alt', { exact: true })).toHaveValue('Second draft');
  await first.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'First draft');
  await expect(page.locator('.second-image-editor img')).toHaveCount(0);
  await page.evaluate(() => window.imageForm.destroy());
  await second.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(page.locator('.second-image-editor img')).toHaveAttribute('alt', 'Second draft');
});

test('image form requires the plugin before mounting and copies draft state', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    const host = document.createElement('div');
    const empty = window.createEditor(document.createElement('div'));
    let rejected = false;
    try { createImageForm(host, empty); }
    catch { rejected = true; }
    empty.destroy();
    const draft = window.imageForm.getValues();
    draft.src = 'bad';
    let invalid = false;
    try { window.imageForm.setValues({ src: '/different.svg', width: 12 } as never); }
    catch { invalid = true; }
    return { rejected, children: host.childNodes.length, invalid, src: window.imageForm.getValues().src };
  });
  expect(result).toEqual({ rejected: true, children: 0, invalid: true, src: '/logo.svg' });
});

test('embedded image controls do not create or submit a nested application form', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    const outer = document.createElement('form');
    outer.className = 'outer-application-form';
    outer.dataset.submitted = '0';
    outer.addEventListener('submit', (event) => {
      event.preventDefault();
      outer.dataset.submitted = String(Number(outer.dataset.submitted) + 1);
    });
    document.body.append(outer);
    outer.append(document.querySelector('.image-form-host')!);
  });
  await expect(page.locator('form form')).toHaveCount(0);
  await page.getByLabel('Alt', { exact: true }).fill('Outer form');
  await page.getByLabel('Alt', { exact: true }).press('Enter');
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Outer form');
  await expect(page.locator('.outer-application-form')).toHaveAttribute('data-submitted', '0');
  expect(await page.locator('.outer-application-form').evaluate((element) => [...new FormData(element as HTMLFormElement).keys()])).toEqual([]);
});
