import type { EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';

export interface TextLayoutState {
  disabled: boolean;
  lineHeight: number | false;
  spaceBefore: number | false;
  spaceAfter: number | false;
  lineHeightMixed: boolean;
  spaceBeforeMixed: boolean;
  spaceAfterMixed: boolean;
}

export interface TextLayoutCommands {
  setLineHeight(value: number | false): void;
  setSpaceBefore(value: number | false): void;
  setSpaceAfter(value: number | false): void;
  getState(): TextLayoutState;
}

export type TextLayoutProperty = 'lineHeight' | 'marginTop' | 'marginBottom';
export interface TextLayoutPatch {
  property: TextLayoutProperty;
  value: number | false;
  handle: EditorSelectionHandle;
  range?: Range;
}
