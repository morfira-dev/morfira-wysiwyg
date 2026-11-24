import { expect, test } from '@playwright/test';
for (const english of [false, true]) {
  const t = (ru: string, en: string) => english ? en : ru;
  test(`code blocks demonstrate a localized modal and external highlighting (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(english ? '/code-blocks' : '/ru/code-blocks');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('Блоки кода', 'Code blocks'));
    const demo = page.locator('.code-blocks-example');
    const edit = demo.getByRole('button', { name: t('Изменить блок кода', 'Edit code block'), exact: true });
    await expect(edit).toBeEnabled();
    await expect(demo.locator('.code-block-previews .mw-code-token-keyword').first()).toHaveText('const');
    await expect(demo.locator('.mw-content .mw-code-token-keyword')).toHaveCount(0);
    await edit.click();
    const dialog = demo.getByRole('dialog', { name: t('Блок кода', 'Code block'), exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: t('Исходник кода', 'Code source'), exact: true }).fill('return "<script>literal</script>";\n');
    await dialog.getByRole('combobox', { name: t('Язык кода', 'Code language') }).selectOption('javascript');
    await dialog.getByRole('button', { name: t('Применить код', 'Apply code'), exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(demo.locator('.mw-content pre')).toHaveAttribute('data-language', 'javascript');
    await expect(demo.locator('.mw-content pre')).toHaveText('return "<script>literal</script>";\n');
    await expect(demo.locator('.mw-content script')).toHaveCount(0);
    await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(demo.locator('.mw-content pre')).toHaveAttribute('data-language', 'typescript');
    expect(errors).toEqual([]);
  });
}
