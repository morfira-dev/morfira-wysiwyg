export type ListMarker = 'disc' | 'circle' | 'square' | 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';

export interface ListPropertyState {
  disabled: boolean;
  kind: 'ordered' | 'bullet' | false;
  start: number | false;
  reversed: boolean;
  marker: ListMarker | false;
}

export interface ListPropertyCommands {
  setStart(value: number | false): void;
  setReversed(value: boolean): void;
  setMarker(value: ListMarker | false): void;
  getState(): ListPropertyState;
}
