import type { Editor, EditorPositionHandle } from '@morfira-dev/wysiwyg-core';
import type { DecorationRange, DecorationsController, DecorationsOptions, DecorationsState } from '../types.js';
import type { HighlightPlatform } from '../internal-types.js';

/** Native highlight ranges use explicit transaction maps, not persisted wrappers. */
export const createDecorations = (editor: Editor, options: DecorationsOptions): DecorationsController => {
  const name = options.name;
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(name) || name.startsWith('morfira-'))
    throw new TypeError('A nonreserved lowercase CSS highlight name is required.');
  const root = editor.surface;
  const document = root.ownerDocument;
  const platform = document.defaultView as unknown as HighlightPlatform | null;
  const registry = platform?.CSS?.highlights;
  const Constructor = platform?.Highlight;
  let status: DecorationsState['status'] = typeof Constructor === 'function' && registry && typeof registry.get === 'function'
    && typeof registry.has === 'function' && typeof registry.set === 'function' && typeof registry.delete === 'function'
    && typeof Constructor.prototype.add === 'function' && typeof Constructor.prototype.clear === 'function' ? 'ready' : 'unsupported';
  if (status === 'ready' && registry!.has(name)) status = 'conflict';
  const highlight = status === 'ready' && Constructor ? new Constructor() : undefined;
  let tracked: { from: EditorPositionHandle; to: EditorPositionHandle }[] = [];
  let disposed = false;
  let painting = false;
  let count = 0;
  const cleanups: (() => void)[] = [];
  if (highlight) registry!.set(name, highlight);
  const owned = () => !disposed && status === 'ready' && registry!.get(name) === highlight;
  const clear = () => {
    for (const range of tracked) {
      editor.positions.release(range.from);
      editor.positions.release(range.to);
    }
    tracked = [];
    highlight?.clear();
    count = 0;
  };
  const point = (offset: number): { node: Node; offset: number } | undefined => {
    const walker = document.createTreeWalker(root, 4);
    let node: Node | null;
    let remaining = offset;
    let last: Text | undefined;
    while ((node = walker.nextNode())) {
      const text = node as Text;
      if (remaining <= text.length) return { node: text, offset: remaining };
      remaining -= text.length;
      last = text;
    }
    return remaining === 0 ? last ? { node: last, offset: last.length } : { node: root, offset: 0 } : undefined;
  };
  const refresh = () => {
    if (painting || disposed) return;
    if (!owned()) {
      if (status === 'ready') status = 'conflict';
      clear();
      return;
    }
    painting = true;
    try {
      highlight!.clear();
      count = 0;
      const retained: typeof tracked = [];
      for (const target of tracked) {
        const from = editor.positions.resolve(target.from);
        const to = editor.positions.resolve(target.to);
        const first = from && !from.deleted ? point(from.index) : undefined;
        const last = to && !to.deleted ? point(to.index) : undefined;
        if (!first || !last || !from || !to || from.index >= to.index) {
          editor.positions.release(target.from);
          editor.positions.release(target.to);
          continue;
        }
        const range = document.createRange();
        range.setStart(first.node, first.offset);
        range.setEnd(last.node, last.offset);
        highlight!.add(range);
        retained.push(target);
        count++;
      }
      tracked = retained;
    }
    finally { painting = false; }
  };
  const destroy = () => {
    if (disposed) return;
    clear();
    if (highlight && registry!.get(name) === highlight) registry!.delete(name);
    disposed = true;
    for (const stop of cleanups) stop();
  };
  try {
    cleanups.push(editor.positions.subscribe(refresh), editor.subscribe(refresh), editor.events.on('destroy', destroy));
  }
  catch (error) { destroy(); throw error; }
  return {
    set: (ranges) => {
      if (disposed || !owned()) { refresh(); return false; }
      if (!Array.isArray(ranges) || ranges.length > 2048) throw new RangeError('Decorations require at most 2048 text ranges.');
      const length = root.textContent?.length ?? 0;
      for (const range of ranges)
        if (!range || !Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 || range.to <= range.from || range.to > length)
          throw new RangeError('Decoration offsets must describe nonempty valid UTF-16 text ranges.');
      const next: typeof tracked = [];
      try {
        for (const range of ranges) {
          const from = editor.positions.track(range.from, 1);
          const to = editor.positions.track(range.to, -1);
          if (!from || !to) {
            if (from) editor.positions.release(from);
            if (to) editor.positions.release(to);
            throw new Error('Cannot track decorations in the current document state.');
          }
          next.push({ from, to });
        }
      }
      catch (error) {
        for (const target of next) { editor.positions.release(target.from); editor.positions.release(target.to); }
        throw error;
      }
      clear();
      tracked = next;
      refresh();
      return owned();
    },
    refresh,
    getState: () => ({ status, count }),
    destroy,
  };
};
