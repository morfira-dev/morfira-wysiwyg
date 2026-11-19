import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SearchHighlightsFixtureOptions } from './search-highlights.types.js';

export const initializeSearchHighlights = async (page: Page, value = '<p>one <strong>one</strong> ONE</p>', options: SearchHighlightsFixtureOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, mount }) => {
    const searchPath = '/packages/wysiwyg/dist/plugins/search.js';
    const highlightPath = '/packages/wysiwyg/dist/ui/search-highlights.js';
    window.searchHighlightsSearchModule = await import(/* @vite-ignore */ searchPath) as typeof import('@morfira-dev/wysiwyg/plugins/search');
    window.searchHighlightsModule = await import(/* @vite-ignore */ highlightPath) as typeof import('@morfira-dev/wysiwyg/ui/search-highlights');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'search-highlights-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, {
      value,
      schema: [{ name: 'test:identity', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }],
      plugins: [window.searchHighlightsSearchModule.search()],
      onChange: (change) => window.changes.push(change),
    });
    window.searchHighlightAPI = window.searchHighlightsSearchModule.searchCommands(window.editor);
    window.searchHighlightsNative = typeof Highlight === 'function' && Boolean(globalThis.CSS?.highlights);
    window.searchHighlightsErrors = [];
    if (mount) window.searchHighlighter = window.searchHighlightsModule.createSearchHighlights(window.editor, { onError: (error) => window.searchHighlightsErrors.push(String(error)) });
    window.dispose = () => {
      window.searchHighlighter?.destroy();
      window.secondSearchHighlighter?.destroy();
      window.secondSearchHighlightEditor?.destroy();
      window.editor.destroy();
    };
    window.editor.setSelection(0);
  }, { value, mount: options.mount ?? true });
};

export const nativeSearchHighlights = (page: Page) => page.evaluate(() => {
  const registry = globalThis.CSS?.highlights;
  const all = registry?.get('morfira-search-results');
  const current = registry?.get('morfira-search-current');
  const texts = (group: Highlight | undefined): string[] => group ? [...group.values()].map((range) => (range as Range).toString()) : [];
  return { all: texts(all), current: texts(current), priority: current?.priority, connected: all ? [...all.values()].every((range) => window.editor.surface.contains((range as Range).startContainer) && window.editor.surface.contains((range as Range).endContainer)) : true };
});

export const setHighlightQuery = async (page: Page, query: string) => {
  await page.evaluate((query) => window.searchHighlightAPI.setQuery(query), query);
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(await page.evaluate(() => window.searchHighlightAPI.getState().matches.length));
};
