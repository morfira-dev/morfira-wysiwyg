import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value = '<p>abc</p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((html) => {
    window.editor.setHTML(html);
    window.editor.setSelection(0);
    window.changes = [];
  }, value);
};

test('HTML reads immediately reflect exact DOM text, attributes, URLs and styles without trusting omitted markup', async ({ page }) => {
  await initialize(page, '<p><a href="https://example.com">Safe</a></p>');
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const paragraph = root.querySelector('p')!;
    const anchor = root.querySelector('a')!;
    const initial = window.editor.getHTML();
    const repeated = window.editor.getHTML();

    paragraph.setAttribute('data-ignored', 'first');
    const equivalent = window.editor.getHTML();
    anchor.textContent = 'Updated';
    const changedText = window.editor.getHTML();

    // Read in the same task, before MutationObserver callbacks can deliver.
    anchor.setAttribute('href', 'javascript:alert(1)');
    anchor.setAttribute('onclick', 'window.snapshotHandlerRan = true');
    paragraph.setAttribute('style', 'text-align: right; position: fixed; color: red');
    const sanitized = window.editor.getHTML();
    const json = JSON.stringify(window.editor.getJSON());
    const unsafeAttributeRemainsInOwnedDOM = anchor.hasAttribute('onclick');

    anchor.setAttribute('href', 'https://safe.example/path');
    paragraph.setAttribute('style', 'color: blue');
    paragraph.setAttribute('title', 'After');
    const changedAttributes = window.editor.getHTML();
    return { initial, repeated, equivalent, changedText, sanitized, json, changedAttributes, unsafeAttributeRemainsInOwnedDOM, changes: window.changes.length };
  });
  expect(result.repeated).toBe(result.initial);
  expect(result.equivalent).toBe(result.initial);
  expect(result.changedText).toContain('Updated');
  expect(result.sanitized).toContain('Updated');
  expect(result.sanitized).toContain('text-align: right');
  expect(result.sanitized).toContain('color: red');
  expect(result.sanitized).not.toMatch(/javascript:|onclick|position:|data-ignored/i);
  expect(result.json).not.toMatch(/javascript:|onclick|position:|data-ignored/i);
  expect(result.changedAttributes).toContain('https://safe.example/path');
  expect(result.changedAttributes).toContain('color: blue');
  expect(result.changedAttributes).toContain('title="After"');
  expect(result.unsafeAttributeRemainsInOwnedDOM).toBe(true);
  expect(result.changes).toBe(0);
});

test('rejected oversized HTML is rejected on every read and a later valid input recovers', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const previous = window.editor.getHTML();
    window.editor.surface.replaceChildren(document.createTextNode('x'.repeat(5_000_001)));
    const errors: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        window.editor.getHTML();
        errors.push('accepted');
      }
      catch (error) {
        errors.push(error instanceof Error ? error.name : String(error));
      }
    }
    window.editor.surface.innerHTML = '<p>Recovered</p>';
    const recovered = window.editor.getHTML();
    const repeated = window.editor.getHTML();
    return { previous, errors, recovered, repeated };
  });
  expect(result.previous).toBe('<p>abc</p>');
  expect(result.errors).toEqual(['RangeError', 'RangeError', 'RangeError']);
  expect(result.recovered).toBe('<p>Recovered</p>');
  expect(result.repeated).toBe(result.recovered);
});

test('intermediate HTML reads cannot replace rollback snapshots, redo or independent JSON documents', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.setSelection(3);
    const initial = window.editor.getHTML();
    window.editor.insertHTML('<p>!</p>');
    const changed = window.editor.getHTML();
    window.editor.undo();
    const undone = window.editor.getHTML();
    let intermediate = '';
    let failed = false;
    try {
      window.editor.transact((surface) => {
        surface.querySelector('p')!.textContent = 'Temporary';
        intermediate = window.editor.getHTML();
        throw new Error('Rollback this edit');
      });
    }
    catch {
      failed = true;
    }
    const rolledBack = window.editor.getHTML();
    const selection = window.editor.getSelection();
    const retainedRedo = window.editor.canRedo();
    const json = window.editor.getJSON();
    json.children.length = 0;
    const freshJSON = window.editor.getJSON();
    window.editor.redo();
    const redone = window.editor.getHTML();
    return { initial, changed, undone, intermediate, failed, rolledBack, selection, retainedRedo, freshJSON, redone };
  });
  expect(result.initial).toBe('<p>abc</p>');
  expect(result.changed).toBe('<p>abc!</p>');
  expect(result.undone).toBe(result.initial);
  expect(result.intermediate).toBe('<p>Temporary</p>');
  expect(result.failed).toBe(true);
  expect(result.rolledBack).toBe(result.initial);
  expect(result.selection).toEqual({ index: 3, length: 0 });
  expect(result.retainedRedo).toBe(true);
  expect(result.freshJSON.children).toHaveLength(1);
  expect(result.redone).toBe(result.changed);
});

test('identical initial documents remain independent between editors and destroyed access stays rejected', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { value: '<p>abc</p>' });
    const firstHTML = window.editor.getHTML();
    const secondHTML = second.getHTML();
    window.editor.surface.querySelector('p')!.textContent = 'First changed';
    const changed = window.editor.getHTML();
    const retained = second.getHTML();
    second.destroy();
    second.destroy();
    let rejected = false;
    try {
      second.getHTML();
    }
    catch {
      rejected = true;
    }
    host.remove();
    return { firstHTML, secondHTML, changed, retained, rejected };
  });
  expect(result.firstHTML).toBe(result.secondHTML);
  expect(result.changed).toBe('<p>First changed</p>');
  expect(result.retained).toBe('<p>abc</p>');
  expect(result.rejected).toBe(true);
});

for (const adapter of ['vue', 'react', 'svelte']) test(`${adapter} repeated same-value feedback retains caret and undo/redo after native input`, async ({ page }) => {
  await page.goto(`/?adapter=${adapter}`);
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.editor.setHTML('<p>abc</p>');
    window.editor.getHTML();
    window.editor.setSelection(1);
    window.changes = [];
  });
  await page.keyboard.type('Z');
  await expect(page.getByRole('textbox')).toHaveText('aZbc');
  const inserted = await page.evaluate(() => {
    const html = window.editor.getHTML();
    window.editor.setHTML(html);
    window.editor.setHTML(window.editor.getHTML());
    return { html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo() };
  });
  expect(inserted.html).toBe('<p>aZbc</p>');
  expect(inserted.selection).toEqual({ index: 2, length: 0 });
  expect(inserted.changes).toBe(1);
  expect(inserted.undo).toBe(true);
  await page.evaluate(() => window.editor.undo());
  await expect(page.getByRole('textbox')).toHaveText('abc');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 0 });
  expect(await page.evaluate(() => window.editor.canRedo())).toBe(true);
  await page.evaluate(() => window.editor.redo());
  await expect(page.getByRole('textbox')).toHaveText('aZbc');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
});
