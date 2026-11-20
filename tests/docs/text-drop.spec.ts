import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`text drag demo moves a rich selection with one history step in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-text-drop');
  await panel.locator('summary').click();
  const load = panel.getByRole('button', { name: t('Загрузить пример перетаскивания', 'Load text drag sample'), exact: true });
  await load.click();
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('Move this');
  const before = await content.evaluate((root) => root.innerHTML);
  const source = content.locator('[title="Text drop source"]');
  const destination = content.locator('[title="Text drop target"]');
  await destination.scrollIntoViewIfNeeded();
  await content.evaluate((root) => {
    const source = root.querySelector('[title="Text drop source"] strong')!;
    const target = root.querySelector('[title="Text drop target"]')!;
    const text = target.firstChild!;
    const range = document.createRange();
    range.setStart(text, 13);
    range.collapse(true);
    const descriptors = ['caretRangeFromPoint', 'caretPositionFromPoint'].map((key) => [key, Object.getOwnPropertyDescriptor(document, key)] as const);
    const data = new DataTransfer();
    const rectangle = target.getBoundingClientRect();
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => range.cloneRange() });
    Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: () => ({ offsetNode: text, offset: 13 }) });
    try {
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, clientX: rectangle.left + 8, clientY: rectangle.top + 8 }));
      root.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
    }
    finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(document, key, descriptor);
        else Reflect.deleteProperty(document, key);
      }
    }
  });
  await expect(source).toHaveText('Before  after.');
  await expect(destination).toHaveText('Destination: Move this end.');
  await expect(destination.locator('strong em')).toHaveText('this');
  await expect(content.locator('[title="Text drop merged"]')).toHaveAttribute('rowspan', '2');
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  const undo = toolbar.locator('[data-mw-ui-action="undo"]');
  await undo.click();
  expect(await content.evaluate((root) => root.innerHTML)).toBe(before);
  await expect(undo).toBeDisabled();
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('Move this');
  await toolbar.locator('[data-mw-ui-action="redo"]').click();
  await expect(destination).toHaveText('Destination: Move this end.');
  await page.keyboard.type('X');
  await expect(destination).toHaveText('Destination: Move thisX end.');
  await expect(panel.locator('[data-text-drop-hint]')).toContainText('Ctrl/Meta/Alt');
  await expect(panel.locator('[data-text-drop-limits]')).toContainText('OS drag/drop');
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(load).toBeDisabled();
  await expect(panel.getByRole('link', { name: t('Подключение перетаскивания текста', 'Text drag and drop setup'), exact: true })).toHaveAttribute('href', english ? '/en/text-drop' : '/text-drop');
});
