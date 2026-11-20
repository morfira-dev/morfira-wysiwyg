import { createFullscreenUI, fullscreenUIMessages } from '@morfira-dev/wysiwyg/ui/fullscreen';
import type { FullscreenUIController, FullscreenUIMessageKey, FullscreenUIOptions } from '@morfira-dev/wysiwyg/ui/fullscreen';
import type { Editor } from '@morfira-dev/wysiwyg';

export interface FullscreenTestOptions {
  value?: string;
}

declare global {
  interface Window {
    fullscreenModule: typeof import('@morfira-dev/wysiwyg/ui/fullscreen');
    fullscreenUI: FullscreenUIController;
    fullscreenWorkspace: HTMLElement;
    fullscreenControlHost: HTMLElement;
    fullscreenPositioner: HTMLElement;
    fullscreenChanges: boolean[];
    fullscreenErrors: unknown[];
  }
}

const checkFullscreenTypes = (host: HTMLElement, target: HTMLElement, editor: Editor, key: FullscreenUIMessageKey) => {
  const options: FullscreenUIOptions = {
    target, label: fullscreenUIMessages.en[key],
    onChange: (active: boolean) => { void active; },
    onError: (error: unknown) => { void error; },
  };
  const ui: FullscreenUIController = createFullscreenUI(host, editor, options);
  const button: HTMLElement = ui.element;
  const entered: boolean = ui.enter();
  const toggled: boolean = ui.toggle();
  const active: boolean = ui.isActive();
  ui.exit();
  ui.refresh();
  ui.destroy();
  // @ts-expect-error application-owned target is required
  createFullscreenUI(host, editor, {});
  // @ts-expect-error target accepts an actual element, not a selector
  createFullscreenUI(host, editor, { target: '.workspace' });
  // @ts-expect-error no implicit modal/global browser-keyboard option exists
  createFullscreenUI(host, editor, { target, interceptF11: true });
  // @ts-expect-error callers cannot replace the owned control
  ui.element = button;
  void [entered, toggled, active];
};
void checkFullscreenTypes;
