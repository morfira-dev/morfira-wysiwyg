import type { Editor, EditorPositionHandle, EditorPositions, EditorTransactionOptions, TextMappingStep } from '@morfira-dev/wysiwyg';

const checkMappedPositions = (editor: Editor) => {
  const positions: EditorPositions = editor.positions;
  const handle: EditorPositionHandle | undefined = positions.track(0, -1);
  const mapping: readonly TextMappingStep[] = [{ from: 0, to: 0, insert: 'X' }];
  const options: EditorTransactionOptions = { mapping };
  editor.transact((surface) => surface.prepend('X'), options);
  if (handle) {
    const value: number | undefined = positions.resolve(handle)?.index;
    positions.release(handle);
    void value;
  }
  // @ts-expect-error Mapped position identities cannot be fabricated structurally.
  positions.resolve({});
  // @ts-expect-error Association has two explicit supported directions.
  positions.track(0, 0);
};
void checkMappedPositions;
