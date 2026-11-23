export interface FormatPainterState {
  captured: boolean;
  canCapture: boolean;
  canApply: boolean;
}

export interface FormatPainterCommands {
  capture(): boolean;
  apply(): boolean;
  clear(): void;
  getState(): FormatPainterState;
}

export type FormatSnapshot = Readonly<Record<string, string | boolean>>;
