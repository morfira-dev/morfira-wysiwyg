export interface MediaViewController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
export interface MediaFormValues {
  url: string;
  title: string;
}
export interface MediaFormOptions {
  readonly presentation?: 'dialog' | 'inline';
  readonly onError?: (error: unknown) => void;
}
export interface MediaFormController {
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  refresh(): void;
  getValues(): MediaFormValues;
  setValues(values: Partial<MediaFormValues>): void;
  destroy(): void;
}
