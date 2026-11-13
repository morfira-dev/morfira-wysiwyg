export interface MarkdownShortcutOptions {
  enabled?: boolean;
  blocks?: boolean;
  inline?: boolean;
}
export interface MarkdownShortcutState {
  enabled: boolean;
  blocks: boolean;
  inline: boolean;
}
export interface MarkdownCommands {
  getState(): MarkdownShortcutState;
  setEnabled(enabled: boolean): void;
}
export interface Leaf {
  node: Text;
  from: number;
  to: number;
}
export interface Flow {
  text: string;
  leaves: Leaf[];
  truncated: boolean;
  atStart: boolean;
  after: string;
}
export interface InlineRule {
  marker: string;
  tag: string;
  format: string;
}
export interface InlineMatch {
  rule: InlineRule;
  start: number;
  bodyStart: number;
  bodyEnd: number;
}
