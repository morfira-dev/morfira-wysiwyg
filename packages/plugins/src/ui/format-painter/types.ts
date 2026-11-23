export interface FormatPainterUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
