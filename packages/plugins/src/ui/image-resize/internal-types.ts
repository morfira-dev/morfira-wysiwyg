import type { ContextualImageTarget } from '../contextual-image/internal-types.js';
import type { ContextualBounds } from '../contextual/internal-types.js';

export type ImageResizeCorner = 'nw' | 'ne' | 'sw' | 'se';
export interface ImageResizeGeometry {
  readonly target: ContextualImageTarget;
  readonly rect: DOMRect;
  readonly clip: ContextualBounds;
  readonly ratio: number;
  readonly width: number;
  readonly height: number;
  readonly signature: string;
}
export interface ImageResizeGesture {
  readonly geometry: ImageResizeGeometry;
  readonly pointerId: number;
  readonly handle: HTMLButtonElement;
  readonly corner: ImageResizeCorner;
  readonly x: number;
  readonly y: number;
  readonly revision: number;
  width: number;
  height: number;
}
export interface ImageResizeKeyboardSession {
  readonly image: HTMLImageElement;
  readonly ratio: number;
  signature: string;
}
