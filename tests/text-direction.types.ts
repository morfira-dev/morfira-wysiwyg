import { textDirection, textDirectionCommands } from '@morfira-dev/wysiwyg/plugins/text-direction';
import type { TextDirection, TextDirectionCommands, TextDirectionState } from '@morfira-dev/wysiwyg/plugins/text-direction';
import type { Editor } from '@morfira-dev/wysiwyg';

declare global { interface Window { textDirectionAPI: TextDirectionCommands; } }

const checkTextDirection = (editor: Editor) => {
  textDirection();
  const commands: TextDirectionCommands = textDirectionCommands(editor);
  const direction: TextDirection = 'rtl';
  commands.setDirection(direction);
  commands.setDirection('ltr');
  commands.setDirection(false);
  const state: TextDirectionState = commands.getState();
  const explicit: TextDirection | false = state.direction;
  void explicit;
  // @ts-expect-error automatic direction is outside this explicit command profile
  commands.setDirection('auto');
  // @ts-expect-error reset uses false, never null or a generic boolean
  commands.setDirection(true);
};
void checkTextDirection;
