import type { StructuralMappingStep } from '@morfira-dev/wysiwyg-core';
export interface StructuralCommands {
  /** Apply one explicit supported structural plan as one undoable edit. */
  apply(steps: readonly StructuralMappingStep[]): boolean;
}
