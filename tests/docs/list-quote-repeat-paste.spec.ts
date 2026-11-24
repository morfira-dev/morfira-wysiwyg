import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`repeated quote, heading and block insertion demo retains the original quote in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/playground' : '/ru/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByRole('button', { name: t('Загрузить пример повторной вставки', 'Load repeated insertion sample'), exact: true }).click();
    const states = [await content.innerHTML()];
    const existing = await content.locator('[title="Existing quote"]').elementHandle();
    const branch = await content.locator('[title="Repeat branch"]').elementHandle();
    const after = await content.locator('[title="Repeat after"]').elementHandle();
    await panel.getByRole('button', { name: t('Курсор после существующей цитаты', 'Caret after existing quote'), exact: true }).click();
    for (const name of [t('Вставить цитату', 'Insert quote'), t('Вставить заголовок', 'Insert heading'), t('Заменить несколькими блоками', 'Replace with multiple blocks')]) {
      await panel.getByRole('button', { name, exact: true }).click();
      states.push(await content.innerHTML());
      for (const handle of [existing, branch, after]) expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
      expect(await existing!.evaluate((node) => node.parentElement?.getAttribute('title'))).toBe('Repeat owner');
      await expect(content.locator('[title="Existing quote"]')).toHaveText('Kept quote');
      await expect(content.locator('[title="Existing quote"]')).toHaveCSS('text-align', 'center');
    }
    const owner = content.locator('[title="Repeat owner"]');
    await expect(content.locator(':scope > ul > li')).toHaveCount(2);
    await expect(owner.locator(':scope > blockquote')).toHaveText(['Kept quote', 'QuoteSource']);
    await expect(owner.locator(':scope > h2[title="Inserted heading"]')).toHaveText('Title');
    await expect(owner.locator(':scope > h3')).toHaveText(['Middle', 'After body']);
    await expect(owner.locator(':scope > p')).toHaveText(['Before one', 'Alpha o', '', 'First', 'Lastne tail']);
    await expect(owner.locator(':scope > ol')).toHaveText('Nested branch');
    await expect(content.locator('p blockquote, blockquote blockquote, blockquote ol')).toHaveCount(0);
    expect(await owner.evaluate((root) => {
      const last = root.querySelector(':scope > h3')!.nextElementSibling!;
      const range = document.getSelection()!.getRangeAt(0);
      const prefix = document.createRange();
      prefix.selectNodeContents(last);
      prefix.setEnd(range.startContainer, range.startOffset);
      return { beforeCaret: prefix.toString(), collapsed: range.collapsed, inLast: last.contains(range.startContainer) };
    })).toEqual({ beforeCaret: 'Last', collapsed: true, inLast: true });
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    for (let index = 2; index >= 0; index--) {
      await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
      expect(await content.innerHTML()).toBe(states[index]);
    }
    expect(await content.evaluate((root) => {
      const selection = document.getSelection()!;
      return { node: selection.anchorNode === root.querySelector('[title="Repeat target"] > strong')!.firstChild, offset: selection.anchorOffset, collapsed: selection.isCollapsed };
    })).toEqual({ node: true, offset: 1, collapsed: true });
    for (let index = 1; index < states.length; index++) {
      await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
      expect(await content.innerHTML()).toBe(states[index]);
    }
    await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    for (const name of [t('Загрузить пример повторной вставки', 'Load repeated insertion sample'), t('Курсор перед существующей цитатой', 'Caret before existing quote'), t('Курсор после существующей цитаты', 'Caret after existing quote'), t('Вставить цитату', 'Insert quote')])
      await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
  });

  test(`block insertion before an existing quote demo leaves that quote after the new bodies in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/' : '/ru/playground');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByRole('button', { name: t('Загрузить пример повторной вставки', 'Load repeated insertion sample'), exact: true }).click();
    const before = await content.innerHTML();
    const existing = await content.locator('[title="Existing quote"]').elementHandle();
    await panel.getByRole('button', { name: t('Курсор перед существующей цитатой', 'Caret before existing quote'), exact: true }).click();
    await panel.getByRole('button', { name: t('Заменить несколькими блоками', 'Replace with multiple blocks'), exact: true }).click();
    const owner = content.locator('[title="Repeat owner"]');
    expect(await owner.locator(':scope > p, :scope > h3, :scope > blockquote').allTextContents()).toEqual(['Before oFirst', 'Middle', 'Lastne', 'Kept quote', 'Alpha one tail', 'After body']);
    expect(await existing!.evaluate((node) => node.isConnected && node.previousElementSibling?.textContent === 'Lastne')).toBe(true);
    await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
      .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate((root) => ({ node: document.getSelection()!.anchorNode === root.querySelector('[title="Before quote"] > strong')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset: 1 });
  });
}
