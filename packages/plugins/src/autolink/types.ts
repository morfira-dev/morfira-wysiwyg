export interface AutolinkOptions {
  enabled?: boolean;
  email?: boolean;
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

export interface AutolinkLeaf {
  node: Text;
  start: number;
  end: number;
}

export interface AutolinkFlow {
  text: string;
  truncated: boolean;
  leaves: AutolinkLeaf[];
}
