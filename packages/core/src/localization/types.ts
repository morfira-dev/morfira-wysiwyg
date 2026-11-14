import type { editorMessages } from './messages.js';

export type EditorTranslations = Readonly<Record<string, string>>;

export interface EditorLocale {
  readonly locale: string;
  readonly translations: EditorTranslations;
}

export type LocaleDictionaries = Readonly<Record<string, EditorTranslations>>;
export type EditorTranslationKey = keyof typeof editorMessages.en;
