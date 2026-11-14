import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MentionOption, SlashOption, SuggestionController } from '@morfira-dev/wysiwyg/plugins/suggestions';

declare global { interface Window {
  viewMention: SuggestionController<MentionOption>; viewSlash: SuggestionController<SlashOption>;
  disposeSuggestionViews: () => void; viewRequests: number;
} }
const initialize = async (page: Page, mode: 'ready' | 'empty' | 'error' | 'loading' = 'ready', count = 2) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ mode, count }) => {
    window.dispose(); const host = document.createElement('div'); host.className = 'view-test'; document.body.append(host); window.viewRequests = 0;
    const options: MentionOption[] = Array.from({ length: count }, (_, index) => ({ id: index === 0 ? '<not-a-dom-id>' : `person-${index}`, label: index === 0 ? 'Alice <b>' : `Person ${index}`, description: index === 0 ? '<img src=x onerror=bad>' : 'Designer' }));
    window.editor = window.createEditor(host, { value: '<p>@a</p>', locale: 'en', plugins: [
      window.createMentions({ debounceMs: 0, provide: ({ signal }) => {
        window.viewRequests++; if (mode === 'error') throw new Error('Private provider error'); if (mode === 'empty') return [];
        if (mode === 'loading') return new Promise<readonly MentionOption[]>((resolve) => { if (signal.aborted) resolve([]); else signal.addEventListener('abort', () => resolve([]), { once: true }); });
        return options;
      } }),
      window.createSlash({ debounceMs: 0, provide: () => [{ id: 'literal', label: 'Literal snippet', text: '**literal**' }] }),
      window.createMarkdownShortcuts(),
    ] });
    const external = document.createElement('div'); external.id = 'external-list'; external.hidden = true; external.setAttribute('role', 'listbox'); const old = document.createElement('div'); old.id = 'external-option'; old.setAttribute('role', 'option'); external.append(old); document.body.append(external);
    window.editor.surface.setAttribute('aria-controls', 'external-list'); window.editor.surface.setAttribute('aria-autocomplete', 'none'); window.editor.surface.setAttribute('aria-haspopup', 'false'); window.editor.surface.setAttribute('aria-activedescendant', 'external-option');
    window.viewMention = window.mentionCommands(window.editor); window.viewSlash = window.slashCommands(window.editor);
    const disposeMention = window.createSuggestionMenu(window.editor, window.viewMention); const disposeSlash = window.createSuggestionMenu(window.editor, window.viewSlash, { locale: 'ru' });
    window.disposeSuggestionViews = () => { disposeMention(); disposeSlash(); };
    window.editor.setSelection(2); window.viewMention.open();
  }, { mode, count });
};
const menus = (page: Page) => page.locator('.view-test .mw-suggestions');
const surface = (page: Page) => page.locator('.view-test .mw-content');
const visibleMenu = (page: Page) => page.locator('.view-test .mw-suggestions:not([hidden])');
const ready = async (page: Page) => expect.poll(() => page.evaluate(() => window.viewMention.getState().status)).toBe('ready');

// Primary relationship: https://www.w3.org/TR/wai-aria-1.2/#textbox and #aria-autocomplete.
test('textbox controls a text-only listbox with active descendant while keyboard focus stays in editor', async ({ page }) => {
  await initialize(page); await ready(page);
  await expect(surface(page)).toHaveAttribute('role', 'textbox'); await expect(surface(page)).toHaveAttribute('aria-autocomplete', 'list'); await expect(surface(page)).toHaveAttribute('aria-haspopup', 'listbox');
  expect(await surface(page).getAttribute('aria-expanded')).toBeNull();
  const box = visibleMenu(page).getByRole('listbox'); await expect(box).toHaveAttribute('aria-label', 'Suggestions'); await expect(box.getByRole('option')).toHaveCount(2);
  await expect(box.getByRole('option').first()).toContainText('Alice <b>'); await expect(box.getByRole('option').first()).toContainText('<img src=x onerror=bad>');
  await expect(visibleMenu(page).locator('b,img')).toHaveCount(0);
  const id = await box.getByRole('option').first().getAttribute('id'); expect(id).toMatch(/^mw-suggestions-\d+-option-0$/); expect(id).not.toContain('<not-a-dom-id>');
  await expect(surface(page)).toHaveAttribute('aria-activedescendant', id!);
  const controls = (await surface(page).getAttribute('aria-controls'))!.split(/\s+/); expect(controls).toHaveLength(3); expect(controls).toContain(await box.getAttribute('id'));
  const before = await page.evaluate(() => window.editor.getSelection()); await page.keyboard.press('ArrowDown');
  await expect(box.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true'); await expect(surface(page)).toBeFocused();
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual(before); expect(await page.evaluate(() => window.viewRequests)).toBe(1);
  await page.keyboard.press('Enter'); await expect(surface(page)).toHaveText('@Person 1 '); await expect(visibleMenu(page)).toHaveCount(0);
  await expect(surface(page)).toHaveAttribute('aria-activedescendant', 'external-option');
});

test('pointer choice preserves focus and inserts literal label once, outside saved document UI', async ({ page }) => {
  await initialize(page); await ready(page);
  const before = await page.evaluate(() => window.editor.getHTML()); expect(before).not.toContain('mw-suggestions'); expect(before).toBe('<p>@a</p>');
  await visibleMenu(page).getByRole('option').first().click(); await expect(surface(page)).toHaveText('@Alice <b> '); await expect(surface(page)).toBeFocused();
  await expect(surface(page).locator('b,img')).toHaveCount(0); expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 11, length: 0 });
  await page.evaluate(() => window.editor.undo()); await expect(surface(page)).toHaveText('@a'); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('mention/slash views share ownership without erasing the other active menu or original ARIA', async ({ page }) => {
  await initialize(page); await ready(page);
  await page.evaluate(() => { window.editor.setHTML('<p>/</p>'); window.editor.setSelection(1); window.viewSlash.open(); });
  await expect.poll(() => page.evaluate(() => window.viewSlash.getState().status)).toBe('ready');
  const box = visibleMenu(page).getByRole('listbox'); await expect(box).toHaveAttribute('aria-label', 'Подсказки');
  const active = await box.getByRole('option').getAttribute('id');
  await page.evaluate(() => window.viewMention.close()); await expect(surface(page)).toHaveAttribute('aria-activedescendant', active!);
  await page.keyboard.press('Enter'); await expect(surface(page)).toHaveText('**literal**'); await expect(surface(page).locator('strong')).toHaveCount(0);
  await page.evaluate(() => window.disposeSuggestionViews()); await expect(menus(page)).toHaveCount(0);
  await expect(surface(page)).toHaveAttribute('aria-controls', 'external-list'); await expect(surface(page)).toHaveAttribute('aria-autocomplete', 'none'); await expect(surface(page)).toHaveAttribute('aria-haspopup', 'false'); await expect(surface(page)).toHaveAttribute('aria-activedescendant', 'external-option');
  await page.evaluate(() => window.disposeSuggestionViews());
});

test('closing never overwrites externally changed ARIA and removes only owned controls on disposal', async ({ page }) => {
  await initialize(page); await ready(page);
  await page.evaluate(() => {
    window.editor.surface.setAttribute('aria-activedescendant', 'new-external'); window.editor.surface.setAttribute('aria-autocomplete', 'both'); window.editor.surface.setAttribute('aria-haspopup', 'dialog');
    window.editor.surface.setAttribute('aria-controls', `${window.editor.surface.getAttribute('aria-controls')} other-app-list`); window.viewMention.close(); window.disposeSuggestionViews();
  });
  await expect(surface(page)).toHaveAttribute('aria-activedescendant', 'new-external'); await expect(surface(page)).toHaveAttribute('aria-autocomplete', 'both'); await expect(surface(page)).toHaveAttribute('aria-haspopup', 'dialog'); await expect(surface(page)).toHaveAttribute('aria-controls', 'external-list other-app-list');
});

test('loading, empty and error status are localized, nonselectable and never consume ordinary Enter', async ({ page }) => {
  for (const mode of ['loading', 'empty', 'error'] as const) {
    await initialize(page, mode);
    const message = mode === 'loading' ? 'Loading suggestions…' : mode === 'empty' ? 'No suggestions' : 'Unable to load suggestions';
    await expect(visibleMenu(page).getByRole('status')).toHaveText(message); await expect(visibleMenu(page).getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Enter'); await expect(visibleMenu(page)).toHaveCount(0); expect(await surface(page).textContent()).toBe('@a');
    await expect(surface(page).locator('p')).toHaveCount(2); await page.evaluate(() => window.editor.destroy());
  }
});

test('Escape/Tab and outside pointer dismiss without inserting or stealing outside focus', async ({ page }) => {
  await initialize(page); await ready(page); await page.keyboard.press('Escape'); await expect(visibleMenu(page)).toHaveCount(0); await expect(surface(page)).toHaveText('@a');
  await page.evaluate(() => window.viewMention.open()); await ready(page); await page.keyboard.press('Tab'); await expect(visibleMenu(page)).toHaveCount(0); await expect(surface(page)).toHaveText('@a');
  await page.evaluate(() => { window.editor.setSelection(2); window.viewMention.open(); const input = document.createElement('input'); input.id = 'outside-field'; input.setAttribute('aria-label', 'Outside field'); document.body.append(input); }); await ready(page);
  await page.getByLabel('Outside field').click(); await expect(visibleMenu(page)).toHaveCount(0); await expect(page.getByLabel('Outside field')).toBeFocused(); await expect(surface(page)).toHaveText('@a');
});

test('viewport clamping and flipping survive resize without refetching or moving the caret', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 }); await initialize(page); await ready(page);
  await page.addStyleTag({ content: '.view-test { position:fixed; left:12px; right:12px; bottom:8px; } .view-test .mw-content { min-height:80px; padding:8px; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect.poll(async () => { const box = await visibleMenu(page).boundingBox(); return !!box && box.x >= 7 && box.y >= 7 && box.x + box.width <= 383 && box.y + box.height <= 313; }).toBe(true);
  const box = (await visibleMenu(page).boundingBox())!; const caret = await page.evaluate(() => window.viewMention.getState().anchor!); expect(box.y + box.height).toBeLessThanOrEqual(caret.y + 1);
  await page.setViewportSize({ width: 240, height: 360 });
  await expect.poll(async () => { const box = await visibleMenu(page).boundingBox(); return !!box && box.x >= 7 && box.x + box.width <= 233 && box.y >= 7 && box.y + box.height <= 353; }).toBe(true);
  expect(await page.evaluate(() => window.viewRequests)).toBe(1); expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
});

test('document scroll repositions from a fresh anchor without rerunning the provider', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 }); await initialize(page); await ready(page);
  await page.addStyleTag({ content: 'body { min-height:2000px; } .view-test { margin-top:260px; } .view-test .mw-content { min-height:100px; }' });
  await page.evaluate(() => { window.scrollTo(0, 0); window.dispatchEvent(new Event('resize')); });
  const before = (await visibleMenu(page).boundingBox())!; await page.evaluate(() => window.scrollBy(0, 100));
  await expect.poll(async () => (await visibleMenu(page).boundingBox())!.y).toBeCloseTo(before.y - 100, 0);
  expect(await page.evaluate(() => window.viewRequests)).toBe(1); await expect(surface(page)).toBeFocused();
});

test('long result menus scroll their active option locally without changing the text selection', async ({ page }) => {
  await initialize(page, 'ready', 80); await ready(page); await page.evaluate(() => window.viewMention.move(-1));
  await expect(visibleMenu(page).getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  expect(await visibleMenu(page).locator('.mw-suggestions-list').evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 }); expect(await page.evaluate(() => window.viewRequests)).toBe(1);
});

test('view lifecycle rejects duplicate/foreign owners and auto-cleans even after another teardown hook throws', async ({ page }) => {
  await initialize(page); await ready(page);
  expect(await page.evaluate(() => { try { window.createSuggestionMenu(window.editor, window.viewMention); } catch { return true; } return false; })).toBe(true); await expect(menus(page)).toHaveCount(2);
  expect(await page.evaluate(() => { const host = document.createElement('div'); document.body.append(host); const other = window.createEditor(host); let rejects = false; try { window.createSuggestionMenu(other, window.viewMention); } catch { rejects = true; } other.destroy(); host.remove(); return rejects; })).toBe(true);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const result = await page.evaluate(() => {
    const old = window.editor.surface.querySelector('.unused') ?? window.editor.element.querySelector('[role="option"]')!;
    window.viewMention.onDispose(() => { throw new Error('Expected cleanup error'); });
    let threw = false; try { window.editor.destroy(); } catch { threw = true; }
    old.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    window.dispatchEvent(new Event('resize')); document.dispatchEvent(new Event('scroll')); window.disposeSuggestionViews();
    return { threw, menus: document.querySelectorAll('.view-test .mw-suggestions').length, controls: window.editor.surface.getAttribute('aria-controls'), role: window.editor.surface.getAttribute('role') };
  });
  expect(result).toEqual({ threw: true, menus: 0, controls: 'external-list', role: 'textbox' }); expect(errors).toEqual([]);
});

test('localized and overridden strings are text, and disposing before setup errors leaks no view', async ({ page }) => {
  await initialize(page); await ready(page);
  await page.evaluate(() => { window.disposeSuggestionViews(); window.createSuggestionMenu(window.editor, window.viewMention, { locale: 'ru', labels: { label: '<b>Люди</b>', results: '<em>{count}</em>' } }); window.viewMention.open(); });
  await ready(page); await expect(visibleMenu(page).getByRole('listbox')).toHaveAttribute('aria-label', '<b>Люди</b>'); await expect(visibleMenu(page).getByRole('status')).toHaveText('<em>2</em>'); await expect(visibleMenu(page).locator('b,em')).toHaveCount(0);
  expect(await page.evaluate(() => { try { window.createSuggestionMenu(window.editor, window.viewSlash, { locale: 'bad' as 'en' }); } catch { return true; } return false; })).toBe(true);
  await expect(menus(page)).toHaveCount(1);
});
