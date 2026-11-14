import assert from 'node:assert/strict';
import { chromium, firefox, webkit, expect } from '@playwright/test';
import type { ConsumerAdapter, ConsumerScenario } from './types.js';

export const verifyConsumers = async (url: string, adapters: readonly ConsumerAdapter[] = ['vue', 'react', 'svelte', 'angular', 'web-component']): Promise<ConsumerScenario[]> => {
  const scenarios: ConsumerScenario[] = [];
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch();
    try {
      for (const adapter of adapters) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        try {
          await page.goto(`${url}/${adapter}.html`);
          const content = page.getByRole('textbox', { name: 'Consumer editor', exact: true });
          await expect(content).toHaveText('Initial');
          await page.evaluate(() => window.morfiraConsumer.editor!.setSelection(7));
          await page.keyboard.type(' text');
          await expect(content).toHaveText('Initial text');
          await page.evaluate(() => {
            const editor = window.morfiraConsumer.editor!;
            editor.setSelection(0, editor.surface.textContent!.length);
          });
          await page.keyboard.type('/h');
          await expect(page.getByRole('option', { name: 'Heading 2', exact: true })).toBeVisible();
          const beforeChoice = await page.evaluate(() => window.morfiraConsumer.changes);
          await page.keyboard.press('Enter');
          await expect(content.locator('h2')).toHaveCount(1);
          assert.equal(await page.evaluate(() => window.morfiraConsumer.changes), beforeChoice + 1, `${adapter}: composed command must emit one final change`);
          await page.keyboard.type('Title');
          await expect(content.locator('h2')).toHaveText('Title');
          await page.evaluate(() => { window.morfiraConsumer.editor!.undo(); window.morfiraConsumer.editor!.undo(); });
          await expect(content).toHaveText('/h');
          await page.evaluate(() => window.morfiraConsumer.editor!.redo());
          await page.keyboard.type('Again');
          await expect(content.locator('h2')).toHaveText('Again');
          const userChanges = await page.evaluate(() => window.morfiraConsumer.changes);
          assert.ok(userChanges > 0, `${adapter}: native changes must reach the application`);
          await page.locator('[data-action="external"]').click();
          await expect(content).toHaveText('External 1');
          assert.equal(await page.evaluate(() => window.morfiraConsumer.changes), userChanges, `${adapter}: external replacement must not emit a user change`);
          await page.locator('[data-action="readonly"]').click();
          await expect(content).toHaveAttribute('contenteditable', 'false');
          await content.focus();
          await page.keyboard.type('blocked');
          await expect(content).toHaveText('External 1');
          await page.locator('[data-action="external"]').click();
          await expect(content).toHaveText('External 2');
          assert.equal(await page.evaluate(() => window.morfiraConsumer.changes), userChanges, `${adapter}: read-only external replacement must remain silent`);
          await page.locator('[data-action="unmount"]').click();
          await expect(page.locator('.mw-editor')).toHaveCount(0);
          await expect(page.locator('.mw-suggestions')).toHaveCount(0);
          assert.equal(await page.evaluate(() => {
            try { window.morfiraConsumer.editor!.getHTML(); }
            catch { return true; }
            return false;
          }), true, `${adapter}: unmount must dispose the editor API`);
          assert.deepEqual(errors, [], `${adapter}/${name}: unexpected browser errors`);
          scenarios.push({ adapter, browser: name, browserVersion: browser.version(), userChanges });
          console.log(`Packed consumer ${adapter}/${name}: controlled input, slash/history, external values, read-only and teardown passed.`);
        }
        catch (error) {
          const trace = await page.evaluate(() => {
            const editor = window.morfiraConsumer.editor!;
            return { html: editor.getHTML(), selection: editor.getSelection() };
          }).catch(() => undefined);
          if (trace) console.error(`Packed consumer failure ${adapter}/${name}: ${JSON.stringify(trace)}`);
          throw error;
        }
        finally {
          await page.close();
        }
      }
    }
    finally {
      await browser.close();
    }
  }
  return scenarios;
};
