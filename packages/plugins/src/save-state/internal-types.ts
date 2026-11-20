export interface SaveRequest {
  readonly controller: AbortController;
  readonly revision: number;
  readonly epoch: number;
  readonly promise: Promise<boolean>;
  readonly resolve: (saved: boolean) => void;
  complete?: (success: boolean, error?: unknown) => void;
}
