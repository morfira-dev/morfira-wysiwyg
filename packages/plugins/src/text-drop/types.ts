export interface TextDropOptions {
  enabled?: boolean;
  onError?: (error: unknown) => void;
}
export interface TextDropState {
  readonly enabled: boolean;
}
export interface TextDropCommands {
  getState(): TextDropState;
  setEnabled(enabled: boolean): void;
}
