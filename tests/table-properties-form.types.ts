import type { Editor } from '@morfira-dev/wysiwyg';
import type { TablePropertiesCommands } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { createTablePropertiesForm, TablePropertiesFormController, TablePropertiesFormOptions, TablePropertiesFormValues } from '@morfira-dev/wysiwyg/ui/table-properties';

export interface TablePropertiesFormTestOptions {
  logical?: boolean;
  backward?: boolean;
  rejectErrors?: boolean;
}

declare global {
  interface Window {
    propertyForm: TablePropertiesFormController;
    propertyFormCommands: TablePropertiesCommands;
    propertyFormFactory: typeof createTablePropertiesForm;
    propertyFormErrors: string[];
    propertyFormOriginalNodes: Node[];
    propertyFormSecondEditor?: Editor;
    propertyFormSecond?: TablePropertiesFormController;
  }
}

const checkTablePropertiesFormTypes = (factory: typeof createTablePropertiesForm, host: HTMLElement, editor: Editor) => {
  const options: TablePropertiesFormOptions = { label: 'Table properties', onError: async () => undefined };
  const form: TablePropertiesFormController = factory(host, editor, options);
  const values: TablePropertiesFormValues = form.getValues();
  form.setValues({ width: '60%', alignment: 'center', cellBackground: '', cellBorder: '#abc', cellVerticalAlign: 'middle', headerRow: 'true', headerColumn: '', caption: 'Results', rowMinHeight: '72px' });
  form.refresh();
  void values;
  // @ts-expect-error form values describe editable strings rather than command reset values
  form.setValues({ width: false });
  // @ts-expect-error table structure is outside this form's editable values
  form.setValues({ rowspan: '2' });
  form.destroy();
};
void checkTablePropertiesFormTypes;
