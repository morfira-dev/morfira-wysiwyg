import { expect, test } from '@playwright/test';

for (const enter of [true, false]) test(`autolink ${enter ? 'Enter on Russian homepage' : 'plain clipboard URL on English playground'} preserves two-step history`, async ({ page, context }) => {
  const english = !enter;
  const t = (ru: string, en: string) => english ? en : ru;
  await page.goto(english ? '/playground' : '/ru/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-autolink');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: enter ? 'Подготовить URL для Enter' : 'Prepare plain-text paste', exact: true }).click();
  const url = 'https://example.com';
  await expect(content.locator('a')).toHaveCount(0);
  if (enter) await page.keyboard.press('Enter');
  else {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate((text) => navigator.clipboard.writeText(text), url);
    await page.keyboard.press('ControlOrMeta+V');
  }
  await expect(content.locator('a')).toHaveText(url);
  await expect(content.locator('a')).toHaveAttribute('href', url);
  if (enter) {
    await expect(content.locator('p')).toHaveCount(2);
    expect(await content.evaluate((surface) => {
      const selection = document.getSelection()!;
      const node = selection.anchorNode;
      const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
      return selection.isCollapsed && element?.closest('p') === surface.querySelector('p:last-child');
    })).toBe(true);
  }
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  const undo = toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true });
  const redo = toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true });
  await undo.click();
  await expect(content.locator('a')).toHaveCount(0);
  await expect(content).toHaveText(url);
  await expect(content.locator('p')).toHaveCount(enter ? 2 : 1);
  await undo.click();
  await expect(content.locator('p')).toHaveCount(1);
  await expect(content).toHaveText(enter ? url : '');
  await redo.click();
  await redo.click();
  await expect(content.locator('a')).toHaveText(url);
  // Toolbar commands restore the editor's post-input point; type there without moving it.
  await page.keyboard.type('X');
  await expect(content.locator('a')).toHaveText(url);
  if (enter) await expect(content.locator('p').last()).toHaveText('X');
  else await expect(content).toHaveText(`${url}X`);
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(panel.getByRole('button', { name: enter ? 'Подготовить URL для Enter' : 'Prepare plain-text paste', exact: true })).toBeDisabled();
});
