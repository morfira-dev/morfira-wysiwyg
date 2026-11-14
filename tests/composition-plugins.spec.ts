import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MentionOption, SlashOption, SuggestionController } from '@morfira-dev/wysiwyg/plugins/suggestions';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((html) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'composition-plugins-test';
    document.body.append(host);
    const queries: string[] = [];
    window.editor = window.createEditor(host, {
      value: html,
      plugins: [
        window.createMentions({ debounceMs: 0, provide: ({ query }) => { queries.push(query); return [{ id: 'anna', label: 'Anna' }]; } }),
        window.createSlash({ debounceMs: 0, provide: () => [{ id: 'heading', label: 'Heading', action: 'heading2' }], actions: window.createSlashActions() }),
        window.createMarkdownShortcuts(),
      ],
    });
    window.editor.providePlugin('composition-queries', queries);
    window.changes = [];
    window.editor.subscribe((change) => window.changes.push(change));
    window.editor.setSelection(window.editor.surface.textContent!.length);
  }, value);
};

for (const kind of ['mentions', 'slash'] as const) test(`${kind}: legacy IME Enter 229 cannot choose a ready result`, async ({ page }) => {
  await initialize(page, kind === 'mentions' ? '<p>@a</p>' : '<p>/h</p>');
  await page.evaluate((name) => window.editor.getPlugin<SuggestionController<MentionOption | SlashOption>>(name)!.open(), kind);
  await expect.poll(() => page.evaluate((name) => window.editor.getPlugin<SuggestionController<MentionOption | SlashOption>>(name)!.getState().status, kind)).toBe('ready');
  expect(await page.evaluate(() => {
    const key = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true, isComposing: false });
    window.editor.surface.dispatchEvent(key);
    return key.defaultPrevented;
  })).toBe(false);
  expect(await page.evaluate((name) => window.editor.getPlugin<SuggestionController<MentionOption | SlashOption>>(name)!.getState().status, kind)).toBe('closed');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(kind === 'mentions' ? '<p>@a</p>' : '<p>/h</p>');
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);

  await page.evaluate((name) => window.editor.getPlugin<SuggestionController<MentionOption | SlashOption>>(name)!.open(), kind);
  await expect.poll(() => page.evaluate((name) => window.editor.getPlugin<SuggestionController<MentionOption | SlashOption>>(name)!.getState().status, kind)).toBe('ready');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(kind === 'mentions' ? '<p>@Anna </p>' : '<h2><br></h2>');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(kind === 'mentions' ? '<p>@a</p>' : '<p>/h</p>');
});

test('composition cancels lookup and final composition input stays closed until ordinary Unicode typing', async ({ page }) => {
  await initialize(page, '<p>@a</p>');
  await page.evaluate(() => window.mentionCommands(window.editor).open());
  await expect.poll(() => page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('ready');
  await page.evaluate(() => {
    const surface = window.editor.surface;
    surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    surface.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertCompositionText', data: 'あ', isComposing: true }));
    surface.querySelector('p')!.textContent = '@あ';
    window.editor.setSelection(2);
    surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'あ', isComposing: true }));
    surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'あ' }));
    surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromComposition', data: 'あ' }));
  });
  expect(await page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('closed');
  expect(await page.evaluate(() => window.editor.getPlugin<string[]>('composition-queries'))).toEqual(['a']);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>@あ</p>');
  await page.keyboard.type('b');
  await expect.poll(() => page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('ready');
  expect(await page.evaluate(() => window.editor.getPlugin<string[]>('composition-queries'))).toEqual(['a', 'あb']);
});

test('Markdown ignores IME candidate space and Enter and resumes only on an ordinary trigger', async ({ page }) => {
  await initialize(page, '<p>##</p>');
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const space = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' });
    const enter = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' });
    surface.dispatchEvent(space);
    surface.dispatchEvent(enter);
    surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    return [space.defaultPrevented, enter.defaultPrevented];
  })).toEqual([false, false]);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>##</p>');
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  await page.keyboard.press('Space');
  await expect(page.locator('.composition-plugins-test h2')).toHaveCount(1);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>##</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
});
