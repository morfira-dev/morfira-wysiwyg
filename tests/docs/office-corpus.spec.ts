import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  const t = (russian: string, translated: string) => english ? translated : russian;
  test(`Office provenance corpus and inert capture workflow (${english ? 'EN' : 'RU'})`, async ({ page }) => {
    await page.goto(english ? '/en/office-paste' : '/office-paste');
    const demo = page.locator('.office-corpus-example');
    await expect(demo.getByRole('button', { name: t('Воспроизвести образец', 'Replay sample'), exact: true })).toBeEnabled();
    await demo.getByLabel(t('Исходный образец', 'Source sample'), { exact: true }).selectOption('excel');
    await demo.getByRole('button', { name: t('Воспроизвести образец', 'Replay sample'), exact: true }).click();
    await expect(demo.locator('.mw-content td[colspan="3"]')).toHaveText('병합 헤더');
    await expect(demo.locator('.mw-content tr').nth(3).locator('td')).toHaveCount(3);
    await demo.getByRole('button', { name: t('Отменить вставку', 'Undo paste'), exact: true }).click();
    await expect(demo.locator('.mw-content')).toHaveText('');
    await demo.getByLabel(t('Исходный образец', 'Source sample'), { exact: true }).selectOption('docs-native');
    await demo.getByRole('button', { name: t('Воспроизвести образец', 'Replay sample'), exact: true }).click();
    await expect(demo.locator('.mw-content ul > li')).toHaveText('List delta');
    const bold = demo.locator('.mw-content span').filter({ hasText: /^Bold gamma$/ });
    expect(await bold.evaluate((node) => (node as HTMLElement).style.fontWeight)).toBe('700');
    const capture = demo.getByLabel(t('Поле захвата буфера', 'Clipboard capture field'), { exact: true });
    await capture.evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/html', '<img src="https://capture.invalid/private" onerror="window.captureExecuted=true"><script>window.captureExecuted=true</script>');
      data.setData('text/plain', 'literal sample');
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: data });
      element.dispatchEvent(event);
    });
    await expect(capture).toHaveValue(/onerror=/);
    await expect(demo.getByRole('status')).toContainText(t('HTML не исполнялся', 'HTML was not executed'));
    expect(await demo.locator('img,script').count()).toBe(0);
    const downloaded = page.waitForEvent('download');
    await demo.getByRole('button', { name: t('Скачать JSON буфера', 'Download clipboard JSON'), exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe('morfira-office-capture.json');
  });
}
