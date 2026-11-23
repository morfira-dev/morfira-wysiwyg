export interface FormulaToken {
  readonly kind: 'identifier' | 'number' | 'operator' | 'command' | 'open' | 'close' | 'sub' | 'sup';
  readonly text: string;
}
