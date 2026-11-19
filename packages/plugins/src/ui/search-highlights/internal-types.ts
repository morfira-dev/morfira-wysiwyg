export interface SearchHighlightPlatform {
  readonly Highlight?: typeof Highlight;
  readonly CSS?: { readonly highlights?: HighlightRegistry };
}

export interface SearchHighlightRegistry {
  readonly registry: HighlightRegistry;
  readonly results: Highlight;
  readonly current: Highlight;
  readonly owners: Set<object>;
}

export interface SearchHighlightOwner {
  valid(): boolean;
  update(ranges: readonly Range[], current: number): boolean;
  select(current: number): boolean;
  clear(): void;
  release(): void;
}

export interface SearchHighlightAcquisition {
  readonly status: 'ready' | 'unsupported' | 'conflict';
  readonly owner?: SearchHighlightOwner;
}
