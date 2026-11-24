import { expect, test } from '@playwright/test';

const objects = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(objects)];
};

for (const english of [false, true]) {
  const t = (ru: string, en: string) => english ? en : ru;
  const path = english ? '/plugin-sdk' : '/ru/plugin-sdk';

  test(`SDK guide preserves schema metadata, command history and readonly in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(t('SDK плагинов и расширяемая схема', 'Plugin SDK and extensible schema'));
    const demo = page.locator('.sdk-example');
    const content = demo.locator('.mw-content');
    const callouts = content.locator('blockquote[data-mw-node="demo:callout"]');
    const references = content.locator('span[data-mw-node="demo:reference"]');
    const html = demo.getByLabel(t('HTML примера SDK', 'SDK example HTML'), { exact: true });
    const json = demo.getByLabel(t('JSON примера SDK', 'SDK example JSON'), { exact: true });
    await expect(content).toBeVisible();
    await expect(callouts).toHaveCount(1);
    await expect(callouts).toHaveAttribute('data-tone', 'note');
    await expect(references).toHaveAttribute('data-id', 'MORFIRA-1');
    const original = await html.inputValue();

    await demo.getByLabel(t('Подпись', 'Label'), { exact: true }).fill('<b>SDK note</b>');
    await demo.getByLabel(t('Тип заметки', 'Note tone'), { exact: true }).selectOption('warning');
    await demo.getByRole('button', { name: t('Вставить заметку', 'Insert callout'), exact: true }).click();
    await expect(callouts).toHaveCount(2);
    await expect(callouts.last()).toHaveText('<b>SDK note</b>');
    await expect(callouts.last()).toHaveAttribute('data-tone', 'warning');
    await expect(callouts.last().locator('b')).toHaveCount(0);
    await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(html).toHaveValue(original);
    await expect(demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true })).toBeDisabled();
    await demo.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    await expect(callouts.last()).toHaveAttribute('data-tone', 'warning');

    await demo.getByLabel(t('Подпись', 'Label'), { exact: true }).fill('SDK reference');
    await demo.getByLabel(t('ID ссылки', 'Reference ID'), { exact: true }).fill('TASK-42');
    await demo.getByRole('button', { name: t('Вставить reference', 'Insert reference'), exact: true }).click();
    await expect(references).toHaveCount(2);
    await expect(references.last()).toHaveText('SDK reference');
    await expect(references.last()).toHaveAttribute('data-id', 'TASK-42');
    const document = JSON.parse(await json.inputValue()) as unknown;
    expect(objects(document)).toContainEqual({ 'data-mw-node': 'demo:reference', 'data-id': 'TASK-42' });
    expect(objects(document)).toContainEqual({ 'data-mw-node': 'demo:callout', 'data-tone': 'warning' });
    await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(references).toHaveCount(1);
    await demo.getByRole('button', { name: t('Повторить', 'Redo'), exact: true }).click();
    await expect(references.last()).toHaveAttribute('data-id', 'TASK-42');

    const beforeReadOnly = await html.inputValue();
    await demo.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(content).toHaveAttribute('contenteditable', 'false');
    await expect(demo.getByRole('button', { name: t('Вставить заметку', 'Insert callout'), exact: true })).toBeDisabled();
    await expect(demo.getByRole('button', { name: t('Вставить reference', 'Insert reference'), exact: true })).toBeDisabled();
    await expect(html).toHaveValue(beforeReadOnly);
    await demo.getByRole('button', { name: t('Только чтение', 'Read only'), exact: true }).click();
    await expect(content).toHaveAttribute('contenteditable', 'true');
    expect(errors).toEqual([]);
  });

  test(`SDK guide rejects invalid command data and recovers in ${english ? 'English' : 'Russian'}`, async ({ page }) => {
    await page.goto(path);
    const demo = page.locator('.sdk-example');
    const content = demo.locator('.mw-content');
    await expect(content).toBeVisible();
    const html = demo.getByLabel(t('HTML примера SDK', 'SDK example HTML'), { exact: true });
    const original = await html.inputValue();
    await demo.getByLabel(t('ID ссылки', 'Reference ID'), { exact: true }).fill('x'.repeat(65));
    await demo.getByRole('button', { name: t('Вставить reference', 'Insert reference'), exact: true }).click();
    await expect(demo.getByRole('alert')).toHaveText(t('Команда отклонена. Проверьте подпись и ID ссылки.', 'Command rejected. Check the label and reference ID.'));
    await expect(html).toHaveValue(original);
    await expect(demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true })).toBeDisabled();
    await demo.getByLabel(t('ID ссылки', 'Reference ID'), { exact: true }).fill('RECOVERED-1');
    await demo.getByRole('button', { name: t('Вставить reference', 'Insert reference'), exact: true }).click();
    await expect(content.locator('[data-id="RECOVERED-1"]')).toHaveCount(1);
    await expect(demo.getByRole('alert')).toHaveCount(0);
    await demo.getByRole('button', { name: t('Отменить', 'Undo'), exact: true }).click();
    await expect(html).toHaveValue(original);
  });
}
