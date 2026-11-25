import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test(`complete editor field labels, validates and retries in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const t = (ru: string, en: string) => english ? en : ru;
    await page.goto(english ? '/editor-field' : '/ru/editor-field');
    const example = page.locator('.editor-field-example');
    const content = example.locator('.mw-content');
    await expect(content).toHaveAccessibleName(t('Текст публикации', 'Publication body'));
    await expect(content).toHaveAttribute('aria-invalid', 'false');
    const description = await content.getAttribute('aria-describedby');
    expect(description).toBeTruthy();
    await expect(page.locator(`[id="${description}"]`)).toContainText(t('Добавьте текст.', 'Add some text.'));
    await content.fill('');
    await example.getByRole('button', { name: t('Сохранить публикацию', 'Save publication'), exact: true }).click();
    await expect(content).toBeFocused();
    await expect(content).toHaveAttribute('aria-invalid', 'true');
    await expect(example.getByRole('alert').first()).toHaveText(t('Добавьте текст перед сохранением.', 'Add some text before saving.'));
    await content.fill('Article first revision');
    await expect(content).toHaveAttribute('aria-invalid', 'false');
    await example.getByRole('checkbox', { name: t('Только чтение', 'Read only'), exact: true }).check();
    await expect(content).toHaveAttribute('contenteditable', 'false');
    await expect(example.getByRole('button', { name: t('Имитировать загрузку изображения', 'Simulate image upload'), exact: true })).toBeDisabled();
    await example.getByRole('checkbox', { name: t('Только чтение', 'Read only'), exact: true }).uncheck();
    await example.getByRole('button', { name: t('Следующее сохранение с ошибкой', 'Fail next save'), exact: true }).click();
    await example.getByRole('button', { name: t('Сохранить публикацию', 'Save publication'), exact: true }).click();
    await expect(example.getByRole('alert').first()).toHaveText(t('Не удалось сохранить. Попробуйте ещё раз.', 'Could not save. Try again.'));
    await example.getByRole('button', { name: t('Повторить сохранение', 'Retry save'), exact: true }).click();
    await expect(example.locator('.field-status')).toHaveText(t('Сохранено', 'Saved'));
    await expect(example.locator('.field-saved')).toHaveText('Article first revision');
  });
}

test('saving one snapshot preserves newer dirty edits and restore cancels an unchanged baseline request', async ({ page }) => {
  await page.goto('/editor-field');
  const example = page.locator('.editor-field-example');
  const content = example.locator('.mw-content');
  const save = example.getByRole('button', { name: 'Save publication', exact: true });
  await content.fill('Saved snapshot');
  await save.click();
  await expect(example.locator('.field-status')).toHaveText('Saving…');
  await content.fill('Newer unsaved revision');
  await expect(example.locator('.field-saved')).toHaveText('Saved snapshot');
  await expect(example.locator('.field-status')).toHaveText('Unsaved changes');
  await expect(content).toHaveText('Newer unsaved revision');
  await example.getByRole('button', { name: 'Restore saved', exact: true }).click();
  await expect(content).toHaveText('Saved snapshot');
  // Returning to equal content is still a dirty user revision, so this request
  // really starts. Its Restore value is canonical-equal and setJSON alone would
  // be a no-op rather than invalidating the request.
  await content.fill('Temporary dirty text');
  await content.fill('Saved snapshot');
  await expect(example.locator('.field-status')).toHaveText('Unsaved changes');
  await page.clock.install();
  await save.click();
  await expect(example.locator('.field-status')).toHaveText('Saving…');
  await example.getByRole('button', { name: 'Restore saved', exact: true }).click();
  expect(await example.locator('.field-status').textContent()).toBe('Saved');
  await content.fill('Edit after restore');
  await expect(example.locator('.field-status')).toHaveText('Unsaved changes');
  await expect(example.locator('.field-saved')).toHaveText('Saved snapshot');
  await expect(content).toHaveText('Edit after restore');
  // Advance beyond the local service's 650ms completion deadline, without a
  // wall-clock sleep: no old request may later acknowledge the newer edit.
  await page.clock.fastForward(700);
  await expect(example.locator('.field-status')).toHaveText('Unsaved changes');
  await expect(content).toHaveText('Edit after restore');
  await expect(example.locator('.field-saved')).toHaveText('Saved snapshot');
});

test('local image upload can cancel and succeed without transporting a file', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') requests.push(request.url());
  });
  await page.goto('/editor-field');
  const example = page.locator('.editor-field-example');
  const upload = example.getByRole('button', { name: 'Simulate image upload', exact: true });
  await upload.click();
  await example.getByRole('button', { name: 'Cancel upload', exact: true }).click();
  await expect(upload).toBeEnabled();
  await expect(example.locator('.mw-content img')).toHaveCount(0);
  await upload.click();
  await expect(example.locator('.mw-content img')).toHaveAttribute('alt', 'Local upload example');
  expect(requests).toEqual([]);
});
