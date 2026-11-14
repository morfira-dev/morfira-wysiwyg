import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const placeCaret = (page: Page, title: string) => page.locator(`.mw-content [title="${title}"]`).evaluate((node) => {
  const content = node.closest<HTMLElement>('.mw-content')!;
  content.focus();
  const text = node.firstChild!;
  document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
  document.dispatchEvent(new Event('selectionchange'));
});

for (const english of [false, true]) test(`optional checklist public controls in ${english ? 'English desktop playground' : 'Russian mobile homepage'}`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  await page.setViewportSize({ width: english ? 1280 : 390, height: 900 });
  await page.goto(english ? '/en/playground' : '/');
  const content = page.locator('.mw-content');
  await expect(content).toBeVisible();
  const panel = page.locator('.lab-checklists');
  await panel.locator('summary').click();
  const load = panel.getByRole('button', { name: t('Загрузить чек-лист', 'Load checklist'), exact: true });
  await load.click();
  const first = content.locator('[title="Checklist first"]');
  const ordinary = content.locator('[title="Checklist ordinary"]');
  await expect(first).toHaveAttribute('data-checklist-checked', 'false');
  await expect(content.locator('[title="Checklist done"]')).toHaveAttribute('data-checklist-checked', 'true');
  await expect(ordinary).not.toHaveAttribute('data-checklist-checked');
  const originalText = await first.textContent();
  await placeCaret(page, 'Checklist first');
  const toggle = panel.getByRole('button', { name: t('Переключить выполнение', 'Toggle completion'), exact: true });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(first).toHaveAttribute('data-checklist-checked', 'true');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const toolbar = page.getByRole('toolbar', { name: t('Форматирование', 'Formatting'), exact: true });
  await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(first).toHaveAttribute('data-checklist-checked', 'false');
  await toolbar.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
  await expect(first).toHaveAttribute('data-checklist-checked', 'true');
  await placeCaret(page, 'Checklist first');
  const actualFirst = await first.elementHandle();
  await panel.getByRole('button', { name: t('Сделать обычным пунктом', 'Make an ordinary item'), exact: true }).click();
  await expect(first).not.toHaveAttribute('data-checklist-checked');
  await expect(first).toHaveText(originalText!);
  expect(await actualFirst!.evaluate((node) => node.isConnected)).toBe(true);
  await toolbar.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
  await expect(first).toHaveAttribute('data-checklist-checked', 'true');
  await placeCaret(page, 'Checklist ordinary');
  await panel.getByRole('button', { name: t('Сделать задачей', 'Make a task'), exact: true }).click();
  await expect(ordinary).toHaveAttribute('data-checklist-checked', 'false');
  await panel.getByRole('button', { name: t('Отметить выполненной', 'Mark complete'), exact: true }).click();
  await expect(ordinary).toHaveAttribute('data-checklist-checked', 'true');
  await panel.getByRole('button', { name: t('Снять выполнение', 'Mark incomplete'), exact: true }).click();
  await expect(ordinary).toHaveAttribute('data-checklist-checked', 'false');
  await expect(content.locator('[title="Checklist sample"] > li')).toHaveCount(3);
  await expect(content.locator('input[type="checkbox"], button')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const viewportWidth = page.viewportSize()!.width;
  const buttons = panel.getByRole('button');
  for (let index = 0; index < await buttons.count(); index++) {
    const box = await buttons.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
  }
  await page.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
  for (let index = 0; index < await buttons.count(); index++) await expect(buttons.nth(index)).toBeDisabled();
});
