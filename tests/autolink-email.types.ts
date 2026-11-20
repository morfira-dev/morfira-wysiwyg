import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg';
import { autolink, autolinkCommands } from '@morfira-dev/wysiwyg/plugins/autolink';
import type { AutolinkOptions, AutolinkState } from '@morfira-dev/wysiwyg/plugins/autolink';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createExtendedPreset } from '@morfira-dev/wysiwyg/presets/extended';

const verifyEmailAutolink = (editor: Editor): EditorPlugin => {
  const options: AutolinkOptions = { enabled: true, email: true };
  const plugin = autolink(options);
  const state: AutolinkState = autolinkCommands(editor).getState();
  autolinkCommands(editor).setEnabled(!state.enabled);
  createStandardPreset({ autolink: options });
  createExtendedPreset({ autolink: { email: false }, mentions: { provide: () => [] }, slash: { provide: () => [] } });
  // @ts-expect-error email completion is an explicit boolean preference
  autolink({ email: 'auto' });
  // @ts-expect-error no email header or delivery configuration is supported
  autolink({ email: { headers: true } });
  // @ts-expect-error the runtime preference API remains enabled-only
  autolinkCommands(editor).setEmail(true);
  return plugin;
};
void verifyEmailAutolink;
