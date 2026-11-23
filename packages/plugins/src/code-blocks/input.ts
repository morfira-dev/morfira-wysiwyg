import type { CodeBlockInputOptions, CodeBlockRange } from './internal-types.js';

export const setupCodeInput = ({ editor, commands, isComposing }: CodeBlockInputOptions): (() => void) => {
  const root = editor.surface;
  const document = root.ownerDocument;
  const inspect = (): CodeBlockRange | undefined => {
    const native = document.getSelection();
    if (native?.rangeCount !== 1) return;
    const range = native.getRangeAt(0);
    const element = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
    const target = element?.closest<HTMLElement>('pre[data-mw-node="morfira:code-block"]');
    if (!target || !commands.get(target) || !target.contains(range.endContainer) && range.endContainer !== target) return;
    const prefix = document.createRange();
    prefix.selectNodeContents(target);
    prefix.setEnd(range.startContainer, range.startOffset);
    const end = document.createRange();
    end.selectNodeContents(target);
    end.setEnd(range.endContainer, range.endOffset);
    return { range, target, start: prefix.toString().length, end: end.toString().length };
  };
  const replace = (value: string) => {
    const context = inspect();
    if (!context || isComposing() || editor.isReadOnly()) return;
    const original = commands.get(context.target)!;
    if (original.source.length - (context.end - context.start) + value.length > 20000) return;
    const html = editor.getHTML();
    editor.transact(() => {
      const fresh = inspect();
      if (!fresh || isComposing() || editor.isReadOnly() || editor.getHTML() !== html || fresh.target !== context.target
        || fresh.start !== context.start || fresh.end !== context.end) return;
      const source = original.source.slice(0, context.start) + value + original.source.slice(context.end);
      const text = document.createTextNode(source);
      context.target.replaceChildren(text);
      const caret = document.createRange();
      caret.setStart(text, context.start + value.length);
      caret.collapse(true);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(caret);
    });
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || isComposing() || editor.isReadOnly() || event.altKey) return;
    const context = inspect();
    if (!context) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) commands.exit(context.target);
      else replace('\n');
    }
    else if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      replace('\t');
    }
    else if (!event.ctrlKey && !event.metaKey && context.range.collapsed
      && (event.key === 'Backspace' && context.start === 0 || event.key === 'Delete' && context.end === (context.target.textContent?.length ?? 0)))
      event.preventDefault();
  };
  const beforeinput = (event: InputEvent) => {
    if (event.defaultPrevented || !event.cancelable || event.isComposing || isComposing() || editor.isReadOnly()) return;
    const context = inspect();
    if (!context) return;
    if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
      event.preventDefault();
      replace('\n');
    }
    else if (event.inputType === 'insertText' && typeof event.data === 'string'
      && (context.target.textContent?.length ?? 0) - (context.end - context.start) + event.data.length > 20000)
      event.preventDefault();
    else if (context.range.collapsed && (event.inputType === 'deleteContentBackward' && context.start === 0
      || event.inputType === 'deleteContentForward' && context.end === (context.target.textContent?.length ?? 0)))
      event.preventDefault();
  };
  const paste = (event: ClipboardEvent) => {
    if (event.defaultPrevented || !inspect()) return;
    event.preventDefault();
    if (editor.isReadOnly() || isComposing() || !event.clipboardData || event.clipboardData.files.length) return;
    const text = event.clipboardData.getData('text/plain');
    if (text.length <= 20000) replace(text.replace(/\r\n?/g, '\n'));
  };
  root.addEventListener('keydown', keydown, true);
  root.addEventListener('beforeinput', beforeinput as EventListener, true);
  root.addEventListener('paste', paste, true);
  return () => {
    root.removeEventListener('keydown', keydown, true);
    root.removeEventListener('beforeinput', beforeinput as EventListener, true);
    root.removeEventListener('paste', paste, true);
  };
};
