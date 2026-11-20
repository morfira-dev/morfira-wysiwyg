export type TableAlignment = 'left' | 'center' | 'right';
export type TableCellVerticalAlign = 'top' | 'middle' | 'bottom';
export type TableCellBorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
export type TableCellTextAlign = 'left' | 'center' | 'right' | 'justify';
export type TableCellDirection = 'ltr' | 'rtl';

export interface TablePropertiesPatch {
  cellTextAlign?: TableCellTextAlign | false;
  cellDirection?: TableCellDirection | false;
  cellPadding?: string | false;
  cellBorderWidth?: string | false;
  cellBorderStyle?: TableCellBorderStyle | false;
  rowMinHeight?: string | false;
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
  readonly cellTextAlign: TableCellTextAlign | false | 'mixed';
  readonly cellDirection: TableCellDirection | false | 'mixed';
  readonly cellPadding: string | false | 'mixed';
  readonly cellBorderWidth: string | false | 'mixed';
  readonly cellBorderStyle: TableCellBorderStyle | false | 'mixed';
  readonly rowMinHeight: string | false | 'mixed';
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
