import type { tablesMessages } from './messages.js';
export type TablesMessageKey = keyof typeof tablesMessages.en;

export interface GridCell {
  element: HTMLTableCellElement;
  row: number;
  column: number;
  rowspan: number;
  colspan: number;
}
export interface TableGrid {
  rows: number;
  columns: number;
  cells: GridCell[];
  slots: GridCell[][];
}
export interface CellAddress {
  row: number;
  column: number;
}
export interface CellRectangle {
  top: number;
  left: number;
  bottom: number;
  right: number;
}
export interface TableClipboardInput {
  html?: string;
  text?: string;
}
export interface TableClipboardData {
  html: string;
  text: string;
}
export interface TablePastePlan {
  apply(): void;
  firstCell: HTMLTableCellElement;
}
export interface TableOptions {
  onClipboardError?: (error: Error) => void;
}
export interface TableSelectionState {
  readonly table: HTMLTableElement;
  readonly cells: readonly HTMLTableCellElement[];
  readonly rectangle: Readonly<CellRectangle>;
  readonly rows: number;
  readonly columns: number;
  readonly explicit: boolean;
  readonly revision: number;
  readonly canMerge: boolean;
  readonly canSplit: boolean;
}
export interface TableCommands {
  registerSelectionHost(host: HTMLElement): () => void;
  copy(): TableClipboardData;
  cut(): TableClipboardData;
  paste(data: TableClipboardInput): void;
  insert(rows: number, columns: number): void;
  select(from: CellAddress, to?: CellAddress): void;
  selectRow(): void;
  selectColumn(): void;
  selectTable(): void;
  rowAbove(): void;
  rowBelow(): void;
  columnLeft(): void;
  columnRight(): void;
  deleteRow(): void;
  deleteColumn(): void;
  merge(): void;
  split(): void;
  remove(): void;
  background(color: string): void;
  border(color: string): void;
  columnWidth(column: number, pixels: number): void;
}
