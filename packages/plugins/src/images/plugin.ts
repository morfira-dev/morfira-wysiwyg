import type { ImageValue, ImagePatch, ImageOptions, ImageCommands } from './types.js';
import { imageAspectRatio, imageSizeSignature, ordinaryResizableImage, proportionalDimensions } from './resize.js';

import { sanitizeHTML } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin, SelectionBookmark } from '@morfira-dev/wysiwyg-core';
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const checked = (input: ImageValue): ImageValue => {
  if (!input || typeof input !== 'object' || typeof input.src !== 'string')
    throw new TypeError('Image src must be a URL.');
  for (const key of ['alt', 'caption'] as const)
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key]!.length > (key === 'caption' ? 5000 : 20000)))
      throw new TypeError(`Invalid image ${key}.`);
  for (const key of ['width', 'height'] as const)
    if (input[key] !== undefined && (!Number.isInteger(input[key]) || input[key]! < 1 || input[key]! > 1000))
      throw new RangeError('Image dimensions must be integers from 1 to 1000.');
  const template = document.createElement('template');
  template.innerHTML = sanitizeHTML(`<img src="${escape(input.src)}">`);
  const src = template.content.querySelector('img')?.getAttribute('src');
  if (!src)
    throw new TypeError('Unsupported or unsafe image URL.');
  return { ...input, src };
};
const nativeRange = (editor: Editor): Range | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (!selection?.rangeCount)
    return;
  const range = selection.getRangeAt(0);
  if (editor.surface.contains(range.startContainer) && editor.surface.contains(range.endContainer))
    return range.cloneRange();
};
const parentElement = (node: Node) => node.nodeType === 1 ? node as Element : node.parentElement;
const insertionRange = (editor: Editor): Range => {
  editor.focus();
  const range = nativeRange(editor)!;
  if (parentElement(range.startContainer)?.closest('figcaption'))
    throw new RangeError('Insert an image within one block, outside captions.');
  const image = selectedImage(editor);
  const figure = image && imageFigure(image);
  if (figure)
    range.selectNode(figure);
  const blockNodes = range.cloneContents().querySelectorAll('p,h1,h2,h3,h4,h5,h6,pre,blockquote,ul,ol,li,td,th,table,figure,figcaption');
  if ((!figure && blockNodes.length) || parentElement(range.startContainer)?.closest('figure'))
    throw new RangeError('Insert an image within one block, outside captions.');
  const container = (node: Node) => parentElement(node)?.closest('p,h1,h2,h3,h4,h5,h6,pre,blockquote,li,td,th,figcaption') ?? editor.surface;
  if (container(range.startContainer) !== container(range.endContainer) || parentElement(range.startContainer)?.closest('figcaption'))
    throw new RangeError('Insert an image within one block, outside captions.');
  return range;
};
const selectedImage = (editor: Editor): HTMLImageElement | undefined => {
  const range = nativeRange(editor);
  if (!range)
    return;
  const start = parentElement(range.startContainer);
  const caption = start?.closest('figcaption');
  if (range.collapsed && caption && editor.surface.contains(caption) && caption.parentElement?.querySelectorAll('img').length === 1)
    return caption.parentElement?.querySelector('img') ?? undefined;
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === 1 && range.endOffset === range.startOffset + 1) {
    const node = range.startContainer.childNodes[range.startOffset];
    if (node instanceof HTMLImageElement)
      return node;
    if (node instanceof HTMLElement && node.localName === 'figure' && node.querySelectorAll('img').length === 1)
      return node.querySelector('img')!;
  }
};
const imageFigure = (image: HTMLImageElement): HTMLElement | undefined => {
  const figure = image.parentElement;
  return figure?.localName === 'figure' && figure.querySelectorAll('img').length === 1 && [...figure.children].every((child) => child === image || child.localName === 'figcaption') && [...figure.childNodes].every((child) => child.nodeType === 1 || !child.textContent?.trim()) ? figure : undefined;
};
const readImage = (image: HTMLImageElement): ImageValue => ({
  src: image.getAttribute('src')!, alt: image.getAttribute('alt') ?? '',
  ...(image.hasAttribute('width') ? { width: Number(image.getAttribute('width')) } : {}),
  ...(image.hasAttribute('height') ? { height: Number(image.getAttribute('height')) } : {}),
  caption: imageFigure(image)?.querySelector('figcaption')?.textContent ?? '',
});
const selectNode = (editor: Editor, image: HTMLImageElement) => {
  const range = document.createRange();
  range.selectNode(image);
  editor.surface.focus({ preventScroll: true });
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};
const writeImage = (image: HTMLImageElement, value: ImageValue) => {
  if (image.getAttribute('src') !== value.src) image.setAttribute('src', value.src);
  image.setAttribute('alt', value.alt ?? '');
  for (const key of ['width', 'height'] as const) {
    if (value[key] === undefined) {
      if (image.hasAttribute(key))
        image.style.removeProperty(key);
      image.removeAttribute(key);
    }
    else {
      image.setAttribute(key, String(value[key]));
      image.style.setProperty(key, `${value[key]}px`);
    }
  }
  if (!image.style.cssText)
    image.removeAttribute('style');
};
const figureFor = (image: HTMLImageElement, caption?: string) => {
  const figure = document.createElement('figure');
  figure.append(image);
  if (caption) {
    const label = document.createElement('figcaption');
    label.textContent = caption;
    figure.append(label);
  }
  return figure;
};
const insertFigure = (editor: Editor, range: Range, figure: HTMLElement) => {
  range.deleteContents();
  const block = parentElement(range.startContainer)?.closest('p,h1,h2,h3,h4,h5,h6,pre,blockquote');
  let next: HTMLElement;
  if (block && editor.surface.contains(block)) {
    const tailRange = document.createRange();
    tailRange.selectNodeContents(block);
    tailRange.setStart(range.startContainer, range.startOffset);
    const tail = block.cloneNode(false) as HTMLElement;
    tail.append(tailRange.extractContents());
    block.after(figure, tail);
    next = tail;
    if (!block.textContent && !block.querySelector('img'))
      block.remove();
  }
  else {
    range.insertNode(figure);
    next = document.createElement('p');
    figure.after(next);
  }
  if (!next.childNodes.length)
    next.append(document.createElement('br'));
  const caret = document.createRange();
  caret.selectNodeContents(next);
  caret.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
};
// Keep upload bookmarks independent of public text offsets (images have zero text length).
const saveRange = (root: HTMLElement, range: Range): SelectionBookmark => {
  const path = (target: Node) => {
    const result: number[] = []; for (let node = target; node !== root && node.parentNode; node = node.parentNode)
      result.unshift([...node.parentNode.childNodes].indexOf(node as ChildNode)); return result;
  };
  return { start: path(range.startContainer), startOffset: range.startOffset, end: path(range.endContainer), endOffset: range.endOffset, backward: false };
};
const restoreRange = (root: HTMLElement, saved: SelectionBookmark) => {
  const resolve = (path: number[]) => path.reduce<Node>((node, index) => node.childNodes[index], root);
  const range = document.createRange();
  range.setStart(resolve(saved.start), saved.startOffset);
  range.setEnd(resolve(saved.end), saved.endOffset);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};
export const images = (options: ImageOptions = {}): EditorPlugin => {
  const maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024;
  if (!Number.isInteger(maxFileSize) || maxFileSize < 1)
    throw new RangeError('maxFileSize must be a positive integer.');
  return {
    name: 'images', setup: (editor) => {
      let disposed = false;
      let composing = false;
      let revision = 0;
      let pending: AbortController | undefined;
      const active = () => {
        if (disposed)
          throw new Error('Images plugin has been disposed.');
      };
      const cancel = () => { const controller = pending; pending = undefined; controller?.abort(); };
      const api: ImageCommands = {
        insert: (input) => {
          active(); if (editor.isReadOnly())
            return; const value = checked(input); const range = insertionRange(editor); editor.transact(() => { const image = document.createElement('img'); writeImage(image, value); insertFigure(editor, range, figureFor(image, value.caption)); });
        },
        select: (image) => {
          active(); if (!(image instanceof HTMLImageElement) || !editor.surface.contains(image))
            throw new TypeError('Select an image belonging to this editor.'); selectNode(editor, image);
        },
        getSelected: () => { active(); const image = selectedImage(editor); return image ? readImage(image) : undefined; },
        update: (patch) => {
          active();
          if (editor.isReadOnly())
            return;
          const image = selectedImage(editor);
          if (!image)
            throw new Error('Select one image first.');
          if (!patch || typeof patch !== 'object')
            throw new TypeError('Expected image metadata.');
          const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
          const merged: ImagePatch & {
            src: string;
          } = { ...readImage(image), ...defined };
          if (merged.width === null)
            delete merged.width;
          if (merged.height === null)
            delete merged.height;
          const value = checked(merged as ImageValue);
          if (value.caption && image.closest('figure') && !imageFigure(image))
            throw new RangeError('Caption updates require a single-image figure.');
          editor.transact(() => {
            for (const key of ['width', 'height'] as const)
              if (patch[key] === null)
                image.style.removeProperty(key);
            writeImage(image, value);
            const figure = imageFigure(image);
            if (figure) {
              const caption = figure.querySelector('figcaption');
              if (patch.caption !== undefined) {
                caption?.remove();
                if (value.caption) {
                  const label = document.createElement('figcaption');
                  label.textContent = value.caption;
                  figure.append(label);
                }
              }
            }
            else if (value.caption) {
              const range = document.createRange();
              range.selectNode(image);
              const placeholder = document.createComment('image');
              image.replaceWith(placeholder);
              range.selectNode(placeholder);
              insertFigure(editor, range, figureFor(image, value.caption));
            }
            selectNode(editor, image);
          });
        },
        resize: (size) => {
          active();
          if (editor.isReadOnly() || composing) return;
          const image = selectedImage(editor);
          if (!image || !ordinaryResizableImage(editor.surface, image)) throw new RangeError('Select one ordinary image to resize.');
          const dimensions = proportionalDimensions(size, imageAspectRatio(image));
          const before = readImage(image);
          if (before.width === dimensions.width && before.height === dimensions.height) return;
          const previousRevision = revision;
          const signature = imageSizeSignature(image);
          editor.surface.focus({ preventScroll: true });
          active();
          if (editor.isReadOnly() || composing) return;
          if (previousRevision !== revision || selectedImage(editor) !== image || !ordinaryResizableImage(editor.surface, image)
            || imageSizeSignature(image) !== signature) throw new RangeError('Image selection changed before resizing.');
          // One update keeps the actual IMG and rich caption in one history entry.
          api.update(dimensions);
        },
        remove: () => {
          active(); if (editor.isReadOnly())
            return; const image = selectedImage(editor); if (!image)
            throw new Error('Select one image first.'); editor.transact(() => { const target = imageFigure(image) ?? image; const range = document.createRange(); range.setStartBefore(target); range.collapse(true); target.remove(); const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); });
        },
        cancelUpload: cancel,
        isUploading: () => { active(); return Boolean(pending); },
        upload: async (file, request = {}) => {
          active();
          if (!request || typeof request !== 'object')
            throw new TypeError('Upload options must be an object.');
          const signal = request.signal;
          if (signal && (typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'))
            throw new TypeError('Upload signal must be an AbortSignal.');
          if (editor.isReadOnly() || composing || signal?.aborted)
            return false;
          if (!options.upload)
            throw new Error('Configure an application upload callback first.');
          if (!(file instanceof File) || !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(file.type) || file.size < 1 || file.size > maxFileSize)
            throw new TypeError('Choose a supported raster image within the configured file-size limit.');
          const saved = saveRange(editor.surface, insertionRange(editor));
          cancel();
          const controller = new AbortController();
          pending = controller;
          const abortOwned = () => {
            if (pending === controller)
              pending = undefined;
            controller.abort();
          };
          signal?.addEventListener('abort', abortOwned, { once: true });
          let abort: () => void = () => { };
          const cancelled = new Promise<undefined>((resolve) => { abort = () => resolve(undefined); controller.signal.addEventListener('abort', abort, { once: true }); });
          try {
            const result = await Promise.race([Promise.resolve().then(() => controller.signal.aborted ? undefined : options.upload!(file, { signal: controller.signal })), cancelled]);
            if (pending !== controller || disposed || controller.signal.aborted || editor.isReadOnly() || composing)
              return false;
            if (!result)
              throw new TypeError('Upload callback must return image metadata.');
            const value = checked(result);
            pending = undefined;
            restoreRange(editor.surface, saved);
            api.insert(value);
            return true;
          }
          catch (error) {
            if (controller.signal.aborted || disposed)
              return false;
            throw error;
          }
          finally {
            signal?.removeEventListener('abort', abortOwned);
            controller.signal.removeEventListener('abort', abort);
            if (pending === controller)
              pending = undefined;
          }
        },
      };
      const unprovide = editor.providePlugin('images', api);
      const click = (event: MouseEvent) => {
        if (event.target instanceof HTMLImageElement && editor.surface.contains(event.target)) {
          event.preventDefault();
          api.select(event.target);
        }
      };
      const compositionStart = () => {
        if (editor.isReadOnly()) return;
        composing = true;
        cancel();
      };
      const compositionEnd = () => { composing = false; };
      editor.surface.addEventListener('compositionstart', compositionStart);
      editor.surface.addEventListener('compositionend', compositionEnd);
      editor.surface.addEventListener('click', click);
      const unsubscribe = editor.subscribe((change) => {
        revision++;
        if (change.source === 'api') composing = false;
        cancel();
      });
      const unreadonly = editor.events.on('readonlychange', (readOnly) => {
        if (readOnly) {
          composing = false;
          cancel();
        }
      });
      return () => {
        disposed = true;
        cancel();
        unsubscribe();
        unreadonly();
        unprovide();
        editor.surface.removeEventListener('compositionstart', compositionStart);
        editor.surface.removeEventListener('compositionend', compositionEnd);
        editor.surface.removeEventListener('click', click);
      };
    }
  };
};
export const imageCommands = (editor: Editor): ImageCommands => {
  const api = editor.getPlugin<ImageCommands>('images');
  if (!api)
    throw new Error('Install the images plugin first.');
  return api;
};
