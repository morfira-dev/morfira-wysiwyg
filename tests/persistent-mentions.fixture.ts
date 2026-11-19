import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MentionOption } from '@morfira-dev/wysiwyg/plugins/mentions';
import type { PersistentMentionSettings } from './persistent-mentions.types.js';

export const mentionHTML = '<span data-mw-node="morfira:mention" data-mention-id="person-42">@Anna</span>';
export const initializePersistentMention = async (page: Page, value = '<p>@a</p>', settings: PersistentMentionSettings = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, settings }) => {
    const path = '/packages/wysiwyg/dist/plugins/mentions.js';
    window.persistentMentionModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/mentions');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'persistent-mention-test';
    document.body.append(host);
    window.persistentMentionCalls = 0;
    window.persistentMentionRequests = [];
    window.persistentMentionPeople = [{ id: 'person-42', label: 'Anna' }];
    const plugin = window.persistentMentionModule.mentions({
      persistent: settings.persistent ?? true,
      debounceMs: 0,
      provide: ({ signal }) => {
        window.persistentMentionCalls++;
        return settings.deferred
          ? new Promise<readonly MentionOption[]>((resolve) => window.persistentMentionRequests.push({ signal, resolve }))
          : window.persistentMentionPeople;
      },
    });
    window.changes = [];
    window.editor = window.createEditor(host, {
      value,
      plugins: settings.tables ? [plugin, window.createTables()] : [plugin],
      onChange: (change) => window.changes.push(change),
    });
    window.dispose = () => window.editor.destroy();
    window.persistentMentionAPI = window.persistentMentionModule.mentionCommands(window.editor);
    window.editor.setSelection(window.editor.surface.textContent!.length);
  }, { value, settings });
};
export const persistentMentionContent = (page: Page) => page.locator('.persistent-mention-test .mw-content');
export const readyPersistentMention = async (page: Page) => {
  expect(await page.evaluate(() => window.persistentMentionAPI.open())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.persistentMentionAPI.getState().status)).toBe('ready');
};
