import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { imageAspectRatio, imageSizeSignature, ordinaryResizableImage, proportionalDimensions } from '../../images/resize.js';
import { createFormInput } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import { imageFormMessages } from './messages.js';
import type { ImageFormField, ImageFormValues } from './types.js';
import type { ImageSizeLockController } from './internal-types.js';

export const createImageSizeLock = (
  editor: Editor, fieldset: HTMLFieldSetElement, inputs: Record<ImageFormField, HTMLInputElement>,
  initial: boolean, report: (error: unknown) => void,
): ImageSizeLockController => {
  const { label, caption, input } = createFormInput(fieldset.ownerDocument, 'checkbox', true);
  fieldset.append(label);
  let preference = initial;
  let target: HTMLImageElement | undefined;
  let ratio: number | undefined;
  let signature = '';
  let source = '';
  let width = '';
  let height = '';
  let axis: 'width' | 'height' = 'width';
  let blocked = false;
  let invalidated = false;
  let disposed = false;
  const render = () => {
    caption.textContent = localize(editor.getLocale(), 'ui.images.keepAspectRatio', imageFormMessages);
    input.checked = preference && ratio !== undefined;
    input.disabled = blocked || !target || ratio === undefined;
  };
  const reset = () => {
    invalidated = invalidated || input.checked;
    target = undefined;
    ratio = undefined;
    signature = '';
    render();
  };
  const inspect = (image: HTMLImageElement | undefined, allowRefresh: boolean) => {
    if (disposed) return;
    if (!image || !ordinaryResizableImage(editor.surface, image)) { reset(); return; }
    if (image === target && imageSizeSignature(image) === signature) { render(); return; }
    const newlyLoaded = image === target && ratio === undefined && inputs.src.value === source && inputs.width.value === width && inputs.height.value === height;
    if (!allowRefresh && !newlyLoaded) {
      if (image !== target || imageSizeSignature(image) !== signature) reset();
      return;
    }
    target = image;
    invalidated = false;
    ratio = imageAspectRatio(image);
    signature = imageSizeSignature(image);
    source = image.getAttribute('src') ?? '';
    width = image.getAttribute('width') ?? '';
    height = image.getAttribute('height') ?? '';
    axis = 'width';
    render();
  };
  const changed = () => {
    if (disposed || input.disabled) { render(); return; }
    preference = input.checked;
  };
  const draftInput = (event: Event) => {
    if (disposed || blocked || !input.checked || (event instanceof InputEvent && event.isComposing)) return;
    if (event.target !== inputs.width && event.target !== inputs.height) return;
    axis = event.target === inputs.width ? 'width' : 'height';
    try {
      if (!target || inputs.src.value !== source || imageSizeSignature(target) !== signature) throw new RangeError('Image proportions no longer belong to this draft.');
      const requested = Number(inputs[axis].value);
      const dimensions = proportionalDimensions(axis === 'width' ? { width: requested } : { height: requested }, ratio);
      const other = axis === 'width' ? 'height' : 'width';
      inputs[other].value = String(dimensions[other]);
    }
    catch (error) { report(error); }
  };
  const validate = (image: HTMLImageElement | undefined, draft: ImageFormValues) => {
    if (invalidated) throw new RangeError('Select an image again before applying the locked draft.');
    if (!input.checked) return;
    if (!target || image !== target || !ordinaryResizableImage(editor.surface, target) || imageSizeSignature(target) !== signature
      || draft.src !== source || ratio === undefined) throw new RangeError('Select an unchanged image with known proportions.');
    if (draft.width === width && draft.height === height) return;
    const selectedAxis = axis === 'width' && draft.width === width && draft.height !== height ? 'height' : axis;
    const requested = Number(draft[selectedAxis]);
    const dimensions = proportionalDimensions(selectedAxis === 'width' ? { width: requested } : { height: requested }, ratio);
    if (Number(draft.width) !== dimensions.width || Number(draft.height) !== dimensions.height)
      throw new RangeError('Image dimension drafts must preserve the locked proportions.');
  };
  const stops = [listenToUI(input, 'change', changed), listenToUI(fieldset, 'input', draftInput)];
  render();
  return {
    inspect, validate, reset,
    isLocked: () => input.checked || invalidated,
    render: (disabled) => { if (disposed) return; blocked = disabled; render(); },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      for (const stop of stops) stop();
      label.remove();
    },
  };
};
