import type { Editor } from '@morfira-dev/wysiwyg';
import { tableProperties, tablePropertyCommands } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { TableAlignment, TableCellVerticalAlign, TablePropertiesCommands, TablePropertiesPatch, TablePropertiesState } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { TableCommands, TableSelectionState } from '@morfira-dev/wysiwyg/plugins/tables';

declare global {
  interface Window {
    tablePropertiesAPI: TablePropertiesCommands;
    propertiesTableAPI: TableCommands;
    propertiesSelection: () => TableSelectionState | undefined;
  }
}

const checkTablePropertyTypes = (editor: Editor) => {
  tableProperties();
  const api: TablePropertiesCommands = tablePropertyCommands(editor);
  const alignment: TableAlignment = 'center';
  const vertical: TableCellVerticalAlign = 'middle';
  const patch: TablePropertiesPatch = { width: '60%', alignment, cellBackground: '#abc', cellBorder: false, cellVerticalAlign: vertical };
  api.update(patch);
  const state: TablePropertiesState = api.getState();
  const width: string | false = state.width;
  const mixed: string | false = state.cellBackground;
  void width;
  void mixed;
  // @ts-expect-error placement is not text justification
  api.update({ alignment: 'justify' });
  // @ts-expect-error arbitrary vertical CSS values are outside this enum
  api.update({ cellVerticalAlign: 'baseline' });
  // @ts-expect-error arbitrary declarations are not table-property fields
  api.update({ padding: '4px' });
  // @ts-expect-error an update requires a patch object
  api.update(null);
};
void checkTablePropertyTypes;
