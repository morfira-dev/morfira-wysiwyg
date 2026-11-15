import { createContextualToolbar } from '@morfira-dev/wysiwyg/ui/contextual';
import type { ContextualToolbarController, ContextualToolbarOptions, ContextualToolbarMessageKey } from '@morfira-dev/wysiwyg/ui/contextual';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { EditorUIAction } from '@morfira-dev/wysiwyg/ui/editor';

declare global { interface Window { contextualUI: ContextualToolbarController; } }

const checkContextualTypes = (host: HTMLElement, editor: Editor, range: Range) => {
  const action: EditorUIAction = {
    id: 'app:projected',
    label: (current, saved) => current.getFormats(saved).bold ? 'Bold selection' : 'Plain selection',
    enabled: (current, saved) => Boolean(saved && current.getFormats(saved).bold),
    pressed: (current, saved) => Boolean(saved && current.getFormats(saved).bold),
    run: (current) => current.format('underline', true),
  };
  const options: ContextualToolbarOptions = { groups: [['bold', action]], density: 'compact', gap: 12, label: 'Selection actions' };
  const ui: ContextualToolbarController = createContextualToolbar(host, editor, options);
  editor.getFormats(range);
  ui.refresh();
  ui.destroy();
  // @ts-expect-error contextual toolbar has bounded geometry, not a portal API
  createContextualToolbar(host, editor, { portal: document.body });
  // @ts-expect-error format projection takes a native Range
  editor.getFormats({ index: 0, length: 4 });
  // @ts-expect-error gap is a finite pixel number at runtime
  createContextualToolbar(host, editor, { gap: '8px' });
};
void checkContextualTypes;
const messageKey = '' as ContextualToolbarMessageKey;
void messageKey;
