import type { CommandRegistry, CommandRegistryOptions, RegisteredCommand } from './internal-types.js';
import type { EditorCommand, EditorCommandDefinition, EditorCommandState, EditorCommands } from './types.js';

export type { EditorCommand, EditorCommandDefinition, EditorCommandState, EditorCommands } from './types.js';

const tokens = /* @__PURE__ */ new WeakSet<object>();

export const createEditorCommand = <T>(name: string): EditorCommand<T> => {
  if (typeof name !== 'string' || !name.trim() || name.length > 200)
    throw new TypeError('Expected a command name with 1–200 characters.');
  const command = Object.freeze({ name }) as EditorCommand<T>;
  tokens.add(command);
  return command;
};

const assertToken = (command: unknown): object => {
  if (!command || typeof command !== 'object' || !tokens.has(command))
    throw new TypeError('Expected an editor command token.');
  return command;
};

const synchronous = (callback: unknown): void => {
  if (typeof callback !== 'function' || callback.constructor.name === 'AsyncFunction')
    throw new TypeError('Command callbacks must be synchronous functions.');
};

const rejectThenable = (value: unknown): void => {
  if (value && (typeof value === 'object' || typeof value === 'function') && typeof (value as { then?: unknown }).then === 'function') {
    if (value instanceof Promise)
      void value.catch(() => {});
    throw new TypeError('Command callbacks must not return a thenable.');
  }
};

export const createCommandRegistry = (options: CommandRegistryOptions): CommandRegistry => {
  const entries = new Map<object, RegisteredCommand>();
  let disposed = false;
  const assertActive = () => {
    options.assertActive();
    if (disposed)
      throw new Error('Editor commands have been destroyed.');
  };
  const resolve = <T>(command: EditorCommand<T>): RegisteredCommand => {
    assertActive();
    const entry = entries.get(assertToken(command));
    if (!entry)
      throw new Error(`Command is not registered: ${command.name}`);
    return entry;
  };
  const stateValue = (callback: RegisteredCommand['isEnabled'], fallback: boolean): boolean => {
    if (!callback)
      return fallback;
    const value = callback(options.editor());
    rejectThenable(value);
    if (typeof value !== 'boolean')
      throw new TypeError('Command state callbacks must return a boolean.');
    return value;
  };
  const enabled = (entry: RegisteredCommand): boolean => !options.editor().isReadOnly() && !options.isComposing() && stateValue(entry.isEnabled, true);
  const commands: EditorCommands = {
    register: <T>(command: EditorCommand<T>, definition: EditorCommandDefinition<NoInfer<T>>): (() => void) => {
      assertActive();
      const key = assertToken(command);
      if (entries.has(key))
        throw new Error(`Command is already registered: ${command.name}`);
      if (!definition || typeof definition !== 'object')
        throw new TypeError('Expected a command definition.');
      const { validate, execute, isEnabled, isActive, isMixed } = definition;
      synchronous(validate);
      synchronous(execute);
      for (const callback of [isEnabled, isActive, isMixed]) {
        if (callback !== undefined)
          synchronous(callback);
      }
      const entry: RegisteredCommand = {
        validate,
        execute: (editor, payload) => execute(editor, payload as T),
        isEnabled,
        isActive,
        isMixed,
      };
      entries.set(key, entry);
      return () => {
        if (entries.get(key) === entry)
          entries.delete(key);
      };
    },
    execute: (command, payload): boolean => {
      const entry = resolve(command);
      if (!enabled(entry))
        return false;
      const editor = options.editor();
      editor.transact(() => {
        const validated = entry.validate(payload);
        rejectThenable(validated);
        // Keep the original return value so transact can reject thenables atomically.
        return entry.execute(editor, validated);
      });
      return true;
    },
    getState: (command): EditorCommandState => {
      const entry = resolve(command);
      return {
        enabled: enabled(entry),
        active: stateValue(entry.isActive, false),
        mixed: stateValue(entry.isMixed, false),
      };
    },
  };
  return {
    commands,
    destroy: () => {
      if (disposed)
        return;
      disposed = true;
      entries.clear();
    },
  };
};
