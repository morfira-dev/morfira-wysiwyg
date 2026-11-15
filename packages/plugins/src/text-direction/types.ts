export type TextDirection = 'ltr' | 'rtl';

export interface TextDirectionState {
  disabled: boolean;
  direction: TextDirection | false;
  mixed: boolean;
}

export interface TextDirectionCommands {
  setDirection(value: TextDirection | false): void;
  getState(): TextDirectionState;
}
