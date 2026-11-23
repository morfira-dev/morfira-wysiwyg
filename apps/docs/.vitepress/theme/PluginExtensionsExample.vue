<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor, EditorPositionHandle } from '@morfira-dev/wysiwyg';
import type { DecorationsController, NodeCommands, NodeViewsController } from '@morfira-dev/wysiwyg/sdk';
import '@morfira-dev/wysiwyg/style.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const viewHost = ref<HTMLElement>();
const ready = ref(false);
const html = ref('');
const position = ref('');
const decorationCount = ref(0);
const supported = ref(false);
let editor: Editor | undefined;
let nodes: NodeCommands | undefined;
let views: NodeViewsController | undefined;
let decorations: DecorationsController | undefined;
let tracked: EditorPositionHandle | undefined;
let destroyed = false;
const stops: (() => void)[] = [];

const refresh = () => {
  if (!editor) return;
  html.value = editor.getHTML();
  const current = tracked ? editor.positions.resolve(tracked) : undefined;
  position.value = current ? `${current.index}${current.deleted ? ' (deleted)' : ''}` : '—';
  decorationCount.value = decorations?.getState().count ?? 0;
};
const reset = () => {
  if (!editor) return;
  if (tracked) editor.positions.release(tracked);
  editor.setHTML('<p>Start <span data-mw-node="demo:token" data-id="42">Token</span> end</p>');
  editor.setSelection(6);
  tracked = editor.positions.track(6);
  decorations?.set([{ from: 12, to: 15 }]);
  refresh();
};
const insertPrefix = () => {
  if (!editor) return;
  editor.transact((surface) => {
    const first = surface.querySelector('p')?.firstChild;
    if (first?.nodeType !== 3) throw new Error('The example requires an ordinary leading text node.');
    (first as Text).insertData(0, '++');
  }, { mapping: [{ from: 0, to: 0, insert: '++' }] });
  refresh();
};
const rename = () => {
  if (!editor || !nodes) return;
  const token = editor.surface.querySelector<HTMLElement>('[data-mw-node="demo:token"]');
  if (token) nodes.update(token, { 'data-id': '42' }, 'Updated');
  refresh();
};
const insert = () => {
  if (!editor || !nodes) return;
  editor.setSelection(editor.getText().length);
  nodes.insert('New token', { 'data-id': '43' });
  refresh();
};
const undo = () => { editor?.undo(); refresh(); };

onMounted(async () => {
  const [{ createEditor }, sdk] = await Promise.all([
    import('@morfira-dev/wysiwyg'), import('@morfira-dev/wysiwyg/sdk'),
  ]);
  if (destroyed || !host.value || !viewHost.value) return;
  editor = createEditor(host.value, {
    label: t('Редактор расширений SDK', 'SDK extensions editor'),
    locale: ru.value ? 'ru' : 'en',
    plugins: [sdk.nodeExtension({
      name: 'demo:token', kind: 'inline', tag: 'span',
      attributes: { 'data-id': { type: 'text', minLength: 1, maxLength: 64, required: true } },
      content: { type: 'text', minLength: 1, maxLength: 64, singleLine: true },
    }, { atomic: true })],
  });
  nodes = sdk.nodeCommands(editor, 'demo:token');
  views = sdk.createNodeViews(viewHost.value, editor, {
    name: 'demo:token',
    create: (context) => {
      const element = document.createElement('div');
      element.className = 'sdk-node-card';
      const update = (next: typeof context) => {
        element.textContent = `${t('Внешний вид узла', 'External node view')}: ${next.text} / ID ${next.attributes['data-id']}`;
      };
      update(context);
      return { element, update };
    },
  });
  decorations = sdk.createDecorations(editor, { name: 'app-sdk-demo' });
  supported.value = decorations.getState().status === 'ready';
  stops.push(editor.positions.subscribe(refresh), editor.subscribe(refresh));
  ready.value = true;
  reset();
});

onBeforeUnmount(() => {
  destroyed = true;
  for (const stop of stops) stop();
  decorations?.destroy();
  views?.destroy();
  if (editor && tracked) editor.positions.release(tracked);
  editor?.destroy();
});
</script>

<template>
  <section class="plugin-extensions-example" :aria-label="t('Пример расширений SDK', 'SDK extensions example')">
    <div class="sdk-extension-actions">
      <button type="button" :disabled="!ready" @click="reset">{{ t('Сбросить пример', 'Reset example') }}</button>
      <button type="button" :disabled="!ready" @click="insertPrefix">{{ t('Вставить префикс с mapping', 'Insert prefix with mapping') }}</button>
      <button type="button" :disabled="!ready" @click="rename">{{ t('Изменить узел', 'Update node') }}</button>
      <button type="button" :disabled="!ready" @click="insert">{{ t('Вставить атом', 'Insert atom') }}</button>
      <button type="button" :disabled="!ready" @click="undo">{{ t('Отменить', 'Undo') }}</button>
    </div>
    <div ref="host"></div>
    <div ref="viewHost" class="sdk-external-views" :aria-label="t('Внешние представления узлов', 'External node views')"></div>
    <p role="status">{{ t('Текстовая позиция', 'Text position') }}: <output data-position>{{ position }}</output>. {{ t('Подсветок', 'Highlights') }}: <output data-decorations>{{ decorationCount }}</output>. {{ supported ? t('CSS Highlights доступны.', 'CSS Highlights available.') : t('Браузер не поддерживает CSS Highlights.', 'CSS Highlights unavailable in this browser.') }}</p>
    <label>HTML<textarea readonly :value="html" rows="4" :aria-label="t('HTML расширений SDK', 'SDK extensions HTML')"></textarea></label>
    <p>{{ t('Представления находятся вне сохраняемого содержимого. Пример не добавляет произвольный HTML в документ. Неописанные изменения сбрасывают отслеживание вместо угадывания новой цели.', 'Views live outside persisted content. The example never inserts arbitrary view HTML into the document. Undeclared changes expire tracking instead of guessing a new target.') }}</p>
  </section>
</template>

<style scoped>
.plugin-extensions-example { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.sdk-extension-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.plugin-extensions-example label { display: grid; gap: 4px; }
.plugin-extensions-example button, .plugin-extensions-example textarea { padding: 8px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text-1); }
.sdk-external-views :deep(.sdk-node-card) { padding: 8px 12px; margin: 4px 0; background: var(--vp-c-bg-soft); border-radius: 8px; }
.plugin-extensions-example :deep(.mw-editor) { --mw-surface: var(--vp-c-bg); --mw-text: var(--vp-c-text-1); --mw-border: var(--vp-c-divider); --mw-min-height: 100px; }
textarea { width: 100%; box-sizing: border-box; font-family: var(--vp-font-family-mono); }
</style>

<style>
::highlight(app-sdk-demo) { background: #ffdf6e; color: #171717; }
</style>
