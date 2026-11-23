export interface CodeBlockViewRecord {
  readonly element: HTMLElement;
  readonly code: HTMLElement;
  source: string;
  language: string;
  request?: AbortController;
}
