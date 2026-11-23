import type { CodeBlockDescriptor, CodeBlockValue } from '../../code-blocks/types.js';
import type { codeBlockMessages } from './messages.js';
export type CodeHighlightKind = 'keyword' | 'string' | 'number' | 'comment' | 'operator' | 'punctuation' | 'type';
export interface CodeHighlightToken {
  readonly from: number;
  readonly to: number;
  readonly kind: CodeHighlightKind;
}
export interface CodeHighlightRequest extends CodeBlockDescriptor {
  readonly signal: AbortSignal;
}
export type CodeHighlightProvider = (request: CodeHighlightRequest) => readonly CodeHighlightToken[] | Promise<readonly CodeHighlightToken[]>;
export interface CodeBlockViewOptions {
  readonly highlight?: CodeHighlightProvider;
  readonly onError?: (error: unknown) => void;
}
export interface CodeBlockViewController {
  refresh(): void;
  destroy(): void;
}
export interface CodeBlockFormOptions {
  readonly label?: string;
  readonly onError?: (error: unknown) => void;
}
export interface CodeBlockFormController {
  readonly element: HTMLDialogElement;
  open(target?: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
  getValue(): CodeBlockDescriptor;
  setValue(value: CodeBlockValue): void;
  destroy(): void;
}
export type CodeBlockMessageKey = keyof typeof codeBlockMessages.en;
