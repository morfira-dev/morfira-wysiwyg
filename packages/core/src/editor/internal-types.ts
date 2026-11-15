import type { EditorInputCommit } from '../events/types.js';

export type InputCommitOrigin = Pick<EditorInputCommit, 'inputType' | 'sourceEvent'>;
