import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { imageCommands } from '../../images/index.js';
import type { ImageUploadProgress } from '../../images/types.js';
import { createFormInput, createUIButton, createUIElement } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import type { FormSelection } from '../shared/types.js';
import { imageFormMessages } from './messages.js';
import type { ImageUploadRetry, ImageUploadUIController, ImageUploadUIOptions } from './internal-types.js';
import type { ImageFormMessageKey } from './types.js';

export const createImageUploadUI = (
  document: Document, editor: Editor, selection: FormSelection, options: ImageUploadUIOptions,
): ImageUploadUIController => {
  const api = imageCommands(editor);
  const element = createUIElement(document, 'div', 'mw-image-upload');
  const { label, caption, input } = createFormInput(document, 'file');
  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif';
  const actions = createUIElement(document, 'div', 'mw-form-actions');
  const cancel = createUIButton(document);
  const retry = createUIButton(document);
  retry.dataset.mwImageRetry = '';
  const progress = createUIElement(document, 'progress');
  progress.max = 100;
  const progressText = createUIElement(document, 'span', 'mw-image-upload-progress-text');
  actions.append(cancel, retry);
  element.append(label, progress, progressText, actions);

  let disposed = false;
  let composing = false;
  let revision = 0;
  let authority = 0;
  let upload: AbortController | undefined;
  let failed: ImageUploadRetry | undefined;
  let currentProgress: Readonly<ImageUploadProgress> | undefined;
  const cleanups: (() => void)[] = [];
  const text = (key: ImageFormMessageKey) => localize(editor.getLocale(), key, imageFormMessages);
  const validRange = (range: Range) => editor.surface.isConnected
    && editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer);
  const eligible = () => !disposed && !editor.isReadOnly() && !composing;
  const render = () => {
    if (disposed) return;
    caption.textContent = text('ui.images.uploadFile');
    cancel.textContent = text('ui.images.cancelUpload');
    retry.textContent = text('ui.images.retryUpload');
    progress.setAttribute('aria-label', text('ui.images.uploadProgress'));
    const busy = Boolean(upload);
    input.disabled = !eligible() || busy;
    cancel.disabled = !busy && !failed;
    retry.hidden = !failed;
    retry.disabled = !eligible() || busy || !failed;
    progress.hidden = !busy;
    progressText.hidden = !busy;
    if (currentProgress?.total !== undefined) {
      const percent = Math.max(0, Math.min(100, Math.floor(currentProgress.loaded / currentProgress.total * 100)));
      progress.value = percent;
      progressText.textContent = `${percent}%`;
    }
    else {
      progress.removeAttribute('value');
      progressText.textContent = text('ui.images.uploading');
    }
  };
  const changed = () => {
    render();
    options.onChange();
  };
  const clearRetry = () => {
    failed = undefined;
    input.value = '';
  };
  const cancelUpload = () => {
    authority++;
    const owned = upload;
    upload = undefined;
    currentProgress = undefined;
    clearRetry();
    owned?.abort();
    if (!disposed) {
      options.setStatus('ui.images.cancelled');
      changed();
    }
  };
  const start = (candidate: ImageUploadRetry) => {
    if (!eligible() || upload || revision !== candidate.revision || !validRange(candidate.range)) return;
    const owned = new AbortController();
    const attemptAuthority = authority;
    upload = owned;
    failed = undefined;
    currentProgress = undefined;
    options.setStatus('ui.images.uploading');
    changed();
    void api.upload(candidate.file, {
      signal: owned.signal,
      onProgress: (value) => {
        if (!eligible() || upload !== owned || owned.signal.aborted || authority !== attemptAuthority || revision !== candidate.revision) return;
        currentProgress = value;
        render();
      },
    }).then((inserted) => {
      if (disposed || upload !== owned) return;
      clearRetry();
      options.setStatus(inserted ? 'ui.images.uploaded' : 'ui.images.cancelled');
    }).catch((error: unknown) => {
      if (disposed || upload !== owned) return;
      if (eligible() && !owned.signal.aborted && authority === attemptAuthority && revision === candidate.revision && validRange(candidate.range)) failed = candidate;
      options.report(error, true);
    }).finally(() => {
      if (upload !== owned) return;
      upload = undefined;
      currentProgress = undefined;
      if (disposed) return;
      changed();
      options.refresh();
    });
  };
  const chooseFile = () => {
    if (!eligible() || upload) {
      // A synthetic change on a disabled picker cannot replace a live attempt.
      input.value = '';
      return;
    }
    const chosen = input.files?.[0];
    authority++;
    clearRetry();
    if (!chosen) {
      changed();
      return;
    }
    const initialRevision = revision;
    if (!selection.restore(() => eligible() && revision === initialRevision)) {
      options.setStatus('ui.images.selection', true);
      changed();
      return;
    }
    const range = selection.peek();
    if (!range || !validRange(range)) return;
    start({ file: chosen, range: range.cloneRange(), revision });
  };
  const retryUpload = () => {
    const candidate = failed;
    if (!candidate || !eligible() || upload || revision !== candidate.revision || !validRange(candidate.range)) return;
    // Retry retains its original insertion range despite selection-only movement.
    const range = candidate.range.cloneRange();
    editor.focus();
    if (failed !== candidate || !eligible() || revision !== candidate.revision || !validRange(range)) return;
    const native = document.getSelection();
    if (!native) return;
    native.removeAllRanges();
    native.addRange(range);
    selection.capture();
    start(candidate);
  };
  cleanups.push(
    listenToUI(input, 'change', chooseFile),
    listenToUI(cancel, 'click', cancelUpload),
    listenToUI(retry, 'click', retryUpload),
    editor.subscribe((change) => {
      revision++;
      authority++;
      clearRetry();
      if (change.source === 'api') composing = false;
      render();
    }),
    editor.events.on('localechange', render),
    editor.events.on('readonlychange', (readOnly) => {
      composing = false;
      if (readOnly) cancelUpload();
      else render();
    }),
    listenToUI(editor.surface, 'compositionstart', () => {
      if (editor.isReadOnly()) return;
      composing = true;
      cancelUpload();
    }),
    listenToUI(editor.surface, 'compositionend', () => {
      composing = false;
      render();
    }),
  );
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    authority++;
    clearRetry();
    const owned = upload;
    upload = undefined;
    currentProgress = undefined;
    owned?.abort();
    for (const cleanup of cleanups) cleanup();
    element.remove();
  };
  cleanups.push(editor.events.on('destroy', destroy));
  render();
  return { element, isUploading: () => Boolean(upload), render, destroy };
};
