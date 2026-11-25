import { expect, test } from '@playwright/test';
import { createIntegrationReport, feedbackBrowserFamily } from '../../apps/docs/.vitepress/theme/integration-feedback/index.js';
import type { FeedbackReportInput } from '../../apps/docs/.vitepress/theme/integration-feedback/types.js';

const draft = (): FeedbackReportInput => ({
  scenario: 'article', packageVersion: '1.2.3', language: 'en',
  steps: 'Open a synthetic draft.\r\nPress Escape.', expected: 'The panel closes.', actual: 'The panel remains open.',
});

test('report helper uses an explicit whitelist and literal text without reading an editor or environment', () => {
  const input = {
    ...draft(), actual: '<b>Synthetic example</b>',
    document: '<p>PRIVATE_DOCUMENT_SENTINEL</p>', token: 'PRIVATE_TOKEN_SENTINEL', backendURL: 'https://private.example',
  };
  const result = createIntegrationReport(input);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.text).toContain('Scenario features: standard preset, images, save-state, content-view');
  expect(result.text).toContain('@morfira-dev/wysiwyg: 1.2.3');
  expect(result.text).toContain('Open a synthetic draft.\nPress Escape.');
  expect(result.text).toContain('<b>Synthetic example</b>');
  expect(result.text).not.toMatch(/PRIVATE_|private\.example|Browser family/);
});

test('report helper bounds input, refuses common private patterns and reduces opt-in browser information', () => {
  expect(createIntegrationReport({ ...draft(), steps: 'x'.repeat(4001) })).toMatchObject({ ok: false, field: 'steps', reason: 'bounds' });
  expect(createIntegrationReport({ ...draft(), actual: 'x'.repeat(2001) })).toMatchObject({ ok: false, field: 'actual', reason: 'bounds' });
  expect(createIntegrationReport({ ...draft(), expected: '\u0000content' })).toMatchObject({ ok: false, field: 'expected', reason: 'invalid' });
  for (const actual of ['Open https://internal.example/path', 'Contact person@example.test', 'token=synthetic-secret', 'Bearer abcdefghijklmnop'])
    expect(createIntegrationReport({ ...draft(), actual })).toMatchObject({ ok: false, field: 'actual', reason: 'private-input' });
  expect(createIntegrationReport({ ...draft(), applicationVersion: 'ghp_abcdefghijklmnopqrstuvwxyz' })).toMatchObject({ ok: false, field: 'applicationVersion', reason: 'private-input' });
  expect(createIntegrationReport({ ...draft(), packageVersion: 'latest' })).toMatchObject({ ok: false, field: 'packageVersion', reason: 'invalid' });
  expect(createIntegrationReport({ ...draft(), scenario: 'unknown' as FeedbackReportInput['scenario'] })).toMatchObject({ ok: false, field: 'scenario', reason: 'invalid' });
  const browser = feedbackBrowserFamily('Mozilla Firefox/123.0 PRIVATE_AGENT_SENTINEL');
  expect(browser).toBe('Firefox');
  const report = createIntegrationReport({ ...draft(), browser });
  expect(report.ok && report.text).toContain('Browser family: Firefox');
  expect(report.ok && report.text).not.toContain('PRIVATE_AGENT_SENTINEL');
});

for (const english of [false, true]) test(`integration scenarios preserve a local draft and generate reviewed reports (${english ? 'EN' : 'RU'})`, async ({ page }) => {
  const t = (ru: string, en: string) => english ? en : ru;
  const writes: string[] = [];
  page.on('request', (request) => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Unavailable.')) } });
  });
  await page.goto(english ? '/integration-feedback' : '/ru/integration-feedback');
  const example = page.locator('.integration-feedback-example');
  await example.locator(':scope > details > summary').click();
  const content = example.locator('.editor-field-example .mw-content');
  await content.fill('PRIVATE_EDITOR_SENTINEL');
  await example.getByLabel(t('Сценарий интеграции', 'Integration scenario'), { exact: true }).selectOption('knowledge-base');
  await expect(content).toHaveText('PRIVATE_EDITOR_SENTINEL');
  await expect(example.locator('.integration-task')).toContainText('3 × 3');
  await example.getByLabel(t('Шаги воспроизведения', 'Reproduction steps'), { exact: true }).fill('Open a synthetic table. Press Tab.');
  await example.getByLabel(t('Ожидаемое поведение', 'Expected behavior'), { exact: true }).fill('The next cell receives input.');
  await example.getByLabel(t('Фактическое поведение', 'Actual behavior'), { exact: true }).fill('<b>Synthetic observation</b>');
  await example.getByRole('button', { name: t('Подготовить отчёт', 'Generate report'), exact: true }).click();
  const preview = example.getByLabel(t('Предпросмотр отчёта', 'Report preview'), { exact: true });
  await expect(preview).toHaveValue(/<b>Synthetic observation<\/b>/);
  await expect(preview).not.toHaveValue(/PRIVATE_EDITOR_SENTINEL/);
  await expect(preview).not.toHaveValue(new RegExp(t('Семейство браузера', 'Browser family')));
  await expect(example.locator('.integration-report-preview b')).toHaveCount(0);
  const copy = example.getByRole('button', { name: t('Копировать проверенный отчёт', 'Copy reviewed report'), exact: true });
  await expect(copy).toBeDisabled();
  await example.getByLabel(t('Я прочитал отчёт и удалил частные данные', 'I reviewed the report and removed private data'), { exact: true }).check();
  await copy.click();
  await expect(example.getByRole('status').last()).toContainText(t('скопировать вручную', 'Copy the selected text manually'));
  await expect(preview).toBeFocused();
  expect(await preview.evaluate((element) => { const field = element as HTMLTextAreaElement; return field.selectionEnd - field.selectionStart === field.value.length; })).toBe(true);
  await example.getByLabel(t('Добавить только семейство браузера при подготовке отчёта', 'Include only the browser family when generating the report'), { exact: true }).check();
  await expect(preview).toHaveCount(0);
  await example.getByRole('button', { name: t('Подготовить отчёт', 'Generate report'), exact: true }).click();
  await expect(example.getByLabel(t('Предпросмотр отчёта', 'Report preview'), { exact: true })).toHaveValue(/Chromium family/);
  await example.locator(':scope > details > summary').click();
  await expect(example.locator('.editor-field-example')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('source changes synchronously revoke old copy intent and late clipboard settlement cannot restore it', async ({ page }) => {
  await page.goto('/integration-feedback');
  await page.clock.install();
  const example = page.locator('.integration-feedback-example');
  await example.getByLabel('Reproduction steps', { exact: true }).fill('Open synthetic content.');
  await example.getByLabel('Expected behavior', { exact: true }).fill('Panel closes.');
  await example.getByLabel('Actual behavior', { exact: true }).fill('Panel stays.');
  await example.getByRole('button', { name: 'Generate report', exact: true }).click();
  await example.getByLabel('I reviewed the report and removed private data', { exact: true }).check();
  const writes = await example.evaluate((root) => {
    const calls: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { calls.push(value); } } });
    const staleCopy = root.querySelector<HTMLButtonElement>('.integration-report-preview button')!;
    const actual = root.querySelector<HTMLTextAreaElement>('textarea[id$="-actual"]')!;
    actual.value = 'New observation';
    actual.dispatchEvent(new Event('input', { bubbles: true }));
    staleCopy.click();
    return calls.length;
  });
  expect(writes).toBe(0);
  await expect(example.locator('.integration-report-preview')).toHaveCount(0);
  await example.getByRole('button', { name: 'Generate report', exact: true }).click();
  await example.getByLabel('I reviewed the report and removed private data', { exact: true }).check();
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise<void>((resolve) => setTimeout(resolve, 250)) } }); });
  await example.getByRole('button', { name: 'Copy reviewed report', exact: true }).click();
  await example.getByLabel('Actual behavior', { exact: true }).fill('Newest observation');
  await page.clock.runFor(300);
  await expect(example.locator('.integration-report-preview')).toHaveCount(0);
  await expect(example.getByRole('status')).not.toContainText('Report copied');
});
