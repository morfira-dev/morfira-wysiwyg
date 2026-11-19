export interface SearchHighlightsOptions {
  readonly onError?: (error: unknown) => void;
}

export interface SearchHighlightsState {
  readonly status: 'ready' | 'unsupported' | 'conflict';
  readonly count: number;
  readonly current: number;
}

export interface SearchHighlightsController {
  getState(): SearchHighlightsState;
  refresh(): void;
  destroy(): void;
}
