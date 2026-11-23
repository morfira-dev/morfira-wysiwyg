export interface CodeBlockOptions {
  readonly languages?: readonly string[];
}
export interface CodeBlockValue {
  readonly source: string;
  readonly language?: string;
}
export interface CodeBlockDescriptor {
  readonly source: string;
  readonly language: string;
}
export interface CodeBlockCommands {
  readonly languages: readonly string[];
  insert(value: CodeBlockValue): boolean;
  update(target: HTMLElement, value: CodeBlockValue): boolean;
  remove(target: HTMLElement): boolean;
  get(target: HTMLElement): CodeBlockDescriptor | undefined;
  exit(target: HTMLElement): boolean;
}
