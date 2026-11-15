import { listProperties, listPropertyCommands } from '@morfira-dev/wysiwyg/plugins/list-properties';
import type { ListMarker, ListPropertyCommands, ListPropertyState } from '@morfira-dev/wysiwyg/plugins/list-properties';
import type { Editor } from '@morfira-dev/wysiwyg';

declare global { interface Window { listPropertyAPI: ListPropertyCommands; } }

const checkListProperties = (editor: Editor) => {
  listProperties();
  const commands: ListPropertyCommands = listPropertyCommands(editor);
  const marker: ListMarker = 'upper-roman';
  commands.setMarker(marker);
  commands.setMarker(false);
  commands.setStart(-4);
  commands.setStart(false);
  commands.setReversed(true);
  const state: ListPropertyState = commands.getState();
  const kind: 'ordered' | 'bullet' | false = state.kind;
  const start: number | false = state.start;
  void kind;
  void start;
  // @ts-expect-error native boolean presence uses boolean command values
  commands.setReversed('false');
  // @ts-expect-error arbitrary counter and CSS declarations are not markers
  commands.setMarker('symbols(cyclic "x")');
  // @ts-expect-error start uses an integer value or false, never a string
  commands.setStart('4');
};
void checkListProperties;
