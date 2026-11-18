import type { Editor } from '@morfira-dev/wysiwyg-core';
import { imageAspectRatio, imageSizeSignature, proportionalDimensions } from '../../images/resize.js';
import { contextualAnchor, contextualViewport } from '../contextual/geometry.js';
import type { ContextualImageTarget } from '../contextual-image/internal-types.js';
import type { ImageResizeGeometry, ImageResizeGesture } from './internal-types.js';

export const boundedResizeWidth = (width: number, ratio: number): number => {
  const minimum = Math.max(1, Math.ceil(ratio * .5));
  const maximum = Math.min(1000, Math.ceil(ratio * 1000.5) - 1);
  if (minimum > maximum) throw new RangeError('No bounded proportional image size is available.');
  return Math.max(minimum, Math.min(maximum, Math.round(width)));
};

export const imageResizeGeometry = (editor: Editor, target: ContextualImageTarget): ImageResizeGeometry | undefined => {
  const { image } = target;
  const ratio = imageAspectRatio(image);
  if (!ratio) return;
  const view = image.ownerDocument.defaultView!;
  for (let node: HTMLElement | null = image; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.transform !== 'none' || (style.scale && style.scale !== 'none') || (style.rotate && style.rotate !== 'none')
      || (style.translate && style.translate !== 'none') || style.perspective !== 'none') return;
  }
  const rect = image.getBoundingClientRect();
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0
    || Math.abs(rect.width / rect.height - ratio) > ratio * .02 + 1 / rect.height) return;
  if (!contextualAnchor(editor.surface, target.range)) return;
  const clip = { ...contextualViewport(image.ownerDocument) };
  for (let node: HTMLElement | null = image.parentElement; node; node = node.parentElement) {
    if (node === image.ownerDocument.documentElement || node === image.ownerDocument.scrollingElement) continue;
    const style = view.getComputedStyle(node);
    const box = node.getBoundingClientRect();
    if (node === editor.surface || /^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
      clip.left = Math.max(clip.left, box.left + node.clientLeft);
      clip.right = Math.min(clip.right, box.left + node.clientLeft + node.clientWidth);
    }
    if (node === editor.surface || /^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
      clip.top = Math.max(clip.top, box.top + node.clientTop);
      clip.bottom = Math.min(clip.bottom, box.top + node.clientTop + node.clientHeight);
    }
  }
  const stored = Number(image.getAttribute('width'));
  const base = Number.isInteger(stored) && stored > 0 && stored <= 1000 ? stored : Math.round(rect.width);
  try {
    const width = boundedResizeWidth(base, ratio);
    const dimensions = proportionalDimensions({ width }, ratio);
    return { target, rect, clip, ratio, ...dimensions, signature: imageSizeSignature(image) };
  }
  catch { return; }
};

export const resizePointerDraft = (gesture: ImageResizeGesture, x: number, y: number): void => {
  const { rect, ratio } = gesture.geometry;
  const dx = (gesture.corner.endsWith('w') ? -1 : 1) * (x - gesture.x);
  const dy = (gesture.corner.startsWith('n') ? -1 : 1) * (y - gesture.y);
  const factor = 1 + (dx * rect.width + dy * rect.height) / (rect.width * rect.width + rect.height * rect.height);
  const width = boundedResizeWidth(gesture.geometry.width * factor, ratio);
  Object.assign(gesture, proportionalDimensions({ width }, ratio));
};
