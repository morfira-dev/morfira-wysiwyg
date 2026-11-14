import type { EditorLocale, EditorTranslations, LocaleDictionaries } from './types.js';

export type { EditorLocale, EditorTranslations, LocaleDictionaries, EditorTranslationKey } from './types.js';
export { editorMessages } from './messages.js';

/** Copy and validate before changing UI state or mounting DOM. */
export const createLocale = (locale: string, translations: EditorTranslations = {}): EditorLocale => {
  if (typeof locale !== 'string' || !locale || locale.length > 100)
    throw new TypeError('Expected a language tag with 1–100 characters.');
  const canonical = Intl.getCanonicalLocales(locale)[0];
  if (!canonical)
    throw new RangeError('Expected a valid language tag.');
  if (!translations || typeof translations !== 'object' || Array.isArray(translations))
    throw new TypeError('Translations must be a record of strings.');
  const prototype = Object.getPrototypeOf(translations);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError('Translations must be a plain record of strings.');
  const entries = Object.entries(translations);
  if (entries.some(([key, value]) => !key || typeof value !== 'string'))
    throw new TypeError('Translation keys must be nonempty and values must be strings.');
  return { locale: canonical, translations: Object.fromEntries(entries) };
};

/** Resolve feature-owned copy without pulling optional feature dictionaries into core. */
export const localize = (state: EditorLocale, key: string, dictionaries: LocaleDictionaries): string => {
  const override = Object.hasOwn(state.translations, key) ? state.translations[key] : undefined;
  const exact = Object.hasOwn(dictionaries, state.locale) ? dictionaries[state.locale] : undefined;
  const base = state.locale.split('-')[0];
  const language = Object.hasOwn(dictionaries, base) ? dictionaries[base] : undefined;
  const message = (dictionary: EditorTranslations | undefined) => dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  const value = override ?? message(exact) ?? message(language) ?? message(dictionaries.en);
  if (typeof value !== 'string')
    throw new Error(`Missing English fallback for translation: ${key}`);
  return value;
};
