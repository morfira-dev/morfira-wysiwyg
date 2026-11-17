import type { StandardEditorUIController } from '@morfira-dev/wysiwyg/ui/standard';
import type { TablePickerController, TablePickerFactory, TablePickerOptions } from '@morfira-dev/wysiwyg/ui/table-picker';

export interface TablePickerTestState {
  ui: StandardEditorUIController;
  picker?: TablePickerController;
  select?: TablePickerOptions['onSelect'];
}

const checkTablePickerTypes = (factory: TablePickerFactory, host: HTMLElement, options: TablePickerOptions) => {
  const controller: TablePickerController = factory(host, options);
  controller.refresh({ locale: options.locale, disabled: true });
  // @ts-expect-error refresh cannot change the insertion callback
  controller.refresh({ locale: options.locale, disabled: false, onSelect: () => undefined });
  controller.destroy();
};
void checkTablePickerTypes;
