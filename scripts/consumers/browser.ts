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
          const links = page.getByRole('form', { name: 'Consumer links', exact: true });
          const images = page.getByRole('form', { name: 'Consumer images', exact: true });
          const search = page.getByRole('form', { name: 'Consumer search', exact: true });
          await expect(page.locator('.mw-form')).toHaveCount(3);
          await page.evaluate(() => {
            const { editor, forms } = window.morfiraConsumer;
            editor!.focus();
            editor!.setSelection(0, 7);
            forms!.links.setValues({ href: 'https://example.com/consumer', text: '', title: 'Packed link', newTab: false });
          });
          await links.getByRole('button', { name: 'Create link', exact: true }).click();
          await expect(content.locator('a')).toHaveAttribute('href', 'https://example.com/consumer');
          await expect(content.locator('a')).toHaveText('Initial');
          await page.evaluate(() => window.morfiraConsumer.editor!.undo());
          await expect(content.locator('a')).toHaveCount(0);
          await expect(content).toHaveText('Initial text');
          await page.evaluate(() => {
            const { editor, forms } = window.morfiraConsumer;
            editor!.focus();
            editor!.setSelection(12);
            forms!.images.setValues({ src: '/consumer-image.svg', alt: 'Packed image', width: '32', height: '24', caption: '' });
          });
          await images.getByRole('button', { name: 'Insert image', exact: true }).click();
          await expect(content.locator('img')).toHaveAttribute('src', '/consumer-image.svg');
          await expect(content.locator('img')).toHaveAttribute('alt', 'Packed image');
          await page.evaluate(() => window.morfiraConsumer.editor!.undo());
          await expect(content.locator('img')).toHaveCount(0);
          await expect(content).toHaveText('Initial text');
          await page.evaluate(() => window.morfiraConsumer.forms!.search.setValues({ query: 'text', replacement: 'review' }));
          await search.getByRole('button', { name: 'Find', exact: true }).click();
          await expect(search.getByRole('status')).toHaveText('Match 1 of 1');
          await search.getByRole('button', { name: 'Replace all', exact: true }).click();
          await expect(content).toHaveText('Initial review');
          await page.evaluate(() => window.morfiraConsumer.editor!.undo());
          await expect(content).toHaveText('Initial text');
          await search.getByRole('button', { name: 'Clear search', exact: true }).click();
          await page.evaluate(() => {
            const editor = window.morfiraConsumer.editor!;
            editor.focus();
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
          const beforeNote = await page.evaluate(() => ({ html: window.morfiraConsumer.editor!.getHTML(), changes: window.morfiraConsumer.changes }));
          assert.equal(await page.evaluate(() => window.morfiraConsumer.insertNote!('<sdk> & note')), true, `${adapter}: installed SDK command must execute`);
          const note = content.locator('blockquote[data-mw-node="consumer:note"]');
          await expect(note).toHaveText('<sdk> & note');
          await expect(note).toHaveAttribute('data-tone', 'note');
          assert.equal(await page.evaluate(() => window.morfiraConsumer.changes), beforeNote.changes + 1, `${adapter}: SDK command must emit one controlled-value change`);
          const noteJSON = await page.evaluate(() => window.morfiraConsumer.editor!.getJSON());
          const pendingNodes = [...noteJSON.children];
          let storedNote: typeof noteJSON.children[number] | undefined;
          while (pendingNodes.length) {
            const node = pendingNodes.pop()!;
            if (node.type !== 'element') continue;
            if (node.attributes['data-mw-node'] === 'consumer:note') {
              storedNote = node;
              break;
            }
            pendingNodes.push(...node.children);
          }
          assert.deepEqual(storedNote, {
            type: 'element', tag: 'blockquote',
            attributes: { 'data-mw-node': 'consumer:note', 'data-tone': 'note' },
            children: [{ type: 'text', text: '<sdk> & note' }],
          }, `${adapter}: registered identity, attributes and literal text must survive JSON and controlled feedback`);
          await page.evaluate(() => window.morfiraConsumer.editor!.undo());
          await expect(note).toHaveCount(0);
          assert.equal(await page.evaluate(() => window.morfiraConsumer.editor!.getHTML()), beforeNote.html, `${adapter}: SDK undo must restore the document`);
          await page.evaluate(() => window.morfiraConsumer.editor!.redo());
          await expect(note).toHaveText('<sdk> & note');
          await expect(note).toHaveAttribute('data-tone', 'note');
          assert.deepEqual(await page.evaluate(() => window.morfiraConsumer.editor!.getJSON()), noteJSON, `${adapter}: SDK redo must restore validated metadata`);
          await page.evaluate(() => window.morfiraConsumer.editor!.undo());
          const userChanges = await page.evaluate(() => window.morfiraConsumer.changes);
          assert.ok(userChanges > 0, `${adapter}: native changes must reach the application`);
          await page.locator('[data-action="external"]').click();
          await expect(content).toHaveText('External 1');
          assert.equal(await page.evaluate(() => window.morfiraConsumer.changes), userChanges, `${adapter}: external replacement must not emit a user change`);
          await page.locator('[data-action="readonly"]').click();
          await expect(content).toHaveAttribute('contenteditable', 'false');
          assert.equal(await page.evaluate(() => window.morfiraConsumer.insertNote!('blocked SDK note')), false, `${adapter}: read-only must block installed SDK commands`);
          await expect(note).toHaveCount(0);
          await content.focus();
          await page.keyboard.type('blocked');
          await expect(content).toHaveText('External 1');
          await expect(links.getByRole('button', { name: 'Create link', exact: true })).toBeDisabled();
          await expect(images.getByRole('button', { name: 'Insert image', exact: true })).toBeDisabled();
          await search.getByLabel('Find text', { exact: true }).fill('External');
          await search.getByRole('button', { name: 'Find', exact: true }).click();
          await expect(search.getByRole('status')).toHaveText('Match 1 of 1');
          await expect(search.getByRole('button', { name: 'Replace match', exact: true })).toBeDisabled();
          await expect(search.getByRole('button', { name: 'Replace all', exact: true })).toBeDisabled();
          await page.locator('[data-action="external"]').click();
          await expect(content).toHaveText('External 2');
          assert.equal(await page.evaluate(() => window.morfiraConsumer.changes), userChanges, `${adapter}: read-only external replacement must remain silent`);
          await page.locator('[data-action="unmount"]').click();
          await expect(page.locator('.mw-editor')).toHaveCount(0);
          await expect(page.locator('.mw-suggestions')).toHaveCount(0);
          await expect(page.locator('.mw-form')).toHaveCount(0);
          await expect(page.locator('[data-consumer-ui]')).toHaveCount(0);
          assert.equal(await page.evaluate(() => typeof window.morfiraConsumer.insertNote), 'undefined', `${adapter}: SDK probe must release its editor on destroy`);
          assert.equal(await page.evaluate(() => {
            try { window.morfiraConsumer.editor!.getHTML(); }
            catch { return true; }
            return false;
          }), true, `${adapter}: unmount must dispose the editor API`);
          assert.deepEqual(errors, [], `${adapter}/${name}: unexpected browser errors`);
          scenarios.push({ adapter, browser: name, browserVersion: browser.version(), userChanges, uiForms: true, sdk: true });
          console.log(`Packed consumer ${adapter}/${name}: controlled input, UI forms/history, plugin SDK/schema/history, slash/history, external values, read-only and teardown passed.`);
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
