<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import { createEditor } from '@morfira-dev/wysiwyg';
import type { Editor, EditorNodePositionHandle } from '@morfira-dev/wysiwyg';
import { structuralCommands } from '@morfira-dev/wysiwyg/sdk';
import '@morfira-dev/wysiwyg/style.css';
const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const html = ref('');
const points = ref('');
const ready = ref(false);
const splitEnabled = ref(false);
const joinEnabled = ref(false);
const liftEnabled = ref(false);
const undoEnabled = ref(false);
const redoEnabled = ref(false);
let editor: Editor | undefined;
let handles: EditorNodePositionHandle[] = [];
const cleanups: (() => void)[] = [];
const sample = '<p title="Split block">AlphaBeta</p><p>Gamma</p><ul><li><p>Parent</p><ul><li><p title="Nested item">Nested</p><ul><li><p>Branch</p></li></ul></li><li><p>Stay</p></li></ul></li><li><p>Last</p></li></ul><p>Tail</p>';
const pathOf = (node: HTMLElement): number[] => {
  const path: number[] = [];
  for (let current = node; current !== editor!.surface; current = current.parentElement!) path.unshift([...current.parentElement!.children].indexOf(current));
  return path;
};
const refresh = () => {
  if (!editor) return;
  const source = editor.surface.querySelector('[title="Split block"]');
  const item = editor.surface.querySelector('[title="Nested item"]')?.parentElement;
  html.value = editor.getHTML();
  points.value = JSON.stringify(handles.map(editor.positions.resolveNode));
  splitEnabled.value = source?.textContent === 'AlphaBeta';
  joinEnabled.value = source?.textContent === 'Alpha' && source.nextElementSibling?.textContent === 'Beta';
  liftEnabled.value = Boolean(item?.parentElement?.parentElement?.closest('li'));
  undoEnabled.value = editor.canUndo();
  redoEnabled.value = editor.canRedo();
};
const select = (target: HTMLElement) => {
  editor!.focus();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(true);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
};
const reset = () => {
  if (!editor) return;
  handles.forEach(editor.positions.releaseNode);
  editor.setHTML(sample);
  const first = editor.positions.trackNode([0], 5, 1);
  const nested = editor.positions.trackNode([2, 0, 1, 0, 0], 3);
  handles = [first, nested].filter((handle): handle is EditorNodePositionHandle => !!handle);
  refresh();
};
const split = () => {
  if (!editor) return;
  const target = editor.surface.querySelector<HTMLElement>('[title="Split block"]')!;
  select(target);
  structuralCommands(editor).apply([{ kind: 'split', path: pathOf(target), offset: 5 }]);
  refresh();
};
const join = () => {
  if (!editor) return;
  const target = editor.surface.querySelector<HTMLElement>('[title="Split block"]')!;
  select(target);
  structuralCommands(editor).apply([{ kind: 'join', path: pathOf(target) }]);
  refresh();
};
const lift = () => {
  if (!editor) return;
  const target = editor.surface.querySelector<HTMLElement>('[title="Nested item"]')!;
  const item = target.parentElement!;
  const owner = item.parentElement!.parentElement!.closest('li')!;
  const list = owner.parentElement!;
  select(target);
  structuralCommands(editor).apply([{ kind: 'move', path: pathOf(item), parent: pathOf(list), index: [...list.children].indexOf(owner) + 1 }]);
  refresh();
};
onMounted(() => {
  editor = createEditor(host.value!, { locale: ru.value ? 'ru' : 'en', value: sample });
  cleanups.push(editor.subscribe(refresh), editor.positions.subscribe(refresh));
  reset();
  ready.value = true;
});
onBeforeUnmount(() => {
  cleanups.forEach((cleanup) => cleanup());
  handles.forEach((handle) => editor?.positions.releaseNode(handle));
  editor?.destroy();
});
</script>
<template>
  <section class="structural-mapping-example" :aria-label="t('Структурные позиции', 'Structural positions')">
    <div class="structural-mapping-controls">
      <button :disabled="!ready || !splitEnabled" @click="split">{{ t('Разделить абзац', 'Split paragraph') }}</button>
      <button :disabled="!ready || !joinEnabled" @click="join">{{ t('Объединить абзацы', 'Join paragraphs') }}</button>
      <button :disabled="!ready || !liftEnabled" @click="lift">{{ t('Поднять вложенный пункт', 'Lift nested item') }}</button>
      <button :disabled="!undoEnabled" @click="editor?.undo(); refresh()">{{ t('Отменить', 'Undo') }}</button>
      <button :disabled="!redoEnabled" @click="editor?.redo(); refresh()">{{ t('Повторить', 'Redo') }}</button>
      <button :disabled="!ready" @click="reset">{{ t('Сбросить пример', 'Reset example') }}</button>
    </div>
    <div ref="host" class="structural-mapping-host" />
    <p>{{ t('Пути отслеживаемых абзацев и смещения:', 'Tracked paragraph paths and offsets:') }}</p>
    <output class="structural-mapping-points">{{ points }}</output>
    <textarea :value="html" readonly rows="5" :aria-label="t('HTML структурных операций', 'Structural operation HTML')" />
  </section>
</template>
<style scoped>
.structural-mapping-example { min-width: 0; padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.structural-mapping-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.structural-mapping-controls button { min-height: 36px; padding: 6px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; font: inherit; }
.structural-mapping-controls :focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
.structural-mapping-controls :disabled { opacity: .5; }
.structural-mapping-host { min-height: 180px; margin-block: 12px; padding: 8px; border: 1px solid var(--vp-c-divider); }
.structural-mapping-points { display: block; overflow-wrap: anywhere; font-family: monospace; }
.structural-mapping-example textarea { width: 100%; margin-top: 12px; padding: 8px; font: inherit; font-family: monospace; }
</style>
