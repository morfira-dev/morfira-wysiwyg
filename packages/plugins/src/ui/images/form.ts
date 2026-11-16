import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { imageCommands } from '../../images/index.js';
import type { ImagePatch, ImageValue } from '../../images/types.js';
import { createFormSelection } from '../shared/selection.js';
import { createFormInput, createUIButton, createUIElement, createUIStatus } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
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
  if (editor.surface.contains(host)) throw new Error('Mount image forms outside persisted editor content.');
  const mode = options.mode === undefined ? 'all' : options.mode;
  if (mode !== 'all' && mode !== 'edit') throw new TypeError('Image form mode must be all or edit.');
  const api = imageCommands(editor);
  const initial = checkedValues(options.initialValues ?? {});
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('Image form label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Image form onError must be a callback.');
  const document = host.ownerDocument;
  const form = createUIElement(document, 'section', 'mw-form mw-image-form');
  form.setAttribute('role', 'form');
  const selection = createFormSelection(editor);
  const inputs = {} as Record<ImageFormField, HTMLInputElement>;
  const labels = {} as Record<ImageFormField, HTMLSpanElement>;
  const fieldset = createUIElement(document, 'fieldset', 'mw-form-fields');
  for (const field of fields) {
    const { label, caption: text, input } = createFormInput(document);
    if (field === 'width' || field === 'height') input.inputMode = 'numeric';
    if (field === 'caption') input.maxLength = 5000;
    if (field === 'alt') input.maxLength = 20000;
    input.value = initial[field] ?? '';
    inputs[field] = input;
    labels[field] = text;
    fieldset.append(label);
  }
  const actions = createUIElement(document, 'div', 'mw-form-actions');
  const insert = createUIButton(document);
  const update = createUIButton(document);
  const remove = createUIButton(document);
  if (mode === 'all') actions.append(insert);
  actions.append(update, remove);
  const { label: uploadLabel, caption: uploadText, input: file } = createFormInput(document, 'file');
  file.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif';
  const cancel = createUIButton(document);
  const status = createUIStatus(document, 'mw-form-status');
  form.append(fieldset, actions);
  if (mode === 'all') form.append(uploadLabel, cancel);
  form.append(status);

  let disposed = false;
  let composing = false;
  let restoring = false;
  let apiRevision = 0;
  let editTarget: HTMLImageElement | undefined;
  let inspectedCaption = '';
  let selected = false;
  let signature = '';
  let statusKey: ImageFormMessageKey | undefined;
  let upload: AbortController | undefined;
  const cleanups: (() => void)[] = [];
  const text = (key: ImageFormMessageKey) => localize(editor.getLocale(), key, imageFormMessages);
  const ordinaryImage = (image: HTMLImageElement): boolean => {
    if (!editor.surface.contains(image)) return false;
    const figure = image.closest('figure');
    if (figure && editor.surface.contains(figure)) {
      for (const owned of figure.querySelectorAll('*')) {
        if (owned.namespaceURI !== 'http://www.w3.org/1999/xhtml' || owned.hasAttribute('data-mw-node')) return false;
      }
    }
    for (let node: Element | null = image; node; node = node.parentElement) {
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
      if (node !== editor.surface && node.hasAttribute('data-mw-node')) return false;
      if (node === editor.surface) return true;
    }
    return false;
  };
  const getValues = (): ImageFormValues => ({ src: inputs.src.value, alt: inputs.alt.value, width: inputs.width.value, height: inputs.height.value, caption: inputs.caption.value });
  const updateControls = () => {
    if (disposed) return;
    const blocked = editor.isReadOnly() || (mode === 'edit' && composing);
    form.setAttribute('aria-busy', String(Boolean(upload)));
    fieldset.disabled = blocked;
    insert.disabled = mode === 'edit' || blocked || Boolean(upload);
    update.disabled = blocked || !selected || Boolean(upload);
    remove.disabled = blocked || !selected || Boolean(upload);
    file.disabled = mode === 'edit' || blocked || Boolean(upload);
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
    if (disposed || restoring) return;
    selection.capture();
    let image = selectedImage(editor, selection.peek());
    if (mode === 'edit' && image && !ordinaryImage(image)) image = undefined;
    const focused = form.contains(document.activeElement);
    if (mode === 'edit') {
      if (focused && image !== editTarget) image = undefined;
      else if (!focused && image !== editTarget) {
        editTarget = image;
        signature = '';
      }
    }
    selected = Boolean(image);
    const figure = image?.parentElement?.localName === 'figure' && image.parentElement.querySelectorAll('img').length === 1 ? image.parentElement : undefined;
    const next = figure?.outerHTML ?? image?.outerHTML ?? '';
    if (image && next !== signature && !form.contains(document.activeElement)) {
      setValues({ src: image.getAttribute('src') ?? '', alt: image.getAttribute('alt') ?? '', width: image.getAttribute('width') ?? '', height: image.getAttribute('height') ?? '', caption: figure?.querySelector('figcaption')?.textContent ?? '' });
      signature = next;
      inspectedCaption = inputs.caption.value;
      setStatus(undefined);
    }
    if (!image) signature = '';
    updateControls();
  };
  const value = (draft: ImageFormValues = getValues()): ImageValue => {
    return { src: draft.src, alt: draft.alt, caption: draft.caption, ...(draft.width !== '' ? { width: Number(draft.width) } : {}), ...(draft.height !== '' ? { height: Number(draft.height) } : {}) };
  };
  const act = (operation: 'insert' | 'update' | 'remove') => {
    if (disposed || editor.isReadOnly() || upload || (mode === 'edit' && (composing || operation === 'insert'))) return;
    const target = mode === 'edit' ? editTarget : undefined;
    const revision = apiRevision;
    const draft = getValues();
    if (mode === 'edit' && (!target || !ordinaryImage(target))) {
      setStatus('ui.images.selection', true);
      return;
    }
    let restored = false;
    restoring = mode === 'edit';
    try { restored = selection.restore(); }
    finally { restoring = false; }
    if (disposed) return;
    if (!restored || editor.isReadOnly() || (mode === 'edit' && (composing || apiRevision !== revision
      || editTarget !== target || !target || !ordinaryImage(target) || selectedImage(editor, selection.peek()) !== target))) {
      setStatus('ui.images.selection', true);
      return;
    }
    try {
      if (operation === 'insert') api.insert(value());
      else if (operation === 'update') {
        const currentDraft = mode === 'edit' ? draft : getValues();
        const patch: ImagePatch = {
          ...value(currentDraft),
          width: currentDraft.width === '' ? null : Number(currentDraft.width),
          height: currentDraft.height === '' ? null : Number(currentDraft.height),
        };
        if (mode === 'edit' && draft.caption === inspectedCaption) delete patch.caption;
        api.update(patch);
      }
      else api.remove();
      if (disposed) return;
      selection.capture();
      setStatus(operation === 'insert' ? 'ui.images.uploaded' : operation === 'update' ? 'ui.images.saved' : 'ui.images.removed');
      refresh();
    }
    catch (error) { if (!disposed) report(error); }
  };
  const insertImage = () => act('insert');
  const keyboard = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (!(event.target instanceof HTMLInputElement) || event.target.type === 'file') return;
    event.preventDefault();
    event.stopPropagation();
    act(mode === 'edit' ? 'update' : 'insert');
  };
  const updateImage = () => act('update');
  const removeImage = () => act('remove');
  const cancelUpload = () => upload?.abort();
  const uploadFile = () => {
    const chosen = file.files?.[0];
    if (mode === 'edit' || disposed || editor.isReadOnly() || upload || !chosen) return;
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
  const stopDOM = [
    listenToUI(form, 'pointerdown', capture, true),
    listenToUI(form, 'focusin', capture, true),
    listenToUI(form, 'keydown', keyboard),
    listenToUI(insert, 'click', insertImage),
    listenToUI(update, 'click', updateImage),
    listenToUI(remove, 'click', removeImage),
    listenToUI(cancel, 'click', cancelUpload),
    listenToUI(file, 'change', uploadFile),
  ];
  cleanups.push(...stopDOM);
  cleanups.push(editor.onSelectionChange(refresh));
  // Inspect synchronously before an application moves focus into a field.
  cleanups.push(listenToUI(editor.surface, 'click', refresh));
  cleanups.push(editor.subscribe((change) => {
    if (change.source === 'api') {
      apiRevision++;
      composing = false;
      editTarget = undefined;
      selected = false;
      signature = '';
      setStatus(undefined);
    }
    refresh();
  }));
  cleanups.push(editor.events.on('localechange', renderLocale));
  cleanups.push(editor.events.on('readonlychange', (readOnly) => {
    composing = false;
    if (readOnly) upload?.abort();
    updateControls();
  }));
  const compositionStart = () => { composing = true; updateControls(); };
  const compositionEnd = () => { composing = false; updateControls(); };
  if (mode === 'edit') {
    const stopComposition = [
      listenToUI(editor.surface, 'compositionstart', compositionStart),
      listenToUI(editor.surface, 'compositionend', compositionEnd),
    ];
    cleanups.push(...stopComposition);
  }
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    editTarget = undefined;
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
