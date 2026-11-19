import { expect, test } from '@playwright/test';
import { checklistCaret, checklistHTML, checklistMarker, checklistSurface, clickChecklistMarker, guardedChecklistKey, initializeChecklistInteraction } from './checklist-interaction.fixture.js';
import './checklist-interaction.types.js';

test('real marker activation toggles its actual item once while preserving a different backward text selection and one-step history', async ({ page }) => {
  const original = '<ul><li title="Task" data-checklist-checked="false">A<strong>BC</strong>D</li><li title="Other" data-checklist-checked="true">Other task</li><li>Ordinary</li></ul>';
  await initializeChecklistInteraction(page, original);
  const kept = await checklistSurface(page).locator('[title="Task"]').elementHandle();
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 2, text, 0);
  });
  await clickChecklistMarker(page, '[title="Other"]');
  const changed = original.replace('data-checklist-checked="true"', 'data-checklist-checked="false"');
  expect(await checklistHTML(page)).toBe(changed);
  expect(await kept!.evaluate((node) => node === window.editor.surface.querySelector('[title="Task"]'))).toBe(true);
  const selection = () => page.evaluate(() => {
    const native = document.getSelection()!;
    const text = window.editor.surface.querySelector('strong')!.firstChild;
    return { anchor: native.anchorNode === text, focus: native.focusNode === text, from: native.anchorOffset, to: native.focusOffset, text: native.toString() };
  });
  expect(await selection()).toEqual({ anchor: true, focus: true, from: 2, to: 0, text: 'BC' });
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await checklistHTML(page)).toBe(original);
  expect(await selection()).toEqual({ anchor: true, focus: true, from: 2, to: 0, text: 'BC' });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await checklistHTML(page)).toBe(changed);
});

test('Ctrl and Meta Enter toggle a supported task without splitting it and preserve the selected label', async ({ page }) => {
  await initializeChecklistInteraction(page);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('[title="Task"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 4, text, 1);
  });
  await page.keyboard.press('Control+Enter');
  await expect(checklistSurface(page).locator('[title="Task"]')).toHaveAttribute('data-checklist-checked', 'true');
  await expect(checklistSurface(page).locator('li')).toHaveCount(2);
  expect(await page.evaluate(() => ({ text: document.getSelection()!.toString(), anchor: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset, changes: window.changes.length }))).toEqual({ text: 'ask', anchor: 4, focus: 1, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await guardedChecklistKey(page, { ctrlKey: false, metaKey: true })).toBe(true);
  await expect(checklistSurface(page).locator('[title="Task"]')).toHaveAttribute('data-checklist-checked', 'true');
  await expect(checklistSurface(page).locator('li')).toHaveCount(2);
});

test('custom RTL marker geometry and wrapped nested or merged-cell tasks target only their own actual item', async ({ page }) => {
  const profiles = [
    { html: '<ul dir="rtl"><li title="Parent" data-checklist-checked="false"><p>Parent</p><ul><li title="Task" data-checklist-checked="true"><h2>Child task</h2><p>Later</p></li></ul></li></ul>', target: '[title="Task"]', parent: '[title="Parent"]' },
    { html: '<table><tr><td rowspan="2"><ol><li title="Task" data-checklist-checked="true"><p>Cell task</p></li></ol></td><td>A</td></tr><tr><td>B</td></tr></table>', target: '[title="Task"]', parent: '' },
  ];
  for (const profile of profiles) {
    await initializeChecklistInteraction(page, profile.html);
    await page.evaluate(() => {
      const root = window.editor.surface;
      root.style.setProperty('--mw-checklist-size', '24px');
      root.style.setProperty('--mw-checklist-gap', '12px');
      root.style.setProperty('--mw-checklist-offset', '4px');
      root.closest<HTMLElement>('.checklist-interaction-test')!.style.marginTop = '500px';
    });
    const task = await checklistSurface(page).locator(profile.target).elementHandle();
    await clickChecklistMarker(page, profile.target);
    await expect(checklistSurface(page).locator(profile.target)).toHaveAttribute('data-checklist-checked', 'false');
    expect(await task!.evaluate((node) => node === window.editor.surface.querySelector('[title="Task"]'))).toBe(true);
    if (profile.parent) await expect(checklistSurface(page).locator(profile.parent)).toHaveAttribute('data-checklist-checked', 'false');
    else {
      await expect(checklistSurface(page).locator('td')).toHaveCount(3);
      await expect(checklistSurface(page).locator('td').first()).toHaveAttribute('rowspan', '2');
      await expect(checklistSurface(page).locator('tr').last().locator('td')).toHaveText('B');
    }
    expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  }
});

test('text and padding misses, modified presses, drag-away, cancellation and click without a press never toggle a marker', async ({ page }) => {
  await initializeChecklistInteraction(page);
  await checklistSurface(page).locator('[title="Task"]').click();
  await checklistSurface(page).click({ position: { x: 2, y: 2 } });
  const point = await checklistMarker(page);
  await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Shift');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 90, point.y + 40);
  await page.mouse.up();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'mouse' })));
  await page.mouse.up();
  await page.evaluate(({ x, y }) => window.editor.surface.querySelector('[title="Task"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 1 })), point);
  await expect(checklistSurface(page).locator('[title="Task"]')).toHaveAttribute('data-checklist-checked', 'false');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
  const hidden = await page.addStyleTag({ content: '.checklist-interaction-test li::before{display:none!important}' });
  await page.mouse.click(point.x, point.y);
  await expect(checklistSurface(page).locator('[title="Task"]')).toHaveAttribute('data-checklist-checked', 'false');
  await hidden.evaluate((node) => node.parentNode?.removeChild(node));
  await clickChecklistMarker(page);
  await expect(checklistSurface(page).locator('[title="Task"]')).toHaveAttribute('data-checklist-checked', 'true');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});

test('keyboard ownership ignores repeats, modifiers, noncancelable or handled events and unsupported ranges; readonly and IME block mutation', async ({ page }) => {
  const semantic = { name: 'test:task-reference', kind: 'inline' as const, tag: 'span' as const, attributes: { 'data-id': { type: 'text' as const, required: true } } };
  const original = '<ul><li title="Task" data-checklist-checked="false">Task <span data-mw-node="test:task-reference" data-id="id">Owned</span></li><li title="Other" data-checklist-checked="true">Other</li><li title="Plain">Plain</li></ul>';
  await initializeChecklistInteraction(page, original, { schema: [semantic] });
  for (const options of [{ repeat: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { cancelable: false }, { isComposing: true }, { keyCode: 229 }]) expect(await guardedChecklistKey(page, options)).toBe(false);
  const handled = await page.evaluate(() => {
    const root = window.editor.surface;
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    event.preventDefault();
    const stop = (event: Event) => event.stopImmediatePropagation();
    root.addEventListener('keydown', stop, true);
    try { root.dispatchEvent(event); }
    finally { root.removeEventListener('keydown', stop, true); }
    return window.changes.length;
  });
  expect(handled).toBe(0);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await clickChecklistMarker(page);
  expect(await guardedChecklistKey(page)).toBe(false);
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.focus(); window.editor.setSelection(1); window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  await clickChecklistMarker(page);
  expect(await guardedChecklistKey(page)).toBe(false);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await checklistCaret(page, '[title="Plain"]');
  expect(await guardedChecklistKey(page)).toBe(false);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="Other"]')!.firstChild!, 1, root.querySelector('[title="Task"]')!.firstChild!, 1);
  });
  expect(await guardedChecklistKey(page)).toBe(false);
  await checklistCaret(page, '[data-id="id"]');
  expect(await guardedChecklistKey(page)).toBe(false);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    foreign.textContent = 'foreign';
    root.querySelector('[title="Task"]')!.append(foreign);
    root.focus();
    document.getSelection()!.setBaseAndExtent(foreign.firstChild!, 0, foreign.firstChild!, 0);
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    const result = { prevented: event.defaultPrevented, disabled: window.checklistInteractionModule.checklistCommands(window.editor).getState().disabled };
    foreign.remove();
    return result;
  })).toEqual({ prevented: false, disabled: true });
  expect(await checklistHTML(page)).toBe(original);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
});

test('focus-time same-HTML rebuild or a different native range cannot redirect a captured pointer toggle', async ({ page }) => {
  const original = '<ul><li title="Task" data-checklist-checked="false">Task text</li><li title="Other" data-checklist-checked="true">Other task</li></ul>';
  for (const mode of ['rebuild', 'selection'] as const) {
    await initializeChecklistInteraction(page, original);
    await page.evaluate((mode) => {
      const root = window.editor.surface;
      const focus = root.focus.bind(root);
      root.focus = (options) => {
        root.focus = focus;
        focus(options);
        if (mode === 'rebuild') root.innerHTML = root.innerHTML;
        const text = root.querySelector('[title="Other"]')!.firstChild!;
        document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
      };
    }, mode);
    await clickChecklistMarker(page);
    expect(await checklistHTML(page)).toBe(original);
    expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), other: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Other"]')!.firstChild }))).toEqual({ changes: 0, undo: false, other: true });
  }
  await initializeChecklistInteraction(page, original);
  const point = await checklistMarker(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.evaluate(() => { const root = window.editor.surface; root.innerHTML = root.innerHTML; window.editor.setSelection(1); });
  await page.mouse.up();
  expect(await checklistHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('interaction opt-out keeps commands available, validates options and reused plugin instances clean up independent listeners and root state', async ({ page }) => {
  await initializeChecklistInteraction(page, undefined, { options: { interactive: false } });
  await clickChecklistMarker(page);
  await checklistCaret(page);
  expect(await guardedChecklistKey(page)).toBe(false);
  await expect(checklistSurface(page).locator('[title="Task"]')).toHaveAttribute('data-checklist-checked', 'false');
  await page.evaluate(() => window.checklistInteractionModule.checklistCommands(window.editor).toggle());
  await expect(checklistSurface(page).locator('[title="Task"]')).toHaveAttribute('data-checklist-checked', 'true');
  const result = await page.evaluate(() => {
    const module = window.checklistInteractionModule;
    const invalid: unknown[] = [null, [], { interactive: 'true' }, { extra: true }];
    const rejected = invalid.map((options) => { try { module.checklists(options as Parameters<typeof module.checklists>[0]); return false; } catch { return true; } });
    const plugin = module.checklists();
    const firstHost = document.createElement('div');
    const secondHost = document.createElement('div');
    document.body.append(firstHost, secondHost);
    const first = window.createEditor(firstHost, { value: '<ul><li data-checklist-checked="false">First</li></ul>', plugins: [plugin] });
    const second = window.createEditor(secondHost, { value: '<ul><li data-checklist-checked="false">Second</li></ul>', plugins: [plugin] });
    second.focus(); second.setSelection(1);
    second.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    const firstHTML = first.getHTML();
    const secondHTML = second.getHTML();
    const old = first.surface;
    first.destroy();
    old.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    const cleaned = !old.classList.contains('mw-checklists-interactive');
    const secondStillOwned = second.surface.classList.contains('mw-checklists-interactive');
    second.destroy(); firstHost.remove(); secondHost.remove();
    const seededHost = document.createElement('div');
    document.body.append(seededHost);
    const seeded = window.createEditor(seededHost, { value: '<p>Seeded</p>', plugins: [
      { name: 'seed-checklist-style', setup: (editor) => { editor.surface.classList.add('mw-checklists-interactive'); } }, plugin,
    ] });
    const seededRoot = seeded.surface;
    seeded.destroy(); seededHost.remove();
    return { rejected, firstHTML, secondHTML, cleaned, secondStillOwned, preexistingPreserved: seededRoot.classList.contains('mw-checklists-interactive') };
  });
  expect(result).toEqual({ rejected: [true, true, true, true], firstHTML: '<ul><li data-checklist-checked="false">First</li></ul>', secondHTML: '<ul><li data-checklist-checked="true">Second</li></ul>', cleaned: true, secondStillOwned: true, preexistingPreserved: true });
});

test('marker toggles preserve actual semantic and image nodes, export only task metadata and respect external readonly replacement', async ({ page }) => {
  let requests = 0;
  await page.route('**/checklist-owned.png', (route) => { requests++; return route.abort(); });
  const semantic = { name: 'test:task-reference', kind: 'inline' as const, tag: 'span' as const, attributes: { 'data-id': { type: 'text' as const, required: true } } };
  const original = '<ul><li title="Task" data-checklist-checked="false">Before <span data-mw-node="test:task-reference" data-id="person">@Anna</span><img src="/checklist-owned.png" alt="Existing"></li><li>Other</li></ul>';
  await initializeChecklistInteraction(page, original, { schema: [semantic] });
  const image = await checklistSurface(page).locator('img').elementHandle();
  const reference = await checklistSurface(page).locator('[data-id]').elementHandle();
  await expect.poll(() => image!.evaluate((node) => (node as HTMLImageElement).complete)).toBe(true);
  const beforeRequests = requests;
  const point = await checklistMarker(page);
  const ownedActivation = await reference!.evaluate((node, point) => {
    const init = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0, pointerId: 41, isPrimary: true, pointerType: 'mouse' };
    const down = new PointerEvent('pointerdown', init);
    node.dispatchEvent(down);
    node.dispatchEvent(new PointerEvent('pointerup', init));
    const click = new MouseEvent('click', init);
    node.dispatchEvent(click);
    return { down: down.defaultPrevented, click: click.defaultPrevented };
  }, point);
  expect(ownedActivation).toEqual({ down: false, click: false });
  expect(await checklistHTML(page)).toBe(original);
  await clickChecklistMarker(page);
  expect(await checklistHTML(page)).toBe(original.replace('checked="false"', 'checked="true"'));
  for (const node of [image, reference]) expect(await node!.evaluate((element) => element.isConnected && window.editor.surface.contains(element))).toBe(true);
  expect(await image!.evaluate((node) => node === window.editor.surface.querySelector('img'))).toBe(true);
  expect(await reference!.evaluate((node) => node === window.editor.surface.querySelector('[data-id]'))).toBe(true);
  expect(requests).toBe(beforeRequests);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), json: JSON.stringify(window.editor.getJSON()), controls: window.editor.surface.querySelectorAll('input,button').length }))).toMatchObject({ html: expect.not.stringMatching(/mw-checklists-interactive|contenteditable|onclick/), json: expect.stringContaining('data-checklist-checked'), controls: 0 });
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.editor.setHTML('<ol><li title="Task" data-checklist-checked="false">External</li></ol>');
  });
  await clickChecklistMarker(page);
  expect(await checklistHTML(page)).toBe('<ol><li title="Task" data-checklist-checked="false">External</li></ol>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});
