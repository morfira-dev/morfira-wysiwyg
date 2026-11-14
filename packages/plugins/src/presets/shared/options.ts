import type { EditorOptions, SchemaNodeSpec, SchemaAttributeSpec } from '@morfira-dev/wysiwyg-core';
import type { MinimalPresetOptions } from '../minimal/types.js';

const coreKeys = ['value', 'readOnly', 'placeholder', 'label', 'locale', 'translations', 'plugins', 'schema', 'onChange', 'historyLimit'];

export const checkedPresetOptions = (value: unknown, featureKeys: readonly string[] = []): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError('Preset options must be a plain record.');
  const allowed = [...coreKeys, ...featureKeys];
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new TypeError('Unknown preset option.');
};

export const featureOptions = <T extends object>(value: T | false | undefined, name: string, keys: readonly string[]): T => {
  if (value === undefined) return {} as T;
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError(`${name} must be an options record or false.`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new TypeError(`Unknown ${name} option.`);
  return { ...value };
};

const cloneSchema = (nodes: readonly SchemaNodeSpec[]): SchemaNodeSpec[] => {
  if (!Array.isArray(nodes)) throw new TypeError('Preset schema must be an array.');
  return nodes.map((node: SchemaNodeSpec) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) throw new TypeError('Preset schema nodes must be records.');
    if (node.attributes === undefined) return { ...node };
    if (!node.attributes || typeof node.attributes !== 'object' || Array.isArray(node.attributes))
      throw new TypeError('Preset schema attributes must be a record.');
    const attributes = Object.fromEntries(Object.entries(node.attributes).map(([name, rule]: [string, SchemaAttributeSpec]) => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new TypeError('Preset schema attribute rules must be records.');
      if (rule.type === 'enum') {
        if (!Array.isArray(rule.values)) throw new TypeError('Preset enum values must be an array.');
        return [name, { ...rule, values: [...rule.values] }];
      }
      return [name, { ...rule }];
    }));
    return { ...node, attributes };
  });
};

/** Copy only editor-owned configuration; application callbacks/plugin objects retain identity. */
export const copyEditorOptions = (options: MinimalPresetOptions): EditorOptions => {
  const { value, readOnly, placeholder, label, locale, translations, plugins, schema, onChange, historyLimit } = options;
  for (const [key, text] of Object.entries({ value, placeholder, label, locale }))
    if (text !== undefined && typeof text !== 'string') throw new TypeError(`Preset ${key} must be a string.`);
  if (readOnly !== undefined && typeof readOnly !== 'boolean') throw new TypeError('Preset readOnly must be boolean.');
  if (historyLimit !== undefined && (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 10000))
    throw new RangeError('Preset historyLimit must be an integer from 1 to 10000.');
  if (onChange !== undefined && typeof onChange !== 'function') throw new TypeError('Preset onChange must be a function.');
  if (plugins !== undefined && (!Array.isArray(plugins) || plugins.some((plugin) => !plugin || typeof plugin.name !== 'string' || typeof plugin.setup !== 'function')))
    throw new TypeError('Preset plugins must be an array of editor plugins.');
  if (translations !== undefined && (!translations || typeof translations !== 'object' || Array.isArray(translations) || ![Object.prototype, null].includes(Object.getPrototypeOf(translations)) || Object.values(translations).some((text) => typeof text !== 'string')))
    throw new TypeError('Preset translations must be a string record.');
  return {
    ...(value !== undefined ? { value } : {}),
    ...(readOnly !== undefined ? { readOnly } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(locale !== undefined ? { locale } : {}),
    ...(translations !== undefined ? { translations: { ...translations } } : {}),
    ...(schema !== undefined ? { schema: cloneSchema(schema) } : {}),
    ...(onChange !== undefined ? { onChange } : {}),
    ...(historyLimit !== undefined ? { historyLimit } : {}),
    plugins: [...(plugins ?? [])],
  };
};
