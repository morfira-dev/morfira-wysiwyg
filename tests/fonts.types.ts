import { fonts, fontCommands } from '@morfira-dev/wysiwyg/plugins/fonts';
import type { FontCommands, FontFamilyOption, FontsOptions, FontState } from '@morfira-dev/wysiwyg/plugins/fonts';
import type { Editor } from '@morfira-dev/wysiwyg';

const families: readonly FontFamilyOption[] = Object.freeze([{ id: 'local', label: 'Local', family: 'Local Font, serif' }]);
const options: FontsOptions = { families, sizes: Object.freeze([12, 24]) };
const checkFonts = (editor: Editor) => {
  fonts(options);
  const commands: FontCommands = fontCommands(editor);
  commands.setFamily('local');
  commands.setFamily(false);
  commands.setSize(24);
  commands.setSize(false);
  const state: FontState = commands.getState();
  const actualFamily: string | false = state.family;
  const actualSize: string | false = state.size;
  void actualFamily;
  void actualSize;
  // @ts-expect-error family commands use configured IDs, never objects
  commands.setFamily({ family: 'serif' });
  // @ts-expect-error sizes use configured numeric px choices
  commands.setSize('24px');
  // @ts-expect-error font assets are application-owned
  fonts({ load: 'https://example.com/font.woff2' });
};
void checkFonts;
