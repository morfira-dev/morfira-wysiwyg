import { createSpecialCharacterUI, specialCharacterUIMessages } from '@morfira-dev/wysiwyg/ui/special-characters';
import type { SpecialCharacter, SpecialCharacterUIController, SpecialCharacterUIOptions, SpecialCharacterUIMessageKey } from '@morfira-dev/wysiwyg/ui/special-characters';
import type { Editor } from '@morfira-dev/wysiwyg';

export interface SpecialCharacterTestOptions {
  value?: string;
  presentation?: 'inline' | 'dialog';
  characters?: SpecialCharacter[];
  semantic?: boolean;
  tables?: boolean;
}

declare global {
  interface Window {
    specialCharacterModule: typeof import('@morfira-dev/wysiwyg/ui/special-characters');
    specialCharacterUI: SpecialCharacterUIController;
  }
}

const checkSpecialCharacterTypes = (host: HTMLElement, editor: Editor, key: SpecialCharacterUIMessageKey) => {
  const characters: readonly SpecialCharacter[] = [{ id: 'euro', text: '€', label: 'Euro' }];
  const options: SpecialCharacterUIOptions = { characters, label: specialCharacterUIMessages.en[key], onError: (error: unknown) => { void error; } };
  const ui: SpecialCharacterUIController = createSpecialCharacterUI(host, editor, options);
  const element: HTMLElement = ui.element;
  ui.refresh();
  ui.destroy();
  // @ts-expect-error the owned element cannot be replaced
  ui.element = element;
  // @ts-expect-error characters are structured literal text entries
  createSpecialCharacterUI(host, editor, { characters: ['€'] });
  // @ts-expect-error no HTML catalog rendering extension is exposed
  createSpecialCharacterUI(host, editor, { renderHTML: () => '<b>symbol</b>' });
};
void checkSpecialCharacterTypes;
