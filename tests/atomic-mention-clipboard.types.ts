import type { Editor } from '@morfira-dev/wysiwyg';
import { mentionClipboardCommands } from '@morfira-dev/wysiwyg/plugins/mentions';
import type { MentionClipboardCommands, MentionClipboardData, MentionClipboardInput } from '@morfira-dev/wysiwyg/plugins/mentions';

const checkMentionClipboardTypes = (editor: Editor) => {
  const commands: MentionClipboardCommands = mentionClipboardCommands(editor);
  const copied: MentionClipboardData | undefined = commands.copy();
  const cut: MentionClipboardData | undefined = commands.cut();
  const input: MentionClipboardInput = { html: copied?.html, text: copied?.text };
  const pasted: boolean = commands.paste(input);
  // @ts-expect-error clipboard input is text, never an arbitrary live DOM fragment
  commands.paste({ html: document.createElement('span') });
  // @ts-expect-error no navigator clipboard transport or hidden identity field
  commands.paste({ text: '@Anna', id: 'person-42' });
  void [cut, pasted];
};

void checkMentionClipboardTypes;
