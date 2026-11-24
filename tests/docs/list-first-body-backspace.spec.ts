import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  for (const scenario of ['join', 'root', 'nested']) {
    test(`first-body Backspace demo ${scenario} retains bodies and restores its original caret in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
      const t = (ru: string, en: string) => english ? en : ru;
      await page.goto(english ? '/playground' : '/ru/');
      const content = page.locator('.mw-content');
      await expect(content).toBeVisible();
      const panel = page.locator('.lab-list-selection');
      await panel.locator('summary').click();
      await panel.getByLabel(t('Сценарий Backspace', 'Backspace scenario'), { exact: true }).selectOption(scenario);
      await panel.getByRole('button', { name: t('Загрузить пример Backspace', 'Load Backspace sample'), exact: true }).click();
      const before = await content.innerHTML();
      await panel.getByRole('button', { name: t('Курсор перед Backspace', 'Caret before Backspace'), exact: true }).click();
      await page.keyboard.press('Backspace');
      await expect(content.locator(':scope > p').last()).toHaveText('Keep paragraph');
      await expect(content.locator('p ul, h2 ul, h3 ul')).toHaveCount(0);
      if (scenario === 'join') {
        const items = content.locator(':scope > ul > li');
        await expect(items).toHaveCount(2);
        await expect(items.first().locator(':scope > h2')).toHaveJSProperty('innerHTML', 'Middle<em>Beta</em> tail');
        await expect(items.first().locator(':scope > p')).toHaveText(['Alpha one', 'After body']);
        await expect(items.first().locator(':scope > ul')).toHaveText('Nested branch');
        await expect(items.last()).toHaveText('Keep item');
      }
      else if (scenario === 'root') {
        await expect(content.locator(':scope > p').first()).toHaveText('Alpha one');
        await expect(content.locator(':scope > h2')).toHaveText('Middle');
        await expect(content.locator(':scope > ul').first()).toHaveText('Nested branch');
        await expect(content.locator(':scope > ul[title="Backspace list"]')).toHaveText('Keep item');
        await expect(content.locator('[title="Backspace target"]')).toHaveCount(0);
      }
      else {
        const items = content.locator(':scope > ul > li');
        await expect(items).toHaveCount(3);
        await expect(items.first()).toHaveText('Owner');
        const target = items.nth(1);
        await expect(target).toHaveAttribute('title', 'Backspace target');
        await expect(target.locator(':scope > p')).toHaveText('Beta tail');
        await expect(target.locator(':scope > h3')).toHaveText('After body');
        await expect(target.locator(':scope > ul')).toHaveText(['Nested branch', 'Tail sibling']);
        await expect(items.last()).toHaveText('Keep item');
      }
      await page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true })
        .getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
      expect(await content.innerHTML()).toBe(before);
      expect(await content.evaluate((root) => {
        const body = root.querySelector('li[title="Backspace target"]')!.firstElementChild!;
        const selection = document.getSelection()!;
        return { anchor: selection.anchorNode === body, offset: selection.anchorOffset, collapsed: selection.isCollapsed };
      })).toEqual({ anchor: true, offset: 0, collapsed: true });
      await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
      await expect(panel.getByRole('button', { name: t('Курсор перед Backspace', 'Caret before Backspace'), exact: true })).toBeDisabled();
      await expect(panel.getByRole('button', { name: t('Загрузить пример Backspace', 'Load Backspace sample'), exact: true })).toBeDisabled();
    });
  }
}
