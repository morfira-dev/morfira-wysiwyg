import type { Editor } from '@morfira-dev/wysiwyg';
import { autolink, autolinkCommands } from '@morfira-dev/wysiwyg/plugins/autolink';
import type { AutolinkOptions, AutolinkState } from '@morfira-dev/wysiwyg/plugins/autolink';

const verifyAutolink = (editor: Editor) => {
  const options: AutolinkOptions = { enabled: true };
  const plugin = autolink(options);
  const commands = autolinkCommands(editor);
  const state: AutolinkState = commands.getState();
  commands.setEnabled(!state.enabled);
  // @ts-expect-error enable preference is a boolean
  commands.setEnabled('yes');
  // @ts-expect-error no implicit URL fetching or preview configuration
  autolink({ preview: true });
  return plugin;
};
void verifyAutolink;
