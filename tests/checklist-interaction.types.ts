import type { Editor, SchemaContribution } from '@morfira-dev/wysiwyg';
import { checklists } from '@morfira-dev/wysiwyg/plugins/checklists';
import type { ChecklistOptions } from '@morfira-dev/wysiwyg/plugins/checklists';

export interface ChecklistInteractionSettings {
  options?: ChecklistOptions;
  schema?: SchemaContribution[];
}

export type ChecklistKeySettings = Pick<KeyboardEventInit,
  'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat' | 'isComposing' | 'keyCode' | 'cancelable'>;

declare global {
  interface Window {
    checklistInteractionModule: typeof import('@morfira-dev/wysiwyg/plugins/checklists');
  }
}

const checkInteractionTypes = (_editor: Editor) => {
  const options: ChecklistOptions = { interactive: false };
  checklists(options);
  checklists();
  // @ts-expect-error interaction options are booleans
  checklists({ interactive: 'true' });
  // @ts-expect-error no arbitrary event handlers or geometry are accepted
  checklists({ onClick: () => {} });
};

void checkInteractionTypes;
