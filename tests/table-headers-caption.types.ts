import type { TablePropertiesCommands, TablePropertiesPatch } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { TableCommands, TableSelectionState } from '@morfira-dev/wysiwyg/plugins/tables';
import type { TablePropertiesFormController } from '@morfira-dev/wysiwyg/ui/table-properties';

declare global {
  interface Window {
    headerProperties: TablePropertiesCommands;
    headerTables: TableCommands;
    headerSelection: () => TableSelectionState | undefined;
    headerForm: TablePropertiesFormController;
    headerFormErrors: string[];
  }
}

const assertHeaderCaptionTypes = (api: TablePropertiesCommands) => {
  const patch: TablePropertiesPatch = { headerRow: true, headerColumn: false, caption: 'Quarterly results' };
  api.update(patch);
  api.update({ caption: false });
  const enabled: boolean = api.getState().headerRow;
  const caption: string | false = api.getState().caption;
  void enabled;
  void caption;
  // @ts-expect-error header flags are booleans, not strings or counts
  api.update({ headerRow: 'true' });
  // @ts-expect-error caption reset is false, not null
  api.update({ caption: null });
};
void assertHeaderCaptionTypes;
