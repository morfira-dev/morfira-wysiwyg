import { expect, test } from '@playwright/test';
import type { EditorEvents, PluginEvent } from '@morfira-dev/wysiwyg-core';

const typeContract = (events: EditorEvents, token: PluginEvent<{ id: string }>) => {
  events.emit(token, { id: 'valid' });
  // @ts-expect-error Payloads must match their shared contract.
  events.emit(token, { id: 12 });
  // @ts-expect-error Plugins cannot spoof core lifecycle notifications.
  events.emit('change', { html: '', text: '', source: 'user' });
  events.on('readonlychange', (value) => { const readOnly: boolean = value; void readOnly; });
};
void typeContract;

const initialize = async (page: import('@playwright/test').Page) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
};

test('plugin event factory is SSR safe and validates display names', async () => {
  const { createPluginEvent } = await import('@morfira-dev/wysiwyg-core');
  expect(createPluginEvent('assets:selected').name).toBe('assets:selected');
  expect(() => createPluginEvent(' ')).toThrow();
});

test('custom contracts have FIFO reentrant delivery and respect additions and removals', async ({ page }) => {
  await initialize(page);
  const order = await page.evaluate(async () => {
    const createPluginEvent = window.createPluginEvent;
    const token = createPluginEvent<number>('example:step'); const order: string[] = []; const events = window.editor.events;
    let removeSecond = () => {}; let added = false;
    const late = (value: number) => order.push(`late:${value}`);
    events.on(token, (value) => {
      order.push(`first:${value}`);
      if (!added) { added = true; removeSecond(); events.on(token, late); events.emit(token, 2); }
    });
    removeSecond = events.on(token, (value) => order.push(`removed:${value}`));
    events.on(token, (value) => order.push(`last:${value}`));
    events.emit(token, 1); return order;
  });
  expect(order).toEqual(['first:1', 'last:1', 'first:2', 'last:2', 'late:2']);
});

test('shared tokens connect plugins without connecting editor instances or equal names', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const createPluginEvent = window.createPluginEvent;
    const token = createPluginEvent<{ text: string }>('message:insert'); const otherToken = createPluginEvent<{ text: string }>('message:insert');
    const host = document.createElement('div'); document.body.append(host); let isolated = 0; let wrongToken = 0;
    const second = window.createEditor(host);
    second.events.on(token, () => isolated++); window.editor.events.on(otherToken, () => wrongToken++);
    window.editor.setHTML('<p>before</p>'); window.editor.setSelection(6);
    window.editor.events.on(token, ({ text }) => window.editor.insertHTML(`<p>${text}</p>`));
    window.editor.events.emit(token, { text: 'after' });
    const html = window.editor.getHTML(); window.editor.undo(); const undone = window.editor.getHTML(); second.destroy(); host.remove();
    return { isolated, wrongToken, html, undone };
  });
  expect(result).toEqual({ isolated: 0, wrongToken: 0, html: '<p>beforeafter</p>', undone: '<p>before</p>' });
});

test('core change and legacy subscribe share safe independent payloads across API history and native input', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    window.editor.setHTML('<p>a</p>'); window.editor.setSelection(1);
    const log: string[] = []; window.editor.providePlugin('event-log', log);
    window.editor.events.on('change', (change) => { log.push(`event:${change.source}:${change.html}`); change.html = 'consumer changed snapshot'; });
    window.editor.subscribe((change) => log.push(`legacy:${change.source}:${change.html}`));
  });
  await page.keyboard.type('b');
  const result = await page.evaluate(() => {
    window.editor.undo(); window.editor.redo(); window.editor.setHTML('<p>external</p>'); return window.editor.getPlugin<string[]>('event-log');
  });
  expect(result).toEqual([
    'event:user:<p>ab</p>', 'legacy:user:<p>ab</p>', 'event:user:<p>a</p>', 'legacy:user:<p>a</p>',
    'event:user:<p>ab</p>', 'legacy:user:<p>ab</p>', 'event:api:<p>external</p>', 'legacy:api:<p>external</p>',
  ]);
});

test('selection aliases and read-only transitions report state without content revisions', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.setHTML('<p>text</p>'); const states: boolean[] = []; const positions: number[] = []; let legacy = 0; let changes = 0;
    window.editor.events.on('readonlychange', (value) => states.push(value));
    const off = window.editor.events.on('selectionchange', (value) => { if (value) positions.push(value.index); });
    window.editor.onSelectionChange(() => legacy++); window.editor.subscribe(() => changes++);
    window.editor.setSelection(2); window.editor.setReadOnly(true); window.editor.setReadOnly(true); window.editor.setReadOnly(false); off(); off();
    return { states, positions, legacy, changes };
  });
  expect(result.states).toEqual([true, false]); expect(result.positions).toContain(2); expect(result.legacy).toBeGreaterThan(0); expect(result.changes).toBe(0);
});

test('throwing listeners continue delivery and never roll back an already committed edit', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.setHTML('<p>before</p>'); window.editor.setSelection(6); let delivered = 0; let aggregate = false;
    const off = window.editor.events.on('change', () => { throw new Error('observer'); });
    window.editor.subscribe(() => delivered++);
    try { window.editor.insertHTML('<p>after</p>'); } catch (error) { aggregate = error instanceof AggregateError; }
    const html = window.editor.getHTML(); const history = window.editor.canUndo(); off(); window.editor.undo();
    return { aggregate, delivered, html, history, undone: window.editor.getHTML() };
  });
  expect(result).toEqual({ aggregate: true, delivered: 2, html: '<p>beforeafter</p>', history: true, undone: '<p>before</p>' });
});

test('destroy during dispatch cancels ordinary delivery and tears down despite callback errors', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const createPluginEvent = window.createPluginEvent;
    const host = document.createElement('div'); document.body.append(host); const editor = window.createEditor(host); const token = createPluginEvent<void>('dispose:test'); const order: string[] = [];
    editor.events.on('destroy', () => { order.push('destroy:throw'); throw new Error('cleanup observer'); });
    editor.events.on('destroy', () => order.push('destroy:last'));
    const off = editor.events.on(token, () => { order.push('first'); editor.destroy(); });
    editor.events.on(token, () => order.push('skipped')); let aggregate = false;
    try { editor.events.emit(token, undefined); } catch (error) { aggregate = error instanceof AggregateError; }
    off(); off(); editor.destroy(); let rejected = false;
    try { editor.events.emit(token, undefined); } catch { rejected = true; }
    const mounted = host.childNodes.length; host.remove(); return { order, aggregate, rejected, mounted };
  });
  expect(result).toEqual({ order: ['first', 'destroy:throw', 'destroy:last'], aggregate: true, rejected: true, mounted: 0 });
});
