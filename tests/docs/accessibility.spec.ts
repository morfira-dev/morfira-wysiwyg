import { expect, test } from '@playwright/test';

for (const english of [false, true]) {
  test.describe(english ? 'EN desktop accessibility laboratory' : 'RU mobile-emulated accessibility laboratory', () => {
    test.use(english
      ? { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false }
      : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('public controls preserve the document, keyboard focus and page containment', async ({ page }) => {
      const t = (russian: string, translated: string) => english ? translated : russian;
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(english ? '/accessibility' : '/ru/accessibility');
      const demo = page.locator('.accessibility-example');
      const content = demo.locator('.mw-content');
      const width = demo.getByRole('combobox', { name: t('Ширина контейнера', 'Host width'), exact: true });
      const density = demo.getByRole('combobox', { name: t('Плотность панели', 'Toolbar density'), exact: true });
      const locale = demo.getByRole('combobox', { name: t('Язык редактора', 'Editor language'), exact: true });
      const readOnly = demo.getByRole('checkbox', { name: t('Только чтение', 'Read only'), exact: true });
      const focus = demo.getByRole('button', { name: t('Фокус в редактор', 'Focus editor'), exact: true });
      await expect(focus).toBeEnabled();
      await expect(content).toHaveAttribute('contenteditable', 'true');
      await expect(content.locator('h2')).toHaveCSS('border-top-width', '0px');
      const before = await content.innerHTML();

      await width.focus();
      await page.keyboard.press('Tab');
      await expect(density).toBeFocused();
      await width.selectOption('320');
      await density.selectOption('compact');
      await expect(demo.locator('.mw-editor-ui')).toHaveAttribute('data-density', 'compact');
      await locale.selectOption(english ? 'ru' : 'en');
      await expect(demo.locator('[data-mw-ui-action="bold"]')).toHaveAttribute('aria-label', english ? 'Полужирный' : 'Bold');
      expect(await content.innerHTML()).toBe(before);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const hostWidth = await demo.locator('.accessibility-editor-frame').evaluate((element) => element.getBoundingClientRect().width);
      expect(hostWidth).toBeLessThanOrEqual(320);

      await readOnly.check();
      await expect(content).toHaveAttribute('contenteditable', 'false');
      await expect(demo.locator('[data-mw-ui-action="bold"]')).toBeDisabled();
      expect(await content.innerHTML()).toBe(before);
      await readOnly.uncheck();
      await focus.click();
      await expect(content).toBeFocused();
      const toolbar = demo.getByRole('toolbar');
      await toolbar.locator('[tabindex="0"]:visible').first().focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => toolbar.evaluate((element) => element.contains(element.ownerDocument.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(content).toBeFocused();
      expect(await content.innerHTML()).toBe(before);
      await expect(page.locator('.vp-doc')).toContainText(t('Не проверено в этом этапе', 'Not verified in this stage'));
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
