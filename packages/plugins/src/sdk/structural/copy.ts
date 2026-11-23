import type { Editor, StructuralMappingStep } from '@morfira-dev/wysiwyg-core';

/** Bound paths and normalized payloads before retaining private plan copies. */
export const copyStructuralSteps = (editor: Editor, input: readonly StructuralMappingStep[]): StructuralMappingStep[] => {
  if (!Array.isArray(input) || input.length > 32) throw new TypeError('Structural commands accept at most 32 steps.');
  let nodes = 0;
  let serialized = 0;
  return input.map((step) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw new TypeError('Invalid structural step.');
    const allowed = step.kind === 'split' ? ['kind', 'path', 'offset'] : step.kind === 'join' || step.kind === 'remove' ? ['kind', 'path']
      : step.kind === 'insert' ? ['kind', 'parent', 'index', 'nodes'] : step.kind === 'move' ? ['kind', 'path', 'parent', 'index'] : [];
    if (!allowed.length || Reflect.ownKeys(step).some((key) => typeof key !== 'string' || !allowed.includes(key))) throw new TypeError('Unsupported structural field.');
    const copy: Record<string, unknown> = { ...step };
    for (const key of ['path', 'parent']) {
      if (!Object.hasOwn(copy, key)) continue;
      const path = copy[key];
      if (!Array.isArray(path) || path.length > 64 || path.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 100000))
        throw new RangeError('Invalid structural path.');
      copy[key] = [...path];
    }
    if (step.kind === 'insert') {
      if (!Array.isArray(step.nodes) || !step.nodes.length || step.nodes.length > 1000) throw new RangeError('Structural insertion needs 1–1000 nodes.');
      const value = editor.schema.validateDocument({ version: 1, children: step.nodes });
      serialized += editor.schema.documentHTML(value).length;
      if (serialized > 5000000) throw new RangeError('Structural insertion exceeds aggregate serialized limits.');
      const pending = [...value.children];
      while (pending.length) {
        const node = pending.pop()!;
        if (++nodes > 100000) throw new RangeError('Structural insertion exceeds aggregate node limits.');
        if (node.type === 'element') for (const child of node.children) pending.push(child);
      }
      copy.nodes = value.children;
    }
    return copy as unknown as StructuralMappingStep;
  });
};
