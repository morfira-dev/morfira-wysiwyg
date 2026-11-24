import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`explicit LTR/RTL controls in ${english ? 'English desktop playground' : 'Russian mobile homepage'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.setViewportSize({ width: english ? 1280 : 390, height: 900 });
  await page.goto(english ? '/playground' : '/ru/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-text-direction');
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: t('Загрузить многоязычный пример', 'Load multilingual sample'), exact: true }).click();
  const first = content.locator('[title="Direction first"]');
  const second = content.locator('[title="Direction second"]');
  const originalText = await content.textContent();
  const selectedText = await page.evaluate(() => document.getSelection()!.toString());
  const status = panel.getByRole('status');
  const rtl = panel.getByRole('button', { name: t('Справа налево (RTL)', 'Right to left (RTL)'), exact: true });
  const ltr = panel.getByRole('button', { name: t('Слева направо (LTR)', 'Left to right (LTR)'), exact: true });
  const reset = panel.getByRole('button', { name: t('Наследовать направление', 'Inherit direction'), exact: true });
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  const undo = toolbar.locator('[data-mw-ui-action="undo"]');
  const redo = toolbar.locator('[data-mw-ui-action="redo"]');
  await rtl.click();
  await expect(first).toHaveAttribute('dir', 'rtl');
  await expect(second).toHaveAttribute('dir', 'rtl');
  expect(await first.evaluate((node) => ({ direction: getComputedStyle(node).direction, align: getComputedStyle(node).textAlign }))).toEqual({ direction: 'rtl', align: 'center' });
  expect(await page.evaluate(() => document.getSelection()!.toString())).toBe(selectedText);
  expect(await content.textContent()).toBe(originalText);
  await expect(first.locator('strong')).toHaveText('Latin');
  await expect(first.locator('a')).toHaveAttribute('href', 'https://example.com');
  await expect(status).toContainText('rtl');
  await undo.click();
  await expect(first).not.toHaveAttribute('dir');
  await expect(second).not.toHaveAttribute('dir');
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(second).toHaveAttribute('dir', 'rtl');
  // Application-owned direction demonstrates that reset means inherit, not LTR.
  await page.locator('.demo-editing').evaluate((node) => { node.setAttribute('dir', 'rtl'); });
  await ltr.click();
  await expect(first).toHaveAttribute('dir', 'ltr');
  await reset.click();
  await expect(first).not.toHaveAttribute('dir');
  await expect(second).not.toHaveAttribute('dir');
  expect(await first.evaluate((node) => getComputedStyle(node).direction)).toBe('rtl');
  await expect(status).toContainText(t('Наследовать', 'Inherit'));
  await undo.click();
  await expect(first).toHaveAttribute('dir', 'ltr');
  await expect(second).toHaveAttribute('dir', 'ltr');
  await redo.click();
  await expect(first).not.toHaveAttribute('dir');
  if (english) {
    const item = content.locator('[title="Direction item"]');
    const originalItem = await item.textContent();
    await item.evaluate((node) => {
      node.closest<HTMLElement>('.mw-content')!.focus();
      document.getSelection()!.setBaseAndExtent(node.firstChild!, 1, node.firstChild!, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await ltr.click();
    await expect(item).toHaveAttribute('dir', 'ltr');
    await expect(first).not.toHaveAttribute('dir');
    await page.keyboard.type('X');
    await expect(item).toHaveText(`${originalItem!.slice(0, 1)}X${originalItem!.slice(1)}`);
    await undo.click();
    await expect(item).toHaveText(originalItem!);
    await expect(item).toHaveAttribute('dir', 'ltr');
  }
  else {
    await first.evaluate((node) => {
      node.closest<HTMLElement>('.mw-content')!.focus();
      document.getSelection()!.setBaseAndExtent(node.firstChild!, 1, node.firstChild!, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await ltr.click();
    await content.evaluate((root) => {
      const firstNode = root.querySelector('[title="Direction first"]')!.firstChild!;
      const lastNode = root.querySelector('[title="Direction second"]')!.firstChild!;
      (root as HTMLElement).focus();
      document.getSelection()!.setBaseAndExtent(firstNode, 1, lastNode, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(status).toContainText('Разное');
    expect(await content.textContent()).toBe(originalText);
  }
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(rtl).toBeDisabled();
  await expect(reset).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
