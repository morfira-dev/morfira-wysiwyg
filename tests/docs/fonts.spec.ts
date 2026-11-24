import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`optional font choices and independent resets in ${english ? 'English desktop playground' : 'Russian mobile homepage'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.setViewportSize({ width: english ? 1280 : 390, height: 900 });
  await page.goto(english ? '/playground' : '/ru/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-fonts');
  await panel.locator('summary').click();
  const load = panel.getByRole('button', { name: t('Загрузить пример шрифтов', 'Load font sample'), exact: true });
  await load.click();
  const originalText = await content.textContent();
  const word = content.locator('[title="Font sample"] strong');
  const family = panel.getByRole('combobox', { name: t('Семейство шрифта', 'Font family'), exact: true });
  const size = panel.getByRole('combobox', { name: t('Размер шрифта', 'Font size'), exact: true });
  const status = panel.getByRole('status');
  const applyFamily = panel.getByRole('button', { name: t('Применить семейство', 'Apply family'), exact: true });
  const applySize = panel.getByRole('button', { name: t('Применить размер', 'Apply size'), exact: true });
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  const undo = toolbar.locator('[data-mw-ui-action="undo"]');
  const redo = toolbar.locator('[data-mw-ui-action="redo"]');
  await family.selectOption('serif');
  await applyFamily.click();
  await expect(status).toContainText('Georgia, serif');
  await size.selectOption('24');
  await applySize.click();
  await expect(status).toContainText('24px');
  expect(await word.evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const style = getComputedStyle(text.parentElement!);
    return { family: style.fontFamily, size: style.fontSize };
  })).toEqual({ family: 'Georgia, serif', size: '24px' });
  await expect(content.locator('[title="Font sample"] a')).toHaveAttribute('href', 'https://example.com');
  await expect(word).toHaveText('one');
  expect(await content.textContent()).toBe(originalText);
  await undo.click();
  await expect(status).toContainText(t('явный размер: По умолчанию', 'explicit size: Default'));
  await expect(status).toContainText('Georgia, serif');
  await redo.click();
  await expect(status).toContainText('24px');
  await panel.getByRole('button', { name: t('Сбросить семейство', 'Reset family'), exact: true }).click();
  await expect(status).toContainText(t('Явное семейство: По умолчанию', 'Explicit family: Default'));
  await expect(status).toContainText('24px');
  await undo.click();
  await panel.getByRole('button', { name: t('Сбросить размер', 'Reset size'), exact: true }).click();
  await expect(status).toContainText('Georgia, serif');
  await expect(status).toContainText(t('явный размер: По умолчанию', 'explicit size: Default'));
  await undo.click();
  if (english) {
    await load.click();
    await word.evaluate((element) => {
      const text = element.firstChild!;
      element.closest<HTMLElement>('.mw-content')!.focus();
      document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await family.selectOption('monospace');
    await applyFamily.click();
    await size.selectOption('32');
    await applySize.click();
    await expect(undo).toBeDisabled();
    const joinedBoldText = async () => (await word.allTextContents()).join('');
    const typedStyle = () => content.locator('[title="Font sample"]').evaluate((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let text: Node | null;
      while ((text = walker.nextNode())) {
        if (text.nodeValue !== 'X') continue;
        const style = getComputedStyle(text.parentElement!);
        return { family: style.fontFamily, size: style.fontSize };
      }
      return null;
    });
    await page.keyboard.type('X');
    await expect.poll(joinedBoldText).toBe('oXne');
    await expect.poll(typedStyle).toEqual({ family: 'monospace', size: '32px' });
    await expect(status).toContainText('monospace');
    await expect(status).toContainText('32px');
    expect(await content.textContent()).toBe(originalText!.replace('one', 'oXne'));
    await expect(content.locator('[title="Font sample"] a')).toHaveText('linked');
    await expect(content.locator('[title="Font sample"] a')).toHaveAttribute('href', 'https://example.com');
    await undo.click();
    await expect.poll(joinedBoldText).toBe('one');
    expect(await content.textContent()).toBe(originalText);
    await redo.click();
    await expect.poll(joinedBoldText).toBe('oXne');
    await expect.poll(typedStyle).toEqual({ family: 'monospace', size: '32px' });
    expect(await content.textContent()).toBe(originalText!.replace('one', 'oXne'));
    await expect(content.locator('[title="Font sample"] a')).toHaveText('linked');
    await expect(content.locator('[title="Font sample"] a')).toHaveAttribute('href', 'https://example.com');
  }
  else {
    await content.evaluate((root) => {
      const first = root.querySelector('[title="Font sample"]')!;
      const last = root.querySelector('[title="Font imported"]')!;
      (root as HTMLElement).focus();
      document.getSelection()!.setBaseAndExtent(first.firstChild!, 0, last.firstChild!, 3);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(status).toContainText(t('Явное семейство: Разное', 'Explicit family: Mixed'));
    await expect(status).toContainText(t('явный размер: Разное', 'explicit size: Mixed'));
  }
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  await expect(applyFamily).toBeDisabled();
  await expect(applySize).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
