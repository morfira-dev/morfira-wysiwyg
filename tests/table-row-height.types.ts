import type { TablePropertiesCommands, TablePropertiesPatch, TablePropertiesState } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { TablePropertiesFormController } from '@morfira-dev/wysiwyg/ui/table-properties';

const assertRowHeightTypes = (api: TablePropertiesCommands, form: TablePropertiesFormController) => {
  const patch: TablePropertiesPatch = { rowMinHeight: '72px' };
  api.update(patch);
  api.update({ rowMinHeight: false });
  const state: TablePropertiesState = api.getState();
  const rowMinHeight: string | false = state.rowMinHeight;
  form.setValues({ rowMinHeight: '72px' });
  const draft: string = form.getValues().rowMinHeight;
  void rowMinHeight;
  void draft;
  // @ts-expect-error row heights require bounded unit-bearing strings or false
  api.update({ rowMinHeight: 72 });
  // @ts-expect-error form values are string drafts, not reset flags
  form.setValues({ rowMinHeight: false });
};
void assertRowHeightTypes;
