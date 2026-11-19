import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { ContextualPreferences } from './contextual-preference.types.js';

const preferences = new WeakMap<Editor, ContextualPreferences>();
const stateFor = (editor: Editor): ContextualPreferences => {
  let state = preferences.get(editor);
  if (!state) {
    state = { owners: new Set(), listeners: new Set() };
    preferences.set(editor, state);
  }
  return state;
};
const notify = (state: ContextualPreferences): void => {
  const failures: unknown[] = [];
  for (const listener of [...state.listeners]) {
    try { listener(); }
    catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Contextual preference refresh failed.');
};

/** Eligibility only: a preferred optional UI never gains mutation authority here. */
export const registerContextualPreference = (editor: Editor, accepts: (range: Range) => boolean): (() => void) => {
  const state = stateFor(editor);
  state.owners.add(accepts);
  try { notify(state); }
  catch (error) {
    state.owners.delete(accepts);
    try { notify(state); }
    catch { /* Restore other views while preserving the original setup failure. */ }
    throw error;
  }
  return () => {
    if (state.owners.delete(accepts)) notify(state);
  };
};
export const prefersContextualRange = (editor: Editor, range: Range): boolean => {
  const state = preferences.get(editor);
  return Boolean(state && [...state.owners].some((accepts) => accepts(range)));
};
export const onContextualPreferenceChange = (editor: Editor, listener: () => void): (() => void) => {
  const state = stateFor(editor);
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
};
