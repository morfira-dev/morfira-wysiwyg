export interface TextLayoutUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
