import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`checklist marker and shortcut through ${english ? 'English playground' : 'Russian homepage'} controls`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-checklists');
  await panel.locator('summary').click();
  const button = (ru: string, en: string) => panel.getByRole('button', { name: t(ru, en), exact: true });
  await button('Загрузить переключение чек-листов', 'Load checklist interactions').click();
  const parent = content.locator('[title="Checklist pointer parent"]');
  const child = content.locator('[title="Checklist pointer child"]');
  await expect(parent).toHaveAttribute('data-checklist-checked', 'false');
  await expect(child).toHaveAttribute('data-checklist-checked', 'false');
  await expect(panel.locator('[data-checklist-interaction-hint]')).toContainText('Ctrl+Enter');
  await button('Выделить текст задачи назад', 'Select task text backward').click();
  const selection = await page.evaluate(() => {
    const native = document.getSelection()!;
    return { text: native.toString(), anchor: native.anchorOffset, focus: native.focusOffset };
  });
  const originalText = await parent.textContent();
  await parent.scrollIntoViewIfNeeded();
  const markerPoint = () => parent.evaluate((node) => {
    const item = node as HTMLElement;
    const box = item.getBoundingClientRect();
    const view = item.ownerDocument.defaultView!;
    const style = view.getComputedStyle(item, '::before');
    const own = view.getComputedStyle(item);
    const sx = box.width / item.offsetWidth;
    const sy = box.height / item.offsetHeight;
    const width = Number.parseFloat(style.width) * sx;
    const height = Number.parseFloat(style.height) * sy;
    const left = Number.parseFloat(style.left);
    const x = Number.isFinite(left)
      ? box.left + (Number.parseFloat(own.borderLeftWidth) + left) * sx
      : box.right - (Number.parseFloat(own.borderRightWidth) + Number.parseFloat(style.right)) * sx - width;
    const y = box.top + (Number.parseFloat(own.borderTopWidth) + Number.parseFloat(style.top)) * sy;
    return { x: x + width / 2, y: y + height / 2 };
  });
  const marker = await markerPoint();
  expect(Number.isFinite(marker.x) && Number.isFinite(marker.y)).toBe(true);
  await page.mouse.click(marker.x, marker.y);
  await expect(parent).toHaveAttribute('data-checklist-checked', 'true');
  await expect(child).toHaveAttribute('data-checklist-checked', 'false');
  await expect(parent).toHaveText(originalText!);
  expect(await page.evaluate(() => {
    const native = document.getSelection()!;
    return { text: native.toString(), anchor: native.anchorOffset, focus: native.focusOffset };
  })).toEqual(selection);
  const undo = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true }).locator('[data-mw-ui-action="undo"]');
  await undo.click();
  await expect(parent).toHaveAttribute('data-checklist-checked', 'false');
  await button('Курсор во вложенной задаче', 'Caret in child task').click();
  await page.keyboard.press(english ? 'Meta+Enter' : 'Control+Enter');
  await expect(child).toHaveAttribute('data-checklist-checked', 'true');
  await expect(parent).toHaveAttribute('data-checklist-checked', 'false');
  await undo.click();
  await expect(child).toHaveAttribute('data-checklist-checked', 'false');
  await expect(content.locator('input[type="checkbox"], button')).toHaveCount(0);
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(button('Переключить выполнение', 'Toggle completion')).toBeDisabled();
  await expect(button('Загрузить переключение чек-листов', 'Load checklist interactions')).toBeDisabled();
  await parent.scrollIntoViewIfNeeded();
  const readonlyMarker = await markerPoint();
  await page.mouse.click(readonlyMarker.x, readonlyMarker.y);
  await expect(parent).toHaveAttribute('data-checklist-checked', 'false');
  await expect(child).toHaveAttribute('data-checklist-checked', 'false');
  await panel.getByRole('link', { name: t('Мышь, клавиатура и формат чек-листа', 'Checklist mouse, keyboard and format'), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${english ? '/en' : ''}/checklists$`));
  await expect(page.locator('.vp-doc')).toContainText('interactive: false');
  await expect(page.locator('.vp-doc')).toContainText('Ctrl+Enter');
});
