import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg-core';
import { imageCommands } from '../../images/index.js';
import { imageSizeSignature, ordinaryResizableImage, proportionalDimensions } from '../../images/resize.js';
import { createFormSelection } from '../shared/selection.js';
import { contextualImageTarget, nativeContextualImage } from '../contextual-image/target.js';
import { imageResizeGeometry, boundedResizeWidth, resizePointerDraft } from './geometry.js';
import { imageResizeUIMessages } from './messages.js';
import type { ImageResizeUIOptions, ImageResizeUIController, ImageResizeUIMessageKey } from './types.js';
import type { ImageResizeCorner, ImageResizeGeometry, ImageResizeGesture, ImageResizeKeyboardSession } from './internal-types.js';

export { imageResizeUIMessages } from './messages.js';
export type { ImageResizeUIOptions, ImageResizeUIController, ImageResizeUIMessageKey } from './types.js';

export const createImageResizeUI = (host: HTMLElement, editor: Editor, options: ImageResizeUIOptions = {}): ImageResizeUIController => {
  editor.getLocale();
  const api = imageCommands(editor);
  const surface = editor.surface;
  const document = surface.ownerDocument;
  const view = document.defaultView!;
  if (host.ownerDocument !== document || !host.isConnected || host.childNodes.length || surface.contains(host) || host.contains(editor.element)
    || host.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Image resize needs an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options) || Reflect.ownKeys(options).some((key) => key !== 'label' && key !== 'onError')
    || (options.label !== undefined && typeof options.label !== 'string') || (options.onError !== undefined && typeof options.onError !== 'function'))
    throw new TypeError('Expected image resize options.');
  const label = options.label;
  const onError = options.onError;
  const element = document.createElement('section');
  element.className = 'mw-image-resize';
  element.setAttribute('role', 'group');
  element.hidden = true;
  const outline = document.createElement('div');
  outline.className = 'mw-image-resize-frame';
  outline.setAttribute('aria-hidden', 'true');
  const status = document.createElement('span');
  status.className = 'mw-image-resize-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const corners: readonly ImageResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
  const handles = corners.map((corner) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mwResizeCorner = corner;
    button.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown Escape');
    return button;
  });
  element.append(outline, ...handles, status);
  const selection = createFormSelection(editor);
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let suspended = false;
  let composing = false;
  let revision = 0;
  let restoring = 0;
  let applying = false;
  let frame = 0;
  let current: ImageResizeGeometry | undefined;
  let suppressed: HTMLImageElement | undefined;
  let gesture: ImageResizeGesture | undefined;
  let keyboardSession: ImageResizeKeyboardSession | undefined;
  let observer: ResizeObserver | undefined;
  let observed: HTMLImageElement | undefined;
  let gestureStops: (() => void)[] = [];
  const message = (key: ImageResizeUIMessageKey) => localize(editor.getLocale(), key, imageResizeUIMessages);
  const report = (error: unknown) => {
    try { onError?.(error); }
    catch { /* Diagnostics cannot prevent gesture cleanup. */ }
  };
  const renderLocale = () => {
    element.setAttribute('aria-label', label ?? message('ui.imageResize.label'));
    element.title = message('ui.imageResize.help');
    for (const [index, corner] of corners.entries()) {
      handles[index].setAttribute('aria-label', message(`ui.imageResize.${corner}`));
      handles[index].title = message('ui.imageResize.help');
    }
  };
  const stopFrame = () => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
  };
  const releaseGesture = (): ImageResizeGesture | undefined => {
    const previous = gesture;
    gesture = undefined;
    stopFrame();
    for (const stop of gestureStops.splice(0)) {
      try { stop(); }
      catch (error) { report(error); }
    }
    if (previous) {
      try { if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId); }
      catch { /* A detached capture target has already lost capture. */ }
    }
    delete element.dataset.dragging;
    return previous;
  };
  const hide = () => {
    releaseGesture();
    element.hidden = true;
    current = undefined;
    keyboardSession = undefined;
    try { observer?.disconnect(); }
    catch (error) { report(error); }
    observed = undefined;
  };
  const ownedFocus = () => document.activeElement === surface || surface.contains(document.activeElement) || element.contains(document.activeElement);
  const observedTarget = () => {
    const target = nativeContextualImage(editor);
    if (target || !current || !element.contains(document.activeElement)) return target;
    const native = document.getSelection();
    const range = native?.rangeCount ? native.getRangeAt(0) : undefined;
    if (range && (surface.contains(range.startContainer) || surface.contains(range.endContainer))) return;
    return contextualImageTarget(editor, current.target.range);
  };
  const valid = (geometry: ImageResizeGeometry, version: number): boolean => !disposed && !composing && !editor.isReadOnly() && revision === version
    && ordinaryResizableImage(surface, geometry.target.image) && imageSizeSignature(geometry.target.image) === geometry.signature
    && contextualImageTarget(editor, geometry.target.range)?.image === geometry.target.image;
  const draw = (geometry: ImageResizeGeometry, width: number, height: number, active?: ImageResizeGesture) => {
    const { rect, clip } = geometry;
    const renderedWidth = rect.width * width / geometry.width;
    const renderedHeight = rect.height * height / geometry.height;
    const left = active?.corner.endsWith('w') ? rect.right - renderedWidth : rect.left;
    const top = active?.corner.startsWith('n') ? rect.bottom - renderedHeight : rect.top;
    const right = left + renderedWidth;
    const bottom = top + renderedHeight;
    outline.style.left = `${left}px`;
    outline.style.top = `${top}px`;
    outline.style.width = `${renderedWidth}px`;
    outline.style.height = `${renderedHeight}px`;
    outline.style.clipPath = `inset(${Math.max(0, clip.top - top)}px ${Math.max(0, right - clip.right)}px ${Math.max(0, bottom - clip.bottom)}px ${Math.max(0, clip.left - left)}px)`;
    for (const [index, corner] of corners.entries()) {
      const x = corner.endsWith('w') ? left : right;
      const y = corner.startsWith('n') ? top : bottom;
      const handle = handles[index];
      handle.style.left = `${x}px`;
      handle.style.top = `${y}px`;
      const clipped = x < clip.left - .5 || x > clip.right + .5 || y < clip.top - .5 || y > clip.bottom + .5;
      const captured = active?.handle === handle;
      handle.hidden = clipped && !captured;
      // Capture must survive clipping, while its control must not paint outside the owner.
      handle.style.visibility = clipped && captured ? 'hidden' : '';
    }
    status.textContent = `${width} × ${height}`;
    status.style.left = `${Math.max(clip.left, Math.min(left, clip.right - 100))}px`;
    status.style.top = `${Math.max(clip.top, Math.min(bottom + 4, clip.bottom - 24))}px`;
    element.hidden = handles.every((handle) => handle.hidden);
  };
  const refresh = () => {
    if (disposed) throw new Error('Image resize UI has been destroyed.');
    if (restoring) return;
    renderLocale();
    if (gesture) {
      if (!valid(gesture.geometry, gesture.revision)) { hide(); return; }
      draw(gesture.geometry, gesture.width, gesture.height, gesture);
      return;
    }
    if (suspended || composing || editor.isReadOnly() || !ownedFocus()) { hide(); return; }
    const target = observedTarget();
    if (element.contains(document.activeElement) && current && target?.image !== current.target.image) { hide(); return; }
    if (!target || target.image === suppressed) { hide(); return; }
    const geometry = imageResizeGeometry(editor, target);
    if (!geometry) { hide(); return; }
    current = geometry;
    selection.capture();
    if (observed !== target.image) {
      observer?.disconnect();
      observed = target.image;
      observer?.observe(target.image);
      observer?.observe(surface);
    }
    draw(geometry, geometry.width, geometry.height);
  };
  const discover = () => {
    if (disposed || restoring) return;
    try { refresh(); }
    catch (error) { hide(); report(error); }
  };
  const schedule = () => {
    if (disposed || frame || (!current && !gesture)) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      discover();
    });
  };
  const cancel = () => { releaseGesture(); discover(); };
  const sameGeometry = (geometry: ImageResizeGeometry): boolean => {
    const box = geometry.target.image.getBoundingClientRect();
    const previous = geometry.rect;
    return Math.abs(box.left - previous.left) < .5 && Math.abs(box.top - previous.top) < .5
      && Math.abs(box.width - previous.width) < .5 && Math.abs(box.height - previous.height) < .5;
  };
  const commit = (geometry: ImageResizeGeometry, width: number, height: number, version: number): boolean => {
    if (width === geometry.width && height === geometry.height) return false;
    if (!valid(geometry, version) || !sameGeometry(geometry) || observedTarget()?.image !== geometry.target.image) return false;
    restoring++;
    try {
      if (!selection.restore(() => valid(geometry, version) && sameGeometry(geometry)
        && nativeContextualImage(editor)?.image === geometry.target.image, true) || !valid(geometry, version)
        || nativeContextualImage(editor)?.image !== geometry.target.image) return false;
      applying = true;
      api.update({ width, height });
      return true;
    }
    catch (error) { report(error); return false; }
    finally { applying = false; restoring--; if (!disposed) discover(); }
  };
  const move = (event: PointerEvent) => {
    const active = gesture;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) { cancel(); return; }
    if (event.cancelable) event.preventDefault();
    try { resizePointerDraft(active, event.clientX, event.clientY); schedule(); }
    catch (error) { cancel(); report(error); }
  };
  const up = (event: PointerEvent) => {
    const active = gesture;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) { cancel(); return; }
    try {
      resizePointerDraft(active, event.clientX, event.clientY);
      const unchanged = sameGeometry(active.geometry);
      releaseGesture();
      if (unchanged) commit(active.geometry, active.width, active.height, active.revision);
    }
    catch (error) { releaseGesture(); report(error); }
    discover();
  };
  const pointerCancelled = (event: PointerEvent) => { if (gesture?.pointerId === event.pointerId) cancel(); };
  const down = (event: PointerEvent) => {
    if (disposed || gesture || event.defaultPrevented || event.button !== 0 || !event.isPrimary || element.hidden || composing || editor.isReadOnly()) return;
    const handle = handles.find((button) => button === event.target);
    if (!handle || handle.hidden || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    discover();
    if (!current || element.hidden || !valid(current, revision)) return;
    event.preventDefault();
    event.stopPropagation();
    selection.capture();
    keyboardSession = undefined;
    const geometry = current;
    gesture = { geometry, pointerId: event.pointerId, handle, corner: corners[handles.indexOf(handle)],
      x: event.clientX, y: event.clientY, revision, width: geometry.width, height: geometry.height };
    element.dataset.dragging = 'true';
    try {
      handle.setPointerCapture(event.pointerId);
      for (const [type, callback] of [['pointermove', move], ['pointerup', up], ['pointercancel', pointerCancelled]] as const) {
        view.addEventListener(type, callback, true);
        gestureStops.push(() => view.removeEventListener(type, callback, true));
      }
      handle.addEventListener('lostpointercapture', pointerCancelled);
      gestureStops.push(() => handle.removeEventListener('lostpointercapture', pointerCancelled));
    }
    catch (error) { releaseGesture(); report(error); }
  };
  const keyboard = (event: KeyboardEvent) => {
    if (disposed || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
    const own = element.contains(event.target as Node);
    if (event.key === 'Escape' && !element.hidden && (own || surface.contains(event.target as Node))) {
      event.preventDefault();
      event.stopPropagation();
      const saved = current;
      suppressed = saved?.target.image;
      hide();
      if (saved && !disposed) {
        restoring++;
        try { selection.restore(() => !disposed && Boolean(contextualImageTarget(editor, saved.target.range))); }
        finally { restoring--; }
      }
      return;
    }
    if (!own || element.hidden) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || gesture) return;
    const handle = handles.find((button) => button === event.target);
    if (!handle || document.activeElement !== handle || handle.hidden || !current) return;
    event.preventDefault();
    event.stopPropagation();
    const geometry = current;
    const image = geometry.target.image;
    if (!keyboardSession || keyboardSession.image !== image || keyboardSession.signature !== geometry.signature)
      keyboardSession = { image, ratio: geometry.ratio, signature: geometry.signature };
    const ratio = keyboardSession.ratio;
    const delta = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
    const requested = event.key === 'ArrowUp' || event.key === 'ArrowDown' ? (geometry.height + delta) * ratio : geometry.width + delta;
    try {
      const dimensions = proportionalDimensions({ width: boundedResizeWidth(requested, ratio) }, ratio);
      const session = keyboardSession;
      if (commit(geometry, dimensions.width, dimensions.height, revision) && !disposed && session && surface.contains(image)) {
        session.signature = imageSizeSignature(image);
        keyboardSession = session;
        if (!element.hidden && !handle.hidden && current?.target.image === image) handle.focus({ preventScroll: true });
      }
    }
    catch (error) { report(error); }
  };
  const geometryChanged = () => { if (gesture) releaseGesture(); discover(); };
  const selectionChanged = () => {
    if (restoring || disposed) return;
    const image = observedTarget()?.image;
    if (gesture && image !== gesture.geometry.target.image) releaseGesture();
    if (current && image && image !== current.target.image) keyboardSession = undefined;
    discover();
  };
  const fresh = () => { suppressed = undefined; keyboardSession = undefined; discover(); };
  const focus = () => { if (!ownedFocus()) hide(); else discover(); };
  const blur = () => { suspended = true; hide(); };
  const windowFocused = () => { suspended = false; discover(); };
  const startComposition = () => {
    if (editor.isReadOnly()) return;
    composing = true;
    hide();
  };
  const endComposition = () => { composing = false; discover(); };
  const documentChanged = (change: EditorChange) => {
    revision++;
    if (change.source === 'api') composing = false;
    releaseGesture();
    if (!applying) keyboardSession = undefined;
    discover();
  };
  const readOnlyChanged = () => {
    composing = false;
    hide();
    discover();
  };
  const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node) && !surface.contains(event.target as Node)) hide(); };
  const listen = (target: EventTarget, type: string, callback: EventListener, capture = false) => {
    target.addEventListener(type, callback, capture);
    cleanups.push(() => target.removeEventListener(type, callback, capture));
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    hide();
    for (const stop of cleanups.splice(0).reverse()) {
      try { stop(); }
      catch (error) { report(error); }
    }
    try { selection.destroy(); }
    catch (error) { report(error); }
    element.remove();
  };
  try {
    if (typeof view.ResizeObserver === 'function') observer = new view.ResizeObserver(() => {
      if (gesture) {
        const box = gesture.geometry.target.image.getBoundingClientRect();
        const previous = gesture.geometry.rect;
        if (box.left !== previous.left || box.top !== previous.top || box.width !== previous.width || box.height !== previous.height) releaseGesture();
      }
      schedule();
    });
    listen(element, 'pointerdown', down as EventListener);
    listen(element, 'dragstart', ((event: Event) => event.preventDefault()));
    listen(document, 'keydown', keyboard as EventListener, true);
    listen(document, 'pointerdown', outside as EventListener, true);
    listen(document, 'focusin', focus, true);
    listen(document, 'scroll', geometryChanged, true);
    listen(view, 'resize', geometryChanged);
    listen(view, 'blur', blur);
    listen(view, 'focus', windowFocused);
    if (view.visualViewport) {
      listen(view.visualViewport, 'resize', geometryChanged);
      listen(view.visualViewport, 'scroll', geometryChanged);
    }
    listen(surface, 'click', fresh);
    listen(surface, 'load', discover, true);
    listen(surface, 'compositionstart', startComposition);
    listen(surface, 'compositionend', endComposition);
    cleanups.push(
      editor.onSelectionChange(selectionChanged),
      editor.subscribe(documentChanged),
      editor.events.on('readonlychange', readOnlyChanged),
      editor.events.on('localechange', discover),
      editor.events.on('destroy', destroy),
    );
    host.append(element);
    refresh();
  }
  catch (error) { destroy(); throw error; }
  return { element, refresh, destroy };
};
