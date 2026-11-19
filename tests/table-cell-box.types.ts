import type { TableCellBorderStyle, TablePropertiesCommands, TablePropertiesPatch } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { TablePropertiesFormController } from '@morfira-dev/wysiwyg/ui/table-properties';

const assertCellBoxTypes = (api: TablePropertiesCommands, form: TablePropertiesFormController) => {
  const style: TableCellBorderStyle = 'double';
  const patch: TablePropertiesPatch = { cellPadding: '8px', cellBorderWidth: '2px', cellBorderStyle: style };
  api.update(patch);
  api.update({ cellPadding: false, cellBorderWidth: false, cellBorderStyle: false });
  form.setValues({ cellPadding: '8px', cellBorderWidth: '', cellBorderStyle: 'dashed' });
  const draft: string = form.getValues().cellPadding;
  void draft;
  // @ts-expect-error length properties require unit-bearing strings, not numbers
  api.update({ cellPadding: 8 });
  // @ts-expect-error supported styles form a bounded enum
  api.update({ cellBorderStyle: 'groove' });
  // @ts-expect-error form values are string drafts
  form.setValues({ cellBorderWidth: false });
};
void assertCellBoxTypes;
