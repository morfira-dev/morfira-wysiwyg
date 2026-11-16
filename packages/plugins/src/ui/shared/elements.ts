import type { FormInputElements } from './types.js';

/** Construct native UI nodes without installing behavior or changing their owner. */
export const createUIElement = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className !== undefined) element.className = className;
  return element;
};

export const createUIButton = (document: Document, className?: string): HTMLButtonElement => {
  const button = createUIElement(document, 'button', className);
  button.type = 'button';
  return button;
};

export const createUIStatus = (document: Document, className: string): HTMLParagraphElement => {
  const status = createUIElement(document, 'p', className);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  return status;
};

export const createFormInput = (document: Document, type = 'text', checkbox = false): FormInputElements => {
  const label = createUIElement(document, 'label', checkbox ? 'mw-form-checkbox' : undefined);
  const caption = createUIElement(document, 'span');
  const input = createUIElement(document, 'input');
  input.type = type;
  if (checkbox) label.append(input, caption);
  else label.append(caption, input);
  return { label, caption, input };
};
