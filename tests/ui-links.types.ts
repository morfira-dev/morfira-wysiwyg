import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links';
import type { LinkFormController, LinkFormOptions } from '@morfira-dev/wysiwyg/ui/links';
import type { Editor } from '@morfira-dev/wysiwyg';

const checkLinkFormScope = (host: HTMLElement, editor: Editor) => {
  const options: LinkFormOptions = { scope: 'anchor', initialValues: { title: 'Whole anchor' } };
  const form: LinkFormController = createLinkForm(host, editor, options);
  createLinkForm(host, editor, { scope: 'selection' });
  createLinkForm(host, editor);
  // @ts-expect-error a form scope must be one of the supported editing contracts
  createLinkForm(host, editor, { scope: 'document' });
  form.destroy();
};

void checkLinkFormScope;
