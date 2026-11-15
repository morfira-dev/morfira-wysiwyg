export type CompletionCandidate =
  | { kind: 'enter'; block: HTMLElement; range: Range; label: string; href: string }
  | { kind: 'paste'; block: HTMLElement; text: string; label: string; href: string };
