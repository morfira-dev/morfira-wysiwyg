import { createEditor } from '@morfira-dev/wysiwyg';
import type { DocumentNode, Editor } from '@morfira-dev/wysiwyg';
import { search, searchCommands } from '@morfira-dev/wysiwyg/plugins/search';
import { statistics } from '@morfira-dev/wysiwyg/plugins/statistics';
import '@morfira-dev/wysiwyg/style.css';
import type { BenchmarkBridge, InputMeasurement } from './runner.types.js';
import type { BenchmarkFixtureCounts } from './types.js';

declare global { interface Window { morfiraBenchmark: BenchmarkBridge; } }
const host = document.querySelector<HTMLElement>('#benchmark')!;
let editor: Editor | undefined;
let baselineHTML = '';
let historyEdits = 0;
let inputStart: number | undefined;
let inputResult: Promise<InputMeasurement> | undefined;
let resolveInput: ((measurement: InputMeasurement) => void) | undefined;
const active = (): Editor => {
  if (!editor) throw new Error('Benchmark editor is not mounted.');
  return editor;
};
const timed = (operation: () => void): number => {
  const start = performance.now();
  operation();
  return performance.now() - start;
};
const beforeInput = () => { if (resolveInput) inputStart = performance.now(); };
const afterInput = () => {
  if (!resolveInput || inputStart === undefined) return;
  const start = inputStart;
  const dispatchMs = performance.now() - start;
  requestAnimationFrame(() => {
    resolveInput?.({ dispatchMs, frameOpportunityMs: performance.now() - start });
    resolveInput = undefined;
    inputStart = undefined;
  });
};
const inspect = (): BenchmarkFixtureCounts => {
  const current = active();
  const value = current.getJSON();
  const fragments: string[] = [];
  let nodeCount = 0;
  let maxDepth = 0;
  const visit = (node: DocumentNode, depth: number) => {
    nodeCount++;
    maxDepth = Math.max(maxDepth, depth);
    if (node.type === 'text') fragments.push(node.text);
    else node.children.forEach((child) => visit(child, depth + 1));
  };
  value.children.forEach((child) => visit(child, 0));
  const textContent = fragments.join('');
  return {
    textContent, textLength: textContent.length, nodeCount, maxDepth,
    paragraphCount: current.surface.querySelectorAll('p').length,
    tableCount: current.surface.querySelectorAll('table').length,
    cellCount: current.surface.querySelectorAll('td,th').length,
  };
};
window.morfiraBenchmark = {
  mount: (html, profile, historyLimit = 20) => {
    if (editor || host.childNodes.length) throw new Error('Previous benchmark instance was not disposed.');
    const plugins = profile === 'search' ? [search()] : profile === 'statistics' ? [statistics({ locale: 'en' })] : [];
    const elapsed = timed(() => { editor = createEditor(host, { value: html, plugins, historyLimit }); });
    active().surface.addEventListener('beforeinput', beforeInput, true);
    active().surface.addEventListener('input', afterInput);
    return elapsed;
  },
  replace: (html) => timed(() => active().setHTML(html)),
  inspect,
  select: (index, length = 0) => timed(() => active().setSelection(index, length)),
  format: () => timed(() => active().format('bold', true)),
  verifyFormatted: (target, expectedText) => {
    const root = active().surface;
    if (root.querySelector('p strong')?.textContent !== target || root.textContent !== expectedText) throw new Error('Formatting changed the wrong target or lost content.');
  },
  verifyNativeInput: (expectedText) => {
    if (active().surface.textContent !== `x${expectedText}`) throw new Error('Native input did not insert the expected character.');
    const selection = active().getSelection();
    if (selection?.index !== 1 || selection.length !== 0) throw new Error('Native input did not retain the expected caret.');
  },
  undo: () => timed(() => active().undo()),
  redo: () => timed(() => active().redo()),
  html: () => active().getHTML(),
  exportHTML: () => timed(() => { active().getHTML(); }),
  search: (query, expected) => {
    const commands = searchCommands(active());
    const elapsed = timed(() => commands.setQuery(query));
    if (commands.getState().matches.length !== expected) throw new Error('Benchmark search returned an incorrect match count.');
    return elapsed;
  },
  armInput: () => {
    active().setSelection(0);
    inputStart = undefined;
    inputResult = new Promise((resolve) => { resolveInput = resolve; });
  },
  finishInput: async () => {
    if (!inputResult) throw new Error('Native input measurement was not armed.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([inputResult, new Promise<InputMeasurement>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Native input/frame measurement timed out.')), 10000);
      })]);
    } finally {
      clearTimeout(timer);
      inputResult = undefined;
    }
  },
  history: (edits) => {
    baselineHTML = active().getHTML();
    historyEdits = edits;
    active().setSelection(0);
    return timed(() => {
      for (let index = 0; index < edits; index++) active().insertHTML('<p>x</p>');
    });
  },
  verifyHistory: (expected) => {
    const current = active();
    const edited = current.getHTML();
    let undos = 0;
    while (current.canUndo()) { current.undo(); undos++; if (undos > 100) throw new Error('Unexpected history growth.'); }
    if (undos !== expected) throw new Error(`Expected ${expected} undo steps, got ${undos}.`);
    if (expected === historyEdits && current.getHTML() !== baselineHTML) throw new Error('Undo did not restore the complete history baseline.');
    let redos = 0;
    while (current.canRedo()) { current.redo(); redos++; if (redos > 100) throw new Error('Unexpected redo growth.'); }
    if (redos !== expected || current.getHTML() !== edited) throw new Error('History failed to restore the edited document.');
  },
  clearHistory: () => {
    active().setHTML(baselineHTML);
    baselineHTML = '';
    if (active().canUndo() || active().canRedo()) throw new Error('External replacement did not clear history.');
  },
  dispose: () => {
    const current = active();
    current.surface.removeEventListener('beforeinput', beforeInput, true);
    current.surface.removeEventListener('input', afterInput);
    const elapsed = timed(() => current.destroy());
    editor = undefined;
    baselineHTML = '';
    inputResult = undefined;
    resolveInput = undefined;
    inputStart = undefined;
    if (host.childNodes.length) throw new Error('Destroy left an editor view mounted.');
    return elapsed;
  },
  verify: (fixture) => {
    const actual = inspect();
    if (JSON.stringify(actual) !== JSON.stringify(fixture.expected)) {
      // Compare named fields; serialized object key order is not a semantic contract.
      for (const key of Object.keys(actual) as (keyof BenchmarkFixtureCounts)[]) {
        if (actual[key] !== fixture.expected[key]) throw new Error(`Fixture ${fixture.id}: incorrect ${key}.`);
      }
    }
    if (JSON.stringify(active().getJSON()) !== JSON.stringify(fixture.document)) throw new Error(`Fixture ${fixture.id}: JSON roundtrip changed data.`);
    const cells = active().surface.querySelectorAll('td[rowspan="2"]');
    if (cells.length !== fixture.expected.tableCount) throw new Error('Merged table geometry changed.');
    active().setSelection(fixture.target.index, fixture.target.length);
    if (window.getSelection()?.toString() !== fixture.target.text) throw new Error('Fixture selection target is incorrect.');
  },
};
