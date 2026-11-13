import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ImageCommands, ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
declare global { interface Window { imageAPI: ImageCommands; uploadSignals: AbortSignal[]; completeUploads: ((value: ImageValue) => void)[]; failUploads: (() => void)[]; uploadOutcome: Promise<string>; } }
const initialize = async (page: Page, html = '<p>abcd</p>') => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose(); const host = document.createElement('div'); host.className = 'image-test'; document.body.append(host);
    window.uploadSignals = []; window.completeUploads = []; window.failUploads = [];
    window.editor = window.createEditor(host, { value, plugins: [window.createImages({ maxFileSize: 16, upload: (_file, { signal }) => {
      window.uploadSignals.push(signal); return new Promise((resolve, reject) => { window.completeUploads.push(resolve); window.failUploads.push(() => reject(new Error('Storage unavailable'))); });
    } })] }); window.imageAPI = window.imageCommands(window.editor); window.editor.setSelection(2);
  }, html);
};
const select = async (page: Page) => page.evaluate(() => window.imageAPI.select(window.editor.surface.querySelector('img')!));
const startUpload = async (page: Page) => page.evaluate(() => { window.uploadOutcome = window.imageAPI.upload(new File(['png'], 'test.png', { type: 'image/png' })).then((ok) => ok ? 'inserted' : 'cancelled', (error: unknown) => String(error)); });
const content = (page: Page) => page.locator('.image-test .mw-content');

test('insert splits rich text, escapes caption, restores caret and supports undo/redo', async ({ page }) => {
  await initialize(page, '<p><strong>abcd</strong></p>');
  await page.addStyleTag({ content: 'img { height: auto; }' });
  await page.evaluate(() => window.imageAPI.insert({ src: '/logo.svg', alt: '" onerror="oops', width: 80, height: 60, caption: '<b>literal</b>' }));
  await expect(content(page).locator(':scope > p')).toHaveText(['ab', 'cd']);
  await expect(content(page).locator('p strong')).toHaveText(['ab', 'cd']);
  await expect(content(page).locator('figure img')).toHaveAttribute('width', '80');
  await expect(content(page).locator('img')).toHaveCSS('height', '60px');
  await expect(content(page).locator('figcaption')).toHaveText('<b>literal</b>'); await expect(content(page).locator('figcaption b')).toHaveCount(0);
  expect(await page.evaluate(() => (() => { const node = window.getSelection()?.anchorNode; return (node instanceof Element ? node : node?.parentElement)?.closest('p')?.textContent; })())).toBe('cd');
  await page.evaluate(() => window.editor.undo()); await expect(content(page)).toHaveText('abcd');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.evaluate(() => window.editor.redo()); await expect(content(page).locator('figure')).toHaveCount(1);
  expect(await content(page).locator('img').getAttribute('onerror')).toBeNull();
});

test('click selects an image; metadata edits/remove preserve history and optional dimensions', async ({ page }) => {
  await initialize(page, '<figure><img src="/logo.svg" alt="Logo" width="80" height="60"><figcaption>Caption</figcaption></figure><p>Tail</p>');
  await content(page).locator('img').click();
  expect(await page.evaluate(() => window.imageAPI.getSelected())).toMatchObject({ alt: 'Logo', width: 80, caption: 'Caption' });
  await page.evaluate(() => window.imageAPI.update({ src: '/logo.svg?next', alt: 'Next', width: null, height: 40, caption: 'New' }));
  await page.evaluate(() => window.imageAPI.update({ alt: undefined, height: undefined }));
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Next'); await expect(content(page).locator('img')).toHaveAttribute('height', '40');
  await expect(content(page).locator('img')).toHaveCSS('height', '40px');
  expect(await content(page).locator('img').getAttribute('width')).toBeNull(); await expect(content(page).locator('figcaption')).toHaveText('New');
  await page.evaluate(() => window.imageAPI.update({ caption: '' })); await expect(content(page).locator('figcaption')).toHaveCount(0);
  await page.evaluate(() => window.imageAPI.remove()); await expect(content(page).locator('img')).toHaveCount(0); await expect(content(page)).toHaveText('Tail');
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('img')).toHaveAttribute('alt', 'Next');
});

test('legacy inline image promotion preserves surrounding marks and unrelated attributes', async ({ page }) => {
  await initialize(page, '<p><em>A<img src="/logo.svg" title="Keep">B</em></p>'); await select(page);
  await page.evaluate(() => window.imageAPI.update({ caption: 'Promoted' }));
  await expect(content(page).locator(':scope > figure')).toHaveCount(1); await expect(content(page).locator('p em')).toHaveText(['A', 'B']);
  await expect(content(page).locator('figure img')).toHaveAttribute('title', 'Keep');
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('p em img')).toHaveCount(1);
});

test('figures stay inside list items and merged cells without changing table geometry', async ({ page }) => {
  await initialize(page, '<ul><li><p>abcd</p></li></ul><table><tbody><tr><td rowspan="2"><p>cell</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  await page.evaluate(() => window.imageAPI.insert({ src: '/logo.svg', caption: 'List' }));
  await expect(content(page).locator('ul > li > figure')).toHaveCount(1); await expect(content(page).locator('ul > figure')).toHaveCount(0);
  await content(page).locator('td p').evaluate((el) => { const range = document.createRange(); range.setStart(el.firstChild!, 2); range.collapse(true); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); });
  await page.evaluate(() => window.imageAPI.insert({ src: '/logo.svg', caption: 'Cell' }));
  await expect(content(page).locator('td[rowspan="2"] > figure')).toHaveCount(1); await expect(content(page).locator('td')).toHaveCount(3);
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('td[rowspan="2"]')).toHaveText('cell');
});

test('caption native typing and figure JSON/HTML roundtrip retain content and safe attributes', async ({ page }) => {
  await initialize(page, '<figure><img src="/logo.svg"><figcaption>Caption</figcaption></figure><p>Tail</p>');
  await content(page).locator('figcaption').evaluate((el) => { const range = document.createRange(); range.selectNodeContents(el); range.collapse(false); const native = window.getSelection()!; native.removeAllRanges(); native.addRange(range); (el.closest('.mw-content') as HTMLElement).focus(); });
  expect(await page.evaluate(() => window.imageAPI.getSelected()?.caption)).toBe('Caption');
  await page.keyboard.type(' edited'); await expect(content(page).locator('figcaption')).toHaveText('Caption edited');
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('figcaption')).toHaveText('Caption');
  await page.evaluate(() => window.editor.setJSON(window.editor.getJSON())); await expect(content(page).locator('figure')).toHaveCount(1);
  await page.evaluate(() => window.editor.setHTML('<figure onclick="evil()"><img src="javascript:evil()"><figcaption><svg></svg>Safe</figcaption></figure>'));
  await expect(content(page).locator('img,svg')).toHaveCount(0); expect(await content(page).locator('figure').getAttribute('onclick')).toBeNull();
});

test('invalid metadata, multiblock selections and foreign images reject atomically', async ({ page }) => {
  await initialize(page, '<p>abcd</p><p>ef</p>'); const before = await content(page).innerHTML();
  for (const value of [{ src: 'data:image/png;base64,xxx' }, { src: 'javascript:evil()' }, { src: '/ok', width: 0 }, { src: '/ok', height: 1001 }, { src: '/ok', width: 1.5 }]) {
    expect(await page.evaluate((input) => { try { window.imageAPI.insert(input); } catch { return true; } return false; }, value)).toBe(true);
    expect(await content(page).innerHTML()).toBe(before);
  }
  expect(await page.evaluate(() => { window.editor.setSelection(1, 4); try { window.imageAPI.insert({ src: '/logo.svg' }); } catch { return true; } return false; })).toBe(true);
  expect(await content(page).innerHTML()).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => { try { window.imageAPI.select(document.createElement('img')); } catch { return true; } return false; })).toBe(true);
});

test('upload uses its original DOM bookmark despite selection movement and makes one undo step', async ({ page }) => {
  await initialize(page); await startUpload(page);
  expect(await page.evaluate(() => window.imageAPI.isUploading())).toBe(true);
  await page.evaluate(() => { window.editor.setSelection(4); window.completeUploads[0]({ src: '/logo.svg', caption: 'Uploaded' }); });
  expect(await page.evaluate(() => window.uploadOutcome)).toBe('inserted');
  await expect(content(page).locator(':scope > p')).toHaveText(['ab', 'cd']);
  await page.evaluate(() => window.editor.undo()); await expect(content(page)).toHaveText('abcd');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

for (const cause of ['cancel', 'replace', 'edit', 'readonly', 'destroy'] as const) test(`upload ignores late result after ${cause}`, async ({ page }) => {
  await initialize(page); await startUpload(page);
  await page.evaluate((action) => {
    if (action === 'cancel') window.imageAPI.cancelUpload();
    if (action === 'replace') window.editor.setHTML('<p>External</p>');
    if (action === 'edit') window.editor.insertHTML('Changed');
    if (action === 'readonly') window.editor.setReadOnly(true);
    if (action === 'destroy') window.editor.destroy();
  }, cause);
  expect(await page.evaluate(() => window.uploadOutcome)).toBe('cancelled');
  expect(await page.evaluate(() => window.uploadSignals[0].aborted)).toBe(true);
  await page.evaluate(() => window.completeUploads[0]({ src: '/logo.svg', caption: 'Too late' }));
  await expect(page.locator('.image-test img')).toHaveCount(0);
});

test('upload callback failure and unsafe results do not change the document/history', async ({ page }) => {
  await initialize(page); await startUpload(page); await page.evaluate(() => window.failUploads[0]());
  expect(await page.evaluate(() => window.uploadOutcome)).toContain('Storage unavailable');
  await startUpload(page); await page.evaluate(() => window.completeUploads[1]({ src: 'javascript:evil()' }));
  expect(await page.evaluate(() => window.uploadOutcome)).toContain('unsafe');
  await expect(content(page)).toHaveText('abcd'); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => window.imageAPI.isUploading())).toBe(false);
});

test('latest upload wins; invalid file never calls transport; readonly blocks commands', async ({ page }) => {
  await initialize(page); await startUpload(page);
  const result = await page.evaluate(async () => {
    const first = window.uploadOutcome;
    window.uploadOutcome = window.imageAPI.upload(new File(['img'], 'second.jpg', { type: 'image/jpeg' })).then((ok) => ok ? 'inserted' : 'cancelled');
    return first;
  }); expect(result).toBe('cancelled');
  await page.evaluate(() => { window.completeUploads[0]({ src: '/old' }); window.completeUploads[1]({ src: '/logo.svg' }); });
  expect(await page.evaluate(() => window.uploadOutcome)).toBe('inserted'); await expect(content(page).locator('img')).toHaveCount(1);
  for (const file of [{ type: 'image/svg+xml', size: 3 }, { type: 'image/png', size: 20 }, { type: 'image/png', size: 0 }]) {
    expect(await page.evaluate(async (value) => { try { await window.imageAPI.upload(new File(['x'.repeat(value.size)], 'bad', { type: value.type })); } catch { return true; } return false; }, file)).toBe(true);
  }
  expect(await page.evaluate(() => window.uploadSignals.length)).toBe(2);
  await select(page); await page.evaluate(() => { window.editor.setReadOnly(true); window.imageAPI.update({ alt: 'Changed' }); window.imageAPI.remove(); window.imageAPI.insert({ src: '/new' }); });
  await expect(content(page).locator('img')).toHaveCount(1); await expect(content(page).locator('img')).toHaveAttribute('alt', '');
});

test('instances own their APIs and disposal removes click handler and pending state', async ({ page }) => {
  await initialize(page, '<p><img src="/logo.svg">ab</p>');
  expect(await page.evaluate(() => {
    const host = document.createElement('div'); document.body.append(host); const plugin = window.createImages();
    const other = window.createEditor(host, { plugins: [plugin], value: '<p><img src="/logo.svg">other</p>' }); const api = window.imageCommands(other);
    api.select(other.surface.querySelector('img')!); api.update({ alt: 'Other' }); const distinct = window.imageAPI.getSelected() === undefined && api.getSelected()?.alt === 'Other';
    other.destroy(); let throws = false; try { api.getSelected(); } catch { throws = true; } api.cancelUpload(); host.remove(); return distinct && throws;
  })).toBe(true);
});

test('same-block selection replacement preserves both rich neighbors and history', async ({ page }) => {
  await initialize(page, '<p><em>abcdef</em></p>');
  await page.evaluate(() => { window.editor.setSelection(2, 2); window.imageAPI.insert({ src: '/logo.svg', caption: 'Replacement' }); });
  await expect(content(page).locator('p em')).toHaveText(['ab', 'ef']); await expect(content(page).locator('figure img')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('p em')).toHaveText('abcdef');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 2 });
});

test('complex imported figures retain unaffected images and captions when one image is removed', async ({ page }) => {
  await initialize(page, '<figure><img src="/logo.svg" alt="First"><img src="/logo.svg" alt="Second"><figcaption>Shared</figcaption></figure><p>Tail</p>'); await select(page);
  expect(await page.evaluate(() => { try { window.imageAPI.update({ caption: 'Replace shared caption' }); } catch { return true; } return false; })).toBe(true);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.imageAPI.remove()); await expect(content(page).locator('img')).toHaveAttribute('alt', 'Second'); await expect(content(page).locator('figcaption')).toHaveText('Shared');
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('img')).toHaveCount(2);
});

test('late rejected callbacks after cancellation are handled without page errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page); await startUpload(page); await page.evaluate(() => window.imageAPI.cancelUpload());
  expect(await page.evaluate(() => window.uploadOutcome)).toBe('cancelled');
  await page.evaluate(() => window.failUploads[0]()); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(content(page)).toHaveText('abcd'); expect(errors).toEqual([]);
});

test('root-spanning DOM selections reject; replacing a selected image never nests figures', async ({ page }) => {
  await initialize(page, '<p>abcd</p><p>ef</p>');
  const before = await content(page).innerHTML();
  expect(await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(window.editor.surface); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range); try { window.imageAPI.insert({ src: '/logo.svg' }); } catch { return true; } return false; })).toBe(true);
  expect(await content(page).innerHTML()).toBe(before);
  await page.evaluate(() => { window.editor.setHTML('<figure><img src="/logo.svg"><figcaption>Old</figcaption></figure><p>Tail</p>'); window.imageAPI.select(window.editor.surface.querySelector('img')!); window.imageAPI.insert({ src: '/logo.svg?new', caption: 'New' }); });
  await expect(content(page).locator('figure')).toHaveCount(1); await expect(content(page).locator('figure figure')).toHaveCount(0);
  await expect(content(page).locator('figcaption')).toHaveText('New'); await expect(content(page).locator('p').last()).toHaveText('Tail');
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('figcaption')).toHaveText('Old');
});

test('core figure HTML insertion splits paragraphs and imports leave a trailing typing paragraph', async ({ page }) => {
  await initialize(page, '<p><em>abcd</em></p>');
  await page.evaluate(() => window.editor.insertHTML('<figure><img src="/logo.svg"><figcaption>HTML</figcaption></figure>'));
  await expect(content(page).locator(':scope > figure')).toHaveCount(1); await expect(content(page).locator('p em')).toHaveText(['ab', 'cd']);
  await page.evaluate(() => window.editor.setHTML('<figure><img src="/logo.svg"><figcaption>Last</figcaption></figure>'));
  await expect(content(page).locator(':scope > p:last-child br')).toHaveCount(1);
});
