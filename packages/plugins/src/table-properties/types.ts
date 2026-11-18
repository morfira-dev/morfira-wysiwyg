export type TableAlignment = 'left' | 'center' | 'right';
export type TableCellVerticalAlign = 'top' | 'middle' | 'bottom';

export interface TablePropertiesPatch {
  width?: string | false;
  alignment?: TableAlignment | false;
  cellBackground?: string | false;
  cellBorder?: string | false;
  cellVerticalAlign?: TableCellVerticalAlign | false;
}

export interface TablePropertiesState {
  readonly disabled: boolean;
  readonly width: string | false;
  readonly alignment: TableAlignment | false;
  readonly cellBackground: string | false;
  readonly cellBorder: string | false;
  readonly cellVerticalAlign: TableCellVerticalAlign | false | 'mixed';
}

export interface TablePropertiesCommands {
  update(patch: TablePropertiesPatch): void;
  getState(): TablePropertiesState;
}
