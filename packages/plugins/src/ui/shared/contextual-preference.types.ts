export interface ContextualPreferences {
  readonly owners: Set<(range: Range) => boolean>;
  readonly listeners: Set<() => void>;
}
