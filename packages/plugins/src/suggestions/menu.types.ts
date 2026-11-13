export interface SuggestionMenuLabels {
  label: string;
  loading: string;
  empty: string;
  error: string;
  results: string;
}
export interface SuggestionMenuOptions {
  locale?: 'ru' | 'en';
  labels?: Partial<SuggestionMenuLabels>;
}
export interface AriaOwner {
  views: Set<string>;
  optionPrefixes: Set<string>;
  original: Map<string, string | null>;
}
