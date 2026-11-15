import type { Editor } from '@morfira-dev/wysiwyg';
import { getTableSelection, tableCommands, tableSelectionChange } from '@morfira-dev/wysiwyg/plugins/tables';
import type { TableCommands, TableSelectionState, CellRectangle } from '@morfira-dev/wysiwyg/plugins/tables';

declare global {
  interface Window {
    tableStateAPI: TableCommands;
    getTableState: (range?: Range) => TableSelectionState | undefined;
    tableStateEvents: number[];
  }
}

const checkTableSelectionTypes = (editor: Editor, host: HTMLElement) => {
  const commands = tableCommands(editor);
  const state: TableSelectionState | undefined = getTableSelection(editor);
  const rectangle: Readonly<CellRectangle> | undefined = state?.rectangle;
  const release: () => void = commands.registerSelectionHost(host);
  editor.events.on(tableSelectionChange, (revision: number) => { void revision; });
  if (state) {
    // @ts-expect-error the state is observational
    state.revision = 1;
    // @ts-expect-error consumers cannot append cells to the snapshot
    state.cells.push(document.createElement('td'));
  }
  // @ts-expect-error projection requires a real Range
  getTableSelection(editor, {});
  release();
  void rectangle;
};
void checkTableSelectionTypes;
