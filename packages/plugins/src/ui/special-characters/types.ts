import type { specialCharacterUIMessages } from './messages.js';

export interface SpecialCharacter {
  readonly id: string;
  readonly text: string;
  readonly label: string;
}

export interface SpecialCharacterUIOptions {
  readonly label?: string;
  readonly characters?: readonly SpecialCharacter[];
  readonly onError?: (error: unknown) => void;
}

export interface SpecialCharacterUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export type SpecialCharacterUIMessageKey = keyof typeof specialCharacterUIMessages.en;
