import { createUIButton } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import type { ImageDialogController, ImageDialogOptions } from './internal-types.js';

/** Owned native modal; suspension removes inertness before editor focus guards. */
export const createImageDialog = (host: HTMLElement, form: HTMLElement, options: ImageDialogOptions): ImageDialogController => {
  const document = host.ownerDocument;
  const dialog = document.createElement('dialog');
  dialog.className = 'mw-image-dialog';
  const closeButton = createUIButton(document, 'mw-image-dialog-close');
  dialog.append(closeButton, form);
  host.append(dialog);
  let disposed = false;
  let opened = false;
  let ignoredCloseEvents = 0;
  let origin: HTMLElement | undefined;
  const physicalClose = () => {
    if (!dialog.open) return;
    ignoredCloseEvents++;
    dialog.close();
  };
  const owned = () => !disposed && host.isConnected && dialog.isConnected && host.contains(dialog);
  const render = () => {
    if (disposed) return;
    dialog.setAttribute('aria-label', options.label());
    closeButton.textContent = options.closeLabel();
  };
  const close = (restoreFocus = true) => {
    if (disposed || !opened) return;
    opened = false;
    const target = origin;
    origin = undefined;
    physicalClose();
    options.cancel();
    if (restoreFocus && target?.isConnected && !dialog.contains(target)) target.focus({ preventScroll: true });
  };
  const show = () => {
    if (!opened || !owned()) return;
    dialog.showModal();
    form.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus({ preventScroll: true });
  };
  const open = () => {
    if (disposed || opened || !owned()) return;
    origin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    options.inspect();
    if (!owned()) return;
    opened = true;
    show();
  };
  const cancel = (event: Event) => {
    event.preventDefault();
    close();
  };
  const externallyClosed = () => {
    if (ignoredCloseEvents) { ignoredCloseEvents--; return; }
    if (opened) close();
  };
  const cleanups = [
    listenToUI(closeButton, 'click', () => close()),
    listenToUI(dialog, 'cancel', cancel),
    listenToUI(dialog, 'close', externallyClosed),
  ];
  const destroy = () => {
    if (disposed) return;
    close(false);
    disposed = true;
    for (const cleanup of cleanups) cleanup();
    dialog.remove();
  };
  render();
  return { open, close, isOpen: () => opened && owned(), suspend: physicalClose, resume: show, render, destroy };
};
