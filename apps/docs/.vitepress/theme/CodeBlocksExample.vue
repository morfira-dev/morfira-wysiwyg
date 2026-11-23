<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { CodeBlockCommands } from '@morfira-dev/wysiwyg/plugins/code-blocks';
import type { CodeBlockFormController, CodeBlockViewController, CodeHighlightToken } from '@morfira-dev/wysiwyg/ui/code-blocks';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/ui/code-blocks.css';
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const controls = ref<HTMLElement>();
const previews = ref<HTMLElement>();
const ready = ref(false);
const readonly = ref(false);
const html = ref('');
const status = ref('');
let disposed = false;
let editor: Editor | undefined;
let commands: CodeBlockCommands | undefined;
let form: CodeBlockFormController | undefined;
let view: CodeBlockViewController | undefined;
let stop: (() => void) | undefined;
const report = (error: unknown) => { status.value = error instanceof Error ? error.message : String(error); };
const sampleSource = 'const greet = (name: string) => {\n\treturn "Hello, " + name;\n};\n';
const refresh = () => { html.value = editor?.getHTML() ?? ''; };
const sample = () => {
  if (!editor || !commands) return;
  editor.setHTML('<p>Before code</p><p>After code</p>');
  editor.setSelection(6);
  commands.insert({ source: sampleSource, language: 'typescript' });
  refresh();
};
const insert = () => {
  if (!editor) return;
  const last = editor.surface.lastElementChild;
  if (!last) return;
  editor.focus();
  const range = editor.surface.ownerDocument.createRange();
  range.selectNodeContents(last);
  range.collapse(false);
  const native = editor.surface.ownerDocument.getSelection();
  native?.removeAllRanges();
  native?.addRange(range);
  form?.open();
};
const edit = () => {
  const target = editor?.surface.querySelector<HTMLElement>('pre[data-mw-node="morfira:code-block"]');
  if (target) form?.open(target);
};
const undo = () => editor?.undo();
const redo = () => editor?.redo();
const toggleReadonly = () => editor?.setReadOnly(readonly.value);
// Explicit local integration sample, not a grammar shipped in the plugin.
const sampleHighlight = async ({ source, signal }: { source: string; signal: AbortSignal }): Promise<readonly CodeHighlightToken[]> => {
  await Promise.resolve();
  if (signal.aborted) return [];
  const tokens: CodeHighlightToken[] = [];
  for (const match of source.matchAll(/\b(?:const|let|return|string|number)\b/g))
    tokens.push({ from: match.index!, to: match.index! + match[0].length, kind: 'keyword' });
  return tokens;
};
onMounted(async () => {
  const [{ createEditor }, behavior, ui] = await Promise.all([
    import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/plugins/code-blocks'), import('@morfira-dev/wysiwyg/ui/code-blocks'),
  ]);
  if (disposed || !host.value || !controls.value || !previews.value) return;
  try {
    editor = createEditor(host.value, { label: t('Редактор блоков кода', 'Code block editor'), locale: ru.value ? 'ru' : 'en', plugins: [behavior.codeBlocks()] });
    commands = behavior.codeBlockCommands(editor);
    form = ui.createCodeBlockForm(controls.value, editor, { onError: report });
    view = ui.createCodeBlockView(previews.value, editor, { highlight: sampleHighlight, onError: report });
    stop = editor.subscribe(refresh);
    sample();
    ready.value = true;
  }
  catch (error) { report(error); }
});
watch(ru, (russian) => editor?.setLocale(russian ? 'ru' : 'en'));
onBeforeUnmount(() => {
  disposed = true;
  stop?.();
  form?.destroy();
  view?.destroy();
  editor?.destroy();
});
</script>

<template>
  <section class="code-blocks-example" :aria-label="t('Пример блоков кода', 'Code blocks example')">
    <div class="code-blocks-actions">
      <button type="button" :disabled="!ready || readonly" @click="sample">{{ t('Загрузить пример кода', 'Load code sample') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="insert">{{ t('Вставить блок кода', 'Insert code block') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="edit">{{ t('Изменить блок кода', 'Edit code block') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="undo">{{ t('Отменить', 'Undo') }}</button>
      <button type="button" :disabled="!ready || readonly" @click="redo">{{ t('Повторить', 'Redo') }}</button>
      <label><input v-model="readonly" type="checkbox" @change="toggleReadonly">{{ t('Только чтение', 'Read only') }}</label>
    </div>
    <div ref="host"></div>
    <p>{{ t('В блоке Enter вставляет перенос строки, Tab — табуляцию, Ctrl/⌘+Enter создаёт абзац после кода. При вставке используется только буквальный plain text.', 'Inside a code block Enter inserts LF, Tab inserts a tab and Ctrl/⌘+Enter creates a following paragraph. Paste uses literal plain text only.') }}</p>
    <p>{{ t('Подсветка ниже — отдельное внешнее представление и локальный демонстрационный провайдер нескольких ключевых слов. Грамматики, сеть и HTML-токены в документ не добавляются.', 'The highlighting below is an external view with an explicit local provider for a few sample keywords. No grammar, network access or token HTML is added to the document.') }}</p>
    <div ref="previews" class="code-block-previews"></div>
    <div ref="controls"></div>
    <p role="status">{{ status }}</p>
    <label>{{ t('Сохраняемый HTML кода', 'Persisted code HTML') }}<textarea readonly :value="html" rows="5"></textarea></label>
  </section>
</template>

<style scoped>
.code-blocks-example{display:grid;gap:12px;padding:16px;border:1px solid var(--vp-c-divider);border-radius:12px;min-width:0}.code-blocks-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.code-blocks-actions button{padding:7px 10px;border:1px solid var(--vp-c-divider);border-radius:6px;background:var(--vp-c-bg);color:var(--vp-c-text-1)}.code-blocks-actions label{display:flex;align-items:center;gap:6px}.code-blocks-example>label{display:grid;gap:4px}.code-blocks-example textarea{box-sizing:border-box;width:100%;font:12px var(--vp-font-family-mono);background:var(--vp-c-bg);color:var(--vp-c-text-1);padding:8px;border:1px solid var(--vp-c-divider);border-radius:6px}.code-blocks-example :deep(.mw-editor){--mw-surface:var(--vp-c-bg);--mw-text:var(--vp-c-text-1);--mw-border:var(--vp-c-divider);--mw-min-height:140px}.code-blocks-example :deep(.mw-content pre){white-space:pre;overflow:auto;tab-size:2}
</style>
