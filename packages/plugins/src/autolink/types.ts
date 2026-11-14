export interface AutolinkOptions {
  enabled?: boolean;
}

export interface AutolinkState {
  enabled: boolean;
}

export interface AutolinkCommands {
  getState(): AutolinkState;
  setEnabled(enabled: boolean): void;
}

export interface AutolinkCandidate {
  start: number;
  length: number;
  href: string;
}

export interface AutolinkFlow {
  text: string;
  truncated: boolean;
}
