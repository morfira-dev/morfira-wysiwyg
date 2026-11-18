export type TableAlignment = 'left' | 'center' | 'right';
export type TableCellVerticalAlign = 'top' | 'middle' | 'bottom';

export interface TablePropertiesPatch {
  headerRow?: boolean;
  headerColumn?: boolean;
  caption?: string | false;
  width?: string | false;
  alignment?: TableAlignment | false;
  cellBackground?: string | false;
  cellBorder?: string | false;
  cellVerticalAlign?: TableCellVerticalAlign | false;
}

export interface TablePropertiesState {
  readonly headerRow: boolean;
  readonly headerColumn: boolean;
  readonly caption: string | false;
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
