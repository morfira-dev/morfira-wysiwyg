import { expect, test } from '@playwright/test';
import type { SchemaContribution } from '@morfira-dev/wysiwyg';

const attribute: SchemaContribution = {
  name: 'test:task-state', kind: 'attributes', tag: 'li',
  attributes: { 'data-task-state': { type: 'enum', values: ['false', 'true'] } },
  split: { 'data-task-state': 'false' },
};

test('non-owning attribute rules are copied, instance-local and coexist with independent semantic metadata', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(async (attribute) => {
    const modulePath = '/packages/core/dist/index.js';
    const { createDocumentSchema } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const values = ['false', 'true'];
    const mutable = { ...attribute, attributes: { 'data-task-state': { type: 'enum' as const, values } } };
    const schema = createDocumentSchema([
      mutable,
      { name: 'test:label', kind: 'attributes', tag: 'p', attributes: { 'data-label': { type: 'text', maxLength: 12 } } },
      { name: 'test:note', kind: 'block', tag: 'p', attributes: { 'data-tone': { type: 'enum', values: ['note'], required: true } } },
    ]);
    values.splice(0, values.length, 'changed');
    const value = '<ol start="4"><li data-task-state="true">Task</li><li>Ordinary</li></ol>';
    const imported = schema.parseHTML(value);
    const html = schema.documentHTML(imported);
    const defaultSchema = createDocumentSchema();
    const otherHost = document.createElement('div');
    const other = window.createEditor(otherHost, { value });
    const withoutPlugin = other.getHTML();
    other.setJSON(imported);
    const withoutPluginJSON = other.getHTML();
    other.destroy();
    const semantic = schema.parseHTML('<p data-mw-node="test:note" data-tone="note" data-label="Label">Note</p>');
    return { frozen: Object.isFrozen(schema), html, roundTrip: schema.documentHTML(schema.validateDocument(imported)), withoutPlugin, withoutPluginJSON, defaultHTML: defaultSchema.sanitizeHTML(value), semantic: semantic.children[0] };
  }, attribute)).toEqual({
    frozen: true,
    html: '<ol start="4"><li data-task-state="true">Task</li><li>Ordinary</li></ol>',
    roundTrip: '<ol start="4"><li data-task-state="true">Task</li><li>Ordinary</li></ol>',
    withoutPlugin: '<ol start="4"><li>Task</li><li>Ordinary</li></ol>',
    withoutPluginJSON: '<ol start="4"><li>Task</li><li>Ordinary</li></ol>',
    defaultHTML: '<ol start="4"><li>Task</li><li>Ordinary</li></ol>',
    semantic: { type: 'element', tag: 'p', attributes: { 'data-label': 'Label', 'data-mw-node': 'test:note', 'data-tone': 'note' }, children: [{ type: 'text', text: 'Note' }] },
  });
});

test('invalid attribute contributions reject before mounting or plugin setup', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const results = await page.evaluate((attribute) => {
    const invalid: unknown[][] = [
      [{ ...attribute, attributes: { 'data-task-state': { type: 'text', required: true } } }],
      [{ ...attribute, attributes: { onclick: { type: 'text' } } }],
      [{ ...attribute, attributes: { 'data-mw-node': { type: 'text' } } }],
      [{ ...attribute, attributes: JSON.parse('{"__proto__":{"type":"text"}}') }],
      [attribute, { ...attribute, name: 'test:duplicate-owner' }],
      [attribute, { ...attribute, attributes: { 'data-other': { type: 'text' } }, split: undefined }],
      [{ ...attribute, split: { 'data-undeclared': 'false' } }],
      [{ ...attribute, split: { 'data-task-state': 'maybe' } }],
      [{ ...attribute, tag: 'p' }],
      [{ name: 'test:note', kind: 'block', tag: 'p', attributes: { 'data-label': { type: 'text' } } }, { name: 'test:label', kind: 'attributes', tag: 'p', attributes: { 'data-label': { type: 'text' } } }],
      [{ name: 'test:many', kind: 'attributes', tag: 'li', attributes: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`data-key-${index}`, { type: 'text' }])) }],
      [
        { name: 'test:first-rules', kind: 'attributes', tag: 'li', attributes: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`data-first-${index}`, { type: 'text' }])) },
        { name: 'test:other-rules', kind: 'attributes', tag: 'li', attributes: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`data-other-${index}`, { type: 'text' }])) },
      ],
      Array.from({ length: 129 }, (_, index) => ({ name: `test:name-${index}`, kind: 'attributes', tag: 'li', attributes: {} })),
    ];
    return invalid.map((schema) => {
      const host = document.createElement('div');
      let setup = 0;
      try {
        window.createEditor(host, { schema: schema as SchemaContribution[], plugins: [{ name: 'setup-probe', setup: () => { setup++; } }] });
        return { rejected: false, children: host.childNodes.length, setup };
      } catch { return { rejected: true, children: host.childNodes.length, setup }; }
    });
  }, attribute);
  expect(results).toEqual(Array(13).fill({ rejected: true, children: 0, setup: 0 }));
});

test('split policies return fresh reset-only patches for present metadata without marking ordinary items', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(async (attribute) => {
    const modulePath = '/packages/core/dist/index.js';
    const { createDocumentSchema } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const schema = createDocumentSchema([attribute]);
    const source = { 'data-task-state': 'true', title: 'Keep' };
    const patch = schema.attributesForSplit('li', source);
    patch['data-task-state'] = 'changed by caller';
    let invalidRejected = false;
    try { schema.attributesForSplit('li', { 'data-task-state': 'invalid' }); } catch { invalidRejected = true; }
    return { fresh: schema.attributesForSplit('li', source), ordinary: schema.attributesForSplit('li', { title: 'Ordinary' }), wrongTag: schema.attributesForSplit('p', source), source, invalidRejected };
  }, attribute)).toEqual({ fresh: { 'data-task-state': 'false' }, ordinary: {}, wrongTag: {}, source: { 'data-task-state': 'true', title: 'Keep' }, invalidRejected: true });
});
