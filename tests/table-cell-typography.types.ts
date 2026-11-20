import type { TableCellTextAlign, TableCellDirection, TablePropertiesCommands, TablePropertiesPatch } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { TablePropertiesFormController } from '@morfira-dev/wysiwyg/ui/table-properties';

const assertCellTypographyTypes = (api: TablePropertiesCommands, form: TablePropertiesFormController) => {
  const alignment: TableCellTextAlign = 'justify';
  const direction: TableCellDirection = 'rtl';
  const patch: TablePropertiesPatch = { cellTextAlign: alignment, cellDirection: direction };
  api.update(patch);
  api.update({ cellTextAlign: false, cellDirection: false });
  const state = api.getState();
  const ownAlignment: TableCellTextAlign | false | 'mixed' = state.cellTextAlign;
  const ownDirection: TableCellDirection | false | 'mixed' = state.cellDirection;
  form.setValues({ cellTextAlign: 'left', cellDirection: '' });
  const draft: string = form.getValues().cellDirection;
  void [ownAlignment, ownDirection, draft];
  // @ts-expect-error cell alignment uses physical bounded values
  api.update({ cellTextAlign: 'start' });
  // @ts-expect-error automatic direction is outside the explicit bounded profile
  api.update({ cellDirection: 'auto' });
  // @ts-expect-error the form represents reset as an empty string, not false
  form.setValues({ cellDirection: false });
};
void assertCellTypographyTypes;
