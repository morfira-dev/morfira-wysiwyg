import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`nonfinal nested Backspace demo preserves branch order and history in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/en/playground' : '/');
    const content = page.locator('.mw-content');
    await expect(content).toBeVisible();
    const panel = page.locator('.lab-list-selection');
    await panel.locator('summary').click();
    await panel.getByLabel(t('Сценарий Backspace', 'Backspace scenario'), { exact: true }).selectOption('nested-followed');
    await panel.getByRole('button', { name: t('Загрузить пример Backspace', 'Load Backspace sample'), exact: true }).click();
    const before = await content.innerHTML();
    const beforeText = await content.textContent();
    const earlier = await content.locator('[title="Earlier branch"]').elementHandle();
    const laterBullet = await content.locator('[title="Later bullet branch"]').elementHandle();
    const laterOrdered = await content.locator('[title="Later ordered branch"]').elementHandle();
    await panel.getByRole('button', { name: t('Курсор перед Backspace', 'Caret before Backspace'), exact: true }).click();
    await page.keyboard.press('Backspace');
    const items = content.locator(':scope > ul > li');
    await expect(items).toHaveCount(3);
    await expect(items.first()).toHaveText('OwnerEarlier branch');
    await expect(items.first().locator(':scope > ul')).toHaveAttribute('title', 'Earlier branch');
    const target = items.nth(1);
    await expect(target).toHaveAttribute('title', 'Backspace target');
    await expect(target.locator(':scope > p')).toHaveText('Beta tail');
    await expect(target.locator(':scope > h3')).toHaveText('After body');
    await expect(target.locator(':scope > ul, :scope > ol')).toHaveText(['Nested branch', 'Tail sibling', 'Later bullet', 'Later ordered']);
    expect(await target.locator(':scope > ul, :scope > ol').evaluateAll((nodes) => nodes.map((node) => node.localName))).toEqual(['ul', 'ol', 'ul', 'ol']);
    await expect(target.locator('[title="Later bullet branch"]')).toHaveCSS('text-align', 'right');
    await expect(target.locator('[title="Later ordered branch"]')).toHaveCSS('text-align', 'center');
    expect(await earlier!.evaluate((node) => node.isConnected && node.parentElement?.getAttribute('title') === 'Backspace owner')).toBe(true);
    for (const node of [laterBullet, laterOrdered])
      expect(await node!.evaluate((element) => element.isConnected && element.parentElement?.getAttribute('title') === 'Backspace target')).toBe(true);
    expect(await content.textContent()).toBe(beforeText);
    await expect(items.last()).toHaveText('Keep item');
    await expect(content.locator('p ul, h3 ul')).toHaveCount(0);
    const after = await content.innerHTML();
    const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
    await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(before);
    expect(await content.evaluate((root) => {
      const selection = document.getSelection()!;
      return { body: selection.anchorNode === root.querySelector('li[title="Backspace target"] > p'), offset: selection.anchorOffset, collapsed: selection.isCollapsed };
    })).toEqual({ body: true, offset: 0, collapsed: true });
    await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    expect(await content.innerHTML()).toBe(after);
  });
}
