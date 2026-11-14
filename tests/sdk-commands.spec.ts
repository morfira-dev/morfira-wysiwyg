import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.editor.setHTML('<p>abc</p>');
    window.editor.setSelection(1, 1);
  });
};

test('a typed plugin command validates its payload and commits one selection-restoring history step', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const token = createEditorCommand<string>('example:replace');
    let changes = 0;
    window.editor.subscribe(() => changes++);
    window.editor.commands.register(token, {
      validate: (payload) => {
        if (typeof payload !== 'string') throw new TypeError('Expected replacement text.');
        return payload.trim();
      },
      execute: (editor, payload) => editor.insertHTML(`<strong>${payload}</strong>`),
    });
    const accepted = window.editor.commands.execute(token, ' X ');
    const html = window.editor.getHTML();
    const count = changes;
    window.editor.undo();
    const undone = window.editor.getHTML();
    const selection = window.editor.getSelection();
    const remainingUndo = window.editor.canUndo();
    window.editor.redo();
    return { accepted, frozen: Object.isFrozen(token), html, count, undone, selection, remainingUndo, redone: window.editor.getHTML() };
  });
  expect(result).toEqual({ accepted: true, frozen: true, html: '<p>a<strong>X</strong>c</p>', count: 1, undone: '<p>abc</p>', selection: { index: 1, length: 1 }, remainingUndo: false, redone: '<p>a<strong>X</strong>c</p>' });
});

test('command state is a fresh snapshot and disabled, read-only and composition guards do not invoke handlers', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const token = createEditorCommand<void>('example:guarded');
    let available = false;
    let validated = 0;
    let executed = 0;
    window.editor.commands.register(token, {
      validate: () => { validated++; },
      execute: () => { executed++; },
      isEnabled: () => available,
      isActive: () => true,
      isMixed: () => true,
    });
    const disabled = window.editor.commands.getState(token);
    const rejectedDisabled = window.editor.commands.execute(token, undefined);
    available = true;
    const enabled = window.editor.commands.getState(token);
    window.editor.setReadOnly(true);
    const readOnly = window.editor.commands.getState(token);
    const rejectedReadOnly = window.editor.commands.execute(token, undefined);
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = window.editor.commands.getState(token);
    const rejectedComposing = window.editor.commands.execute(token, undefined);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    const accepted = window.editor.commands.execute(token, undefined);
    return { disabled, enabled, readOnly, composing, independent: disabled !== enabled, rejectedDisabled, rejectedReadOnly, rejectedComposing, accepted, validated, executed, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({
    disabled: { enabled: false, active: true, mixed: true },
    enabled: { enabled: true, active: true, mixed: true },
    readOnly: { enabled: false, active: true, mixed: true },
    composing: { enabled: false, active: true, mixed: true },
    independent: true, rejectedDisabled: false, rejectedReadOnly: false, rejectedComposing: false, accepted: true,
    validated: 1, executed: 1, html: '<p>abc</p>', undo: false,
  });
});

test('nested commands compose and a caught invalid payload poisons the whole outer transaction', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const child = createEditorCommand<string>('example:child');
    const parent = createEditorCommand<void>('example:parent');
    window.editor.commands.register(child, {
      validate: (value) => {
        if (typeof value !== 'string') throw new TypeError('Expected string.');
        return value;
      },
      execute: (editor, value) => editor.surface.querySelector('p')!.append(value),
    });
    window.editor.commands.register(parent, {
      validate: () => {},
      execute: (editor) => {
        editor.commands.execute(child, 'X');
        editor.commands.execute(child, 'Y');
      },
    });
    let changes = 0;
    window.editor.subscribe(() => changes++);
    window.editor.commands.execute(parent, undefined);
    const changed = window.editor.getHTML();
    const count = changes;
    window.editor.undo();
    const undo = window.editor.getHTML();
    const remainingUndo = window.editor.canUndo();
    let rejected = false;
    try {
      window.editor.transact((surface) => {
        surface.querySelector('p')!.append('must rollback');
        try { window.editor.commands.execute(child, 42 as unknown as string); }
        catch { /* The nested transaction must still poison its parent. */ }
      });
    }
    catch { rejected = true; }
    const afterInvalid = window.editor.getHTML();
    const selection = window.editor.getSelection();
    const redo = window.editor.canRedo();
    window.editor.redo();
    return { changed, count, undo, remainingUndo, rejected, afterInvalid, selection, redo, redone: window.editor.getHTML() };
  });
  expect(result).toEqual({ changed: '<p>abcXY</p>', count: 1, undo: '<p>abc</p>', remainingUndo: false, rejected: true, afterInvalid: '<p>abc</p>', selection: { index: 1, length: 1 }, redo: true, redone: '<p>abcXY</p>' });
});

test('throwing and thenable command execution restores content, selection and redo without notifications', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    window.editor.insertHTML('<strong>old</strong>');
    window.editor.undo();
    let changes = 0;
    window.editor.subscribe(() => changes++);
    const outcomes: boolean[] = [];
    for (const kind of ['throw', 'thenable'] as const) {
      const command = createEditorCommand<void>(`example:${kind}`);
      window.editor.commands.register(command, {
        validate: () => {},
        execute: (editor) => {
          editor.surface.querySelector('p')!.textContent = 'must rollback';
          editor.setSelection(0);
          if (kind === 'throw') throw new Error('Rejected edit.');
          return { then: () => {} };
        },
      });
      try { window.editor.commands.execute(command, undefined); outcomes.push(false); }
      catch { outcomes.push(true); }
    }
    return { outcomes, html: window.editor.getHTML(), selection: window.editor.getSelection(), changes, undo: window.editor.canUndo(), redo: window.editor.canRedo() };
  });
  expect(result).toEqual({ outcomes: [true, true], html: '<p>abc</p>', selection: { index: 1, length: 1 }, changes: 0, undo: false, redo: true });
});

test('registrations use token identity, own editor scope and idempotent cleanup', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const token = createEditorCommand<void>('example:identity');
    const sameName = createEditorCommand<void>('example:identity');
    const host = document.createElement('div');
    document.body.append(host);
    const other = window.createEditor(host, { value: '<p>other</p>' });
    const definition = {
      validate: () => {},
      execute: (editor: import('@morfira-dev/wysiwyg').Editor) => editor.surface.querySelector('p')!.append('!'),
    };
    const unregister = window.editor.commands.register(token, definition);
    other.commands.register(token, definition);
    let duplicate = false;
    let missing = false;
    let forged = false;
    try { window.editor.commands.register(token, definition); } catch { duplicate = true; }
    try { window.editor.commands.execute(sameName, undefined); } catch { missing = true; }
    try { window.editor.commands.getState({ name: token.name } as typeof token); } catch { forged = true; }
    unregister();
    const stopNew = window.editor.commands.register(token, definition);
    unregister();
    window.editor.commands.execute(token, undefined);
    const mainHTML = window.editor.getHTML();
    const untouchedOther = other.getHTML();
    other.commands.execute(token, undefined);
    const otherHTML = other.getHTML();
    stopNew();
    stopNew();
    let removed = false;
    try { window.editor.commands.getState(token); } catch { removed = true; }
    other.destroy();
    host.remove();
    return { duplicate, missing, forged, mainHTML, untouchedOther, otherHTML, removed };
  });
  expect(result).toEqual({ duplicate: true, missing: true, forged: true, mainHTML: '<p>abc!</p>', untouchedOther: '<p>other</p>', otherHTML: '<p>other!</p>', removed: true });
});

test('callbacks are captured at registration and invalid definitions or asynchronous callbacks are rejected', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const command = createEditorCommand<void>('example:snapshot');
    let invoked = 0;
    const definition = { validate: () => {}, execute: () => { invoked++; } };
    window.editor.commands.register(command, definition);
    definition.execute = () => { throw new Error('Changed after registration.'); };
    window.editor.commands.execute(command, undefined);
    const errors: boolean[] = [];
    const candidates = [
      { validate: () => {}, execute: async () => { invoked++; } },
      { validate: async () => {}, execute: () => { invoked++; } },
      { validate: () => {}, execute: () => { invoked++; }, isEnabled: async () => true },
      { validate: () => {}, execute: null },
    ];
    for (const [index, candidate] of candidates.entries()) {
      const token = createEditorCommand<void>(`example:invalid-${index}`);
      try {
        window.editor.commands.register(token, candidate as unknown as import('@morfira-dev/wysiwyg').EditorCommandDefinition<void>);
        errors.push(false);
      }
      catch { errors.push(true); }
    }
    const invalidNames = ['', ' '.repeat(3), 'x'.repeat(201)];
    const names = invalidNames.map((name) => { try { createEditorCommand(name); return false; } catch { return true; } });
    return { invoked, errors, names, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ invoked: 1, errors: [true, true, true, true], names: [true, true, true], html: '<p>abc</p>', undo: false });
});

test('thenable validators and invalid state readers fail without applying an edit', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const command = createEditorCommand<string>('example:validator');
    let invoked = 0;
    window.editor.commands.register(command, {
      validate: () => ({ then: () => {} }) as unknown as string,
      execute: () => { invoked++; },
    });
    let validationRejected = false;
    try { window.editor.commands.execute(command, 'abc'); } catch { validationRejected = true; }
    const invalidState = createEditorCommand<void>('example:state');
    window.editor.commands.register(invalidState, {
      validate: () => {}, execute: () => {}, isActive: () => 1 as unknown as boolean,
    });
    let stateRejected = false;
    try { window.editor.commands.getState(invalidState); } catch { stateRejected = true; }
    return { validationRejected, stateRejected, invoked, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ validationRejected: true, stateRejected: true, invoked: 0, html: '<p>abc</p>', undo: false });
});

test('editor destruction releases command ownership and rejects stale commands while unregister remains safe', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createEditorCommand } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const command = createEditorCommand<void>('example:destroy');
    const definition = { validate: () => {}, execute: () => {} };
    const unregister = window.editor.commands.register(command, definition);
    const commands = window.editor.commands;
    window.editor.destroy();
    const rejected: boolean[] = [];
    for (const operation of [() => commands.execute(command, undefined), () => commands.getState(command), () => commands.register(command, definition)]) {
      try { operation(); rejected.push(false); } catch { rejected.push(true); }
    }
    unregister();
    unregister();
    return { rejected, detached: !window.editor.element.isConnected };
  });
  expect(result).toEqual({ rejected: [true, true, true], detached: true });
});

test('command token factory imports during SSR without browser globals', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { createEditorCommand } from './packages/core/dist/index.js';
    const token = createEditorCommand('example:ssr');
    if (!Object.isFrozen(token) || token.name !== 'example:ssr') process.exit(1);
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(result).toBe('');
});
