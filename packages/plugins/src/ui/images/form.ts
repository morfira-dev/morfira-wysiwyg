import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { imageCommands } from '../../images/index.js';
import type { ImageValue } from '../../images/types.js';
import { createFormSelection } from '../shared/selection.js';
import { imageFormMessages } from './messages.js';
import type { ImageFormController, ImageFormField, ImageFormMessageKey, ImageFormOptions, ImageFormValues } from './types.js';

const fields: readonly ImageFormField[] = ['src', 'alt', 'width', 'height', 'caption'];
const checkedValues = (values: Partial<ImageFormValues>): Partial<ImageFormValues> => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Image form values must be an object.');
  const entries = Object.entries(values);
  if (entries.some(([key, value]) => !fields.includes(key as ImageFormField) || typeof value !== 'string')) throw new TypeError('Image form values must contain known string fields.');
  return Object.fromEntries(entries);
};
const selectedImage = (editor: Editor, range: Range | undefined): HTMLImageElement | undefined => {
  if (!range) return;
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const caption = start?.closest('figcaption');
  if (range.collapsed && caption && editor.surface.contains(caption) && caption.parentElement?.querySelectorAll('img').length === 1) return caption.parentElement.querySelector('img') ?? undefined;
  if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== 1 || range.endOffset !== range.startOffset + 1) return;
  const node = range.startContainer.childNodes[range.startOffset];
  if (node instanceof HTMLImageElement) return node;
  if (node instanceof HTMLElement && node.localName === 'figure' && node.querySelectorAll('img').length === 1) return node.querySelector('img') ?? undefined;
};

export const createImageForm = (host: HTMLElement, editor: Editor, options: ImageFormOptions = {}): ImageFormController => {
  const api = imageCommands(editor);
  const initial = checkedValues(options.initialValues ?? {});
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('Image form label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Image form onError must be a callback.');
  const document = host.ownerDocument;
  const form = document.createElement('section');
  form.className = 'mw-form mw-image-form';
  form.setAttribute('role', 'form');
  const selection = createFormSelection(editor);
  const inputs = {} as Record<ImageFormField, HTMLInputElement>;
  const labels = {} as Record<ImageFormField, HTMLSpanElement>;
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'mw-form-fields';
  for (const field of fields) {
    const label = document.createElement('label');
    const text = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'text';
    if (field === 'width' || field === 'height') input.inputMode = 'numeric';
    if (field === 'caption') input.maxLength = 5000;
    if (field === 'alt') input.maxLength = 20000;
    input.value = initial[field] ?? '';
    inputs[field] = input;
    labels[field] = text;
    label.append(text, input);
    fieldset.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'mw-form-actions';
  const insert = document.createElement('button');
  insert.type = 'button';
  const update = document.createElement('button');
  update.type = 'button';
  const remove = document.createElement('button');
  remove.type = 'button';
  actions.append(insert, update, remove);
  const uploadLabel = document.createElement('label');
  const uploadText = document.createElement('span');
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif';
  uploadLabel.append(uploadText, file);
  const cancel = document.createElement('button');
  cancel.type = 'button';
  const status = document.createElement('p');
  status.className = 'mw-form-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.append(fieldset, actions, uploadLabel, cancel, status);

  let disposed = false;
  let selected = false;
  let signature = '';
  let statusKey: ImageFormMessageKey | undefined;
  let upload: AbortController | undefined;
  const cleanups: (() => void)[] = [];
  const text = (key: ImageFormMessageKey) => localize(editor.getLocale(), key, imageFormMessages);
  const getValues = (): ImageFormValues => ({ src: inputs.src.value, alt: inputs.alt.value, width: inputs.width.value, height: inputs.height.value, caption: inputs.caption.value });
  const updateControls = () => {
    if (disposed) return;
    const blocked = editor.isReadOnly();
    form.setAttribute('aria-busy', String(Boolean(upload)));
    fieldset.disabled = blocked;
    insert.disabled = blocked || Boolean(upload);
    update.disabled = blocked || !selected || Boolean(upload);
    remove.disabled = blocked || !selected || Boolean(upload);
    file.disabled = blocked || Boolean(upload);
    cancel.disabled = !upload;
  };
  const renderLocale = () => {
    if (disposed) return;
    form.setAttribute('aria-label', options.label ?? text('ui.images.label'));
    for (const field of fields) labels[field].textContent = text(`ui.images.${field}`);
    insert.textContent = text('ui.images.insert');
    update.textContent = text('ui.images.update');
    remove.textContent = text('ui.images.remove');
    uploadText.textContent = text('ui.images.uploadFile');
    cancel.textContent = text('ui.images.cancelUpload');
    status.textContent = statusKey ? text(statusKey) : '';
  };
  const setStatus = (key: ImageFormMessageKey | undefined, error = false) => {
    statusKey = key;
    status.dataset.error = String(error);
    renderLocale();
  };
  const report = (error: unknown, uploading = false) => {
    setStatus(uploading ? 'ui.images.uploadError' : 'ui.images.error', true);
    try { options.onError?.(error); }
    catch { /* A diagnostic callback cannot interrupt form cleanup. */ }
  };
  const setValues = (values: Partial<ImageFormValues>) => {
    if (disposed) return;
    const checked = checkedValues(values);
    for (const field of fields) if (checked[field] !== undefined) inputs[field].value = checked[field]!;
  };
  const refresh = () => {
    if (disposed) return;
    selection.capture();
    const image = selectedImage(editor, selection.peek());
    selected = Boolean(image);
    const figure = image?.parentElement?.localName === 'figure' && image.parentElement.querySelectorAll('img').length === 1 ? image.parentElement : undefined;
    const next = figure?.outerHTML ?? image?.outerHTML ?? '';
    if (image && next !== signature && !form.contains(document.activeElement)) {
      setValues({ src: image.getAttribute('src') ?? '', alt: image.getAttribute('alt') ?? '', width: image.getAttribute('width') ?? '', height: image.getAttribute('height') ?? '', caption: figure?.querySelector('figcaption')?.textContent ?? '' });
      signature = next;
      setStatus(undefined);
    }
    if (!image) signature = '';
    updateControls();
  };
  const value = (): ImageValue => {
    const draft = getValues();
    return { src: draft.src, alt: draft.alt, caption: draft.caption, ...(draft.width !== '' ? { width: Number(draft.width) } : {}), ...(draft.height !== '' ? { height: Number(draft.height) } : {}) };
  };
  const act = (operation: 'insert' | 'update' | 'remove') => {
    if (disposed || editor.isReadOnly() || upload) return;
    if (!selection.restore()) {
      setStatus('ui.images.selection', true);
      return;
    }
    try {
      if (operation === 'insert') api.insert(value());
      else if (operation === 'update') api.update({ ...value(), width: inputs.width.value === '' ? null : Number(inputs.width.value), height: inputs.height.value === '' ? null : Number(inputs.height.value) });
      else api.remove();
      selection.capture();
      setStatus(operation === 'insert' ? 'ui.images.uploaded' : operation === 'update' ? 'ui.images.saved' : 'ui.images.removed');
      refresh();
    }
    catch (error) { report(error); }
  };
  const insertImage = () => act('insert');
  const keyboard = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (!(event.target instanceof HTMLInputElement) || event.target.type === 'file') return;
    event.preventDefault();
    event.stopPropagation();
    act('insert');
  };
  const updateImage = () => act('update');
  const removeImage = () => act('remove');
  const cancelUpload = () => upload?.abort();
  const uploadFile = () => {
    const chosen = file.files?.[0];
    if (disposed || editor.isReadOnly() || upload || !chosen) return;
    if (!selection.restore()) {
      setStatus('ui.images.selection', true);
      file.value = '';
      return;
    }
    const owned = new AbortController();
    upload = owned;
    setStatus('ui.images.uploading');
    updateControls();
    void api.upload(chosen, { signal: owned.signal }).then((inserted) => {
      if (!disposed && upload === owned) setStatus(inserted ? 'ui.images.uploaded' : 'ui.images.cancelled');
    }).catch((error: unknown) => {
      if (!disposed && upload === owned) report(error, true);
    }).finally(() => {
      if (upload === owned) upload = undefined;
      if (!disposed) {
        file.value = '';
        refresh();
      }
    });
  };
  const capture = () => selection.capture();
  form.addEventListener('pointerdown', capture, true);
  form.addEventListener('focusin', capture, true);
  form.addEventListener('keydown', keyboard);
  insert.addEventListener('click', insertImage);
  update.addEventListener('click', updateImage);
  remove.addEventListener('click', removeImage);
  cancel.addEventListener('click', cancelUpload);
  file.addEventListener('change', uploadFile);
  cleanups.push(
    () => form.removeEventListener('pointerdown', capture, true),
    () => form.removeEventListener('focusin', capture, true),
    () => form.removeEventListener('keydown', keyboard),
    () => insert.removeEventListener('click', insertImage),
    () => update.removeEventListener('click', updateImage),
    () => remove.removeEventListener('click', removeImage),
    () => cancel.removeEventListener('click', cancelUpload),
    () => file.removeEventListener('change', uploadFile),
  );
  cleanups.push(editor.onSelectionChange(refresh));
  // Inspect synchronously before an application moves focus into a field.
  editor.surface.addEventListener('click', refresh);
  cleanups.push(() => editor.surface.removeEventListener('click', refresh));
  cleanups.push(editor.subscribe((change) => {
    if (change.source === 'api') {
      selected = false;
      signature = '';
      setStatus(undefined);
    }
    refresh();
  }));
  cleanups.push(editor.events.on('localechange', renderLocale));
  cleanups.push(editor.events.on('readonlychange', (readOnly) => {
    if (readOnly) upload?.abort();
    updateControls();
  }));
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    upload?.abort();
    upload = undefined;
    for (const cleanup of cleanups) cleanup();
    selection.destroy();
    form.remove();
  };
  cleanups.push(editor.events.on('destroy', destroy));
  renderLocale();
  refresh();
  host.append(form);
  return { element: form, refresh, getValues, setValues, destroy };
};
