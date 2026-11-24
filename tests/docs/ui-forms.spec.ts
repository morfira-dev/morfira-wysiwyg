import { expect, test } from '@playwright/test';

for (const english of [false, true]) test(`UI forms guide exposes standalone public integrations in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
  await page.goto(english ? '/ui' : '/ru/ui');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(english ? 'Reusable UI forms' : 'Переиспользуемые UI-формы');
  for (const [factory, entry] of [['createLinkForm', 'links'], ['createImageForm', 'images'], ['createSearchForm', 'search']]) {
    await expect(page.getByRole('cell', { name: factory, exact: true })).toHaveCount(1);
    await expect(page.getByRole('cell', { name: `@morfira-dev/wysiwyg/ui/${entry}`, exact: true })).toHaveCount(1);
    const example = page.locator('.vp-doc pre').filter({ hasText: `const form = ${factory}` })
      .filter({ hasText: 'editor.destroy()' });
    await expect(example).toHaveCount(1);
    await expect(example).toContainText('@morfira-dev/wysiwyg/ui/forms.css');
    await expect(example).toContainText('form.destroy()');
    await expect(example).toContainText('editor.destroy()');
  }
  await expect(page.getByRole('cell', { name: 'ImageFormValues', exact: true })).toHaveCount(1);
  await expect(page.getByRole('cell', { name: 'getValues()', exact: true })).toHaveCount(1);
  await expect(page.getByRole('cell', { name: 'setValues(partial)', exact: true })).toHaveCount(1);
  await expect(page.locator('.vp-doc')).toContainText('ImageUploadOptions');
  await expect(page.locator('.vp-doc')).toContainText('role="form"');
  await expect(page.locator('.vp-doc')).toContainText('--mw-form-gap');
});
