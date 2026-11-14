import { createEditor, createDocumentSchema, editorMessages, localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin, EditorTranslations } from '@morfira-dev/wysiwyg-core';
import type { ElementLifecycle, ElementState } from './internal-types.js';
import type { MorfiraEditorElement } from './types.js';

const validateTranslations = (value: EditorTranslations): EditorTranslations => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Translations must be a plain record.');
  const entries = Object.entries(value);
  if (entries.some(([key, text]) => !key || typeof text !== 'string')) throw new TypeError('Translation keys and values must be strings.');
  return Object.fromEntries(entries);
};
const validateLocale = (value: string): string => {
  if (typeof value !== 'string' || !value || value.length > 100) throw new TypeError('Expected a language tag.');
  const locale = Intl.getCanonicalLocales(value)[0];
  if (!locale) throw new RangeError('Expected a valid language tag.');
  return locale;
};

export const createElementLifecycle = (element: MorfiraEditorElement): ElementLifecycle => {
  const state: ElementState = { value: '', readOnly: false, locale: 'ru', translations: {}, plugins: [] };
  let editor: Editor | undefined;
  let mount: HTMLElement | undefined;
  let applying = false;
  // Retain inert source until all creation-time properties have been configured.
  let pendingValue: string | undefined;
  let unsubscribe: (() => void) | undefined;
  const adopted: Record<string, unknown> = {};
  for (const key of Object.keys(state).concat(['label', 'placeholder'])) {
    const descriptor = Object.getOwnPropertyDescriptor(element, key);
    if (descriptor && Object.hasOwn(descriptor, 'value')) {
      adopted[key] = descriptor.value;
      delete (element as unknown as Record<string, unknown>)[key];
    }
  }
  const labels = () => {
    if (!editor) return;
    editor.surface.setAttribute('aria-label', state.label ?? localize(editor.getLocale(), 'editor.label', editorMessages));
    editor.surface.dataset.placeholder = state.placeholder ?? localize(editor.getLocale(), 'editor.placeholder', editorMessages);
  };
  const emit = (name: string, detail: unknown) => element.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  const locale = (language: string, translations: EditorTranslations) => {
    const nextLanguage = validateLocale(language);
    const nextTranslations = validateTranslations(translations);
    editor?.setLocale(nextLanguage, nextTranslations);
    state.locale = nextLanguage;
    state.translations = nextTranslations;
    labels();
  };
  Object.defineProperties(element, {
    value: {
      configurable: true,
      get: () => state.value,
      set: (value: string) => {
        if (typeof value !== 'string') throw new TypeError('The editor value must be a string.');
        const schema = editor?.schema ?? createDocumentSchema(state.plugins.flatMap((plugin) => plugin.schema ?? []));
        const html = schema.sanitizeHTML(value);
        if (editor && html !== editor.getHTML()) {
          applying = true;
          try { editor.setHTML(html); }
          finally { applying = false; }
        }
        state.value = editor?.getHTML() ?? html;
        pendingValue = editor ? undefined : value;
      },
    },
    readOnly: {
      configurable: true, get: () => state.readOnly,
      set: (value: boolean) => {
        if (typeof value !== 'boolean') throw new TypeError('readOnly must be boolean.');
        editor?.setReadOnly(value);
        state.readOnly = value;
      },
    },
    locale: { configurable: true, get: () => state.locale, set: (value: string) => locale(value, state.translations) },
    translations: { configurable: true, get: () => ({ ...state.translations }), set: (value: EditorTranslations) => locale(state.locale, value) },
    plugins: {
      configurable: true, get: () => [...state.plugins],
      set: (value: EditorPlugin[]) => {
        if (!Array.isArray(value) || value.some((plugin) => !plugin || typeof plugin.name !== 'string' || typeof plugin.setup !== 'function') || new Set(value.map((plugin) => plugin.name)).size !== value.length) throw new TypeError('Expected distinct editor plugins.');
        if (editor) throw new Error('Plugins are creation-time options; disconnect the element before replacing them.');
        const plugins = [...value];
        const schema = createDocumentSchema(plugins.flatMap((plugin) => plugin.schema ?? []));
        const html = schema.sanitizeHTML(pendingValue ?? state.value);
        state.plugins = plugins;
        state.value = html;
      },
    },
    ...Object.fromEntries((['label', 'placeholder'] as const).map((key) => [key, {
      configurable: true, get: () => state[key],
      set: (value: string | undefined) => {
        if (value !== undefined && typeof value !== 'string') throw new TypeError(`${key} must be a string or undefined.`);
        state[key] = value;
        labels();
      },
    }])),
  });
  Object.assign(element, adopted);

  return {
    getEditor: () => editor,
    connect: () => {
      if (editor) return;
      mount = element.ownerDocument.createElement('div');
      mount.className = 'mw-host';
      element.append(mount);
      try {
        editor = createEditor(mount, {
          value: state.value, readOnly: state.readOnly, locale: state.locale,
          translations: state.translations, plugins: state.plugins,
          onChange: (change) => {
            state.value = change.html;
            if (!applying) {
              emit('value-change', change.html);
              emit('change', change);
            }
          },
        });
        state.value = editor.getHTML();
        pendingValue = undefined;
        unsubscribe = editor.events.on('localechange', (next) => {
          state.locale = next.locale;
          state.translations = { ...next.translations };
          labels();
        });
        labels();
        emit('ready', editor);
      }
      catch (error) {
        editor?.destroy();
        editor = undefined;
        mount.remove();
        mount = undefined;
        throw error;
      }
    },
    disconnect: () => {
      const previous = editor;
      editor = undefined;
      unsubscribe?.();
      unsubscribe = undefined;
      if (previous) {
        // Externally disposed or invalid DOM falls back to the last validated change.
        try { state.value = previous.getHTML(); }
        catch { /* Retain the last valid value. */ }
      }
      pendingValue = state.value;
      try { previous?.destroy(); }
      finally {
        mount?.remove();
        mount = undefined;
      }
    },
    attribute: (name, value) => {
      if (name === 'value') element.value = value ?? '';
      else if (name === 'readonly') element.readOnly = value !== null;
      else if (name === 'locale') element.locale = value ?? 'ru';
      else if (name === 'label') element.label = value ?? undefined;
      else if (name === 'placeholder') element.placeholder = value ?? undefined;
    },
  };
};
