<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import type { Editor } from '@morfira-dev/wysiwyg';
import wordWindows from '../../../../tests/fixtures/office/word-windows-edge.html?raw';
import wordSafari from '../../../../tests/fixtures/office/word-mac-safari.html?raw';
import excel from '../../../../tests/fixtures/office/excel-windows-chromium.html?raw';
import docs from '../../../../tests/fixtures/office/google-docs-table.html?raw';
import nativeDocs from '../../../../tests/fixtures/office/google-docs-native-chrome.html?raw';
import joditNotice from '../../../../tests/fixtures/office/LICENSE.jodit.txt?raw';
import lexicalNotice from '../../../../tests/fixtures/office/LICENSE.lexical.txt?raw';
import gridclipNotice from '../../../../tests/fixtures/office/LICENSE.gridclip.txt?raw';
import '@morfira-dev/wysiwyg/style.css';

const { lang } = useData();
const ru = computed(() => lang.value === 'ru');
const t = (russian: string, english: string) => ru.value ? russian : english;
const host = ref<HTMLElement>();
const ready = ref(false);
const choice = ref('word-windows');
const output = ref('');
const source = ref('');
const application = ref('Excel');
const version = ref('');
const system = ref('');
const capturedHTML = ref('');
const capturedText = ref('');
const capturedAt = ref('');
const status = ref('');
let editor: Editor | undefined;
let disposed = false;
let stopChange: (() => void) | undefined;
const samples = { 'word-windows': wordWindows, 'word-safari': wordSafari, excel, docs, 'docs-native': nativeDocs };
const refresh = () => { if (editor) output.value = editor.getHTML(); };
const load = () => {
  if (!editor || !(choice.value in samples)) return;
  source.value = samples[choice.value as keyof typeof samples];
  editor.setHTML('<p><br></p>');
  editor.setSelection(0);
  const data = new DataTransfer();
  data.setData('text/html', source.value);
  const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: data });
  editor.surface.dispatchEvent(paste);
  refresh();
};
const undo = () => { editor?.undo(); refresh(); };
const capture = (event: ClipboardEvent) => {
  event.preventDefault();
  const html = event.clipboardData?.getData('text/html') ?? '';
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (html.length > 5000000 || text.length > 5000000) {
    capturedHTML.value = '';
    capturedText.value = '';
    capturedAt.value = '';
    status.value = t('Слишком большой буфер: максимум 5 000 000 символов на MIME-тип.', 'Clipboard too large: at most 5,000,000 code units per MIME type.');
    return;
  }
  if (!html && !text) {
    capturedHTML.value = '';
    capturedText.value = '';
    capturedAt.value = '';
    status.value = t('Нет text/html или text/plain в буфере.', 'The clipboard offers neither text/html nor text/plain.');
    return;
  }
  capturedHTML.value = html;
  capturedText.value = text;
  capturedAt.value = new Date().toISOString();
  status.value = t('Буфер сохранён как текст локально. HTML не исполнялся.', 'Clipboard stored locally as text. HTML was not executed.');
};
const download = () => {
  if (!capturedAt.value) return;
  const payload = {
    format: 'morfira-office-capture-v1',
    capturedAt: capturedAt.value,
    application: { name: application.value, version: version.value, os: system.value, provenance: 'self-reported' },
    browser: navigator.userAgent,
    mime: { 'text/html': capturedHTML.value, 'text/plain': capturedText.value },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'morfira-office-capture.json';
  link.click();
  URL.revokeObjectURL(url);
};
onMounted(async () => {
  const { createEditor } = await import('@morfira-dev/wysiwyg');
  if (disposed || !host.value) return;
  editor = createEditor(host.value, { locale: ru.value ? 'ru' : 'en', value: '<p><br></p>', label: t('Редактор офисного корпуса', 'Office corpus editor') });
  stopChange = editor.subscribe(refresh);
  ready.value = true;
  refresh();
});
onBeforeUnmount(() => {
  disposed = true;
  stopChange?.();
  editor?.destroy();
  editor = undefined;
});
</script>

<template>
  <section class="office-corpus-example">
    <h3>{{ t('Внешний корпус и потери импорта', 'External corpus and import losses') }}</h3>
    <p>{{ t('Это воспроизведение сохранённых upstream-данных, не новый запуск Word/Excel. Оригиналы и MIT notices хранятся в тестовом корпусе. Свежий захват Google Docs сделан 23.11.2026 в Chrome/macOS; способ захвата старых upstream-образцов Docs не документирован.', 'This replays saved upstream data, not a new Word/Excel run. Originals and MIT notices remain in the test corpus. The fresh Google Docs capture was recorded on 2026-11-23 in Chrome/macOS; older upstream Docs samples have undocumented capture methods.') }}</p>
    <label>{{ t('Исходный образец', 'Source sample') }}
      <select v-model="choice" :aria-label="t('Исходный образец', 'Source sample')">
        <option value="word-windows">Word — Windows / Edge</option>
        <option value="word-safari">Word — macOS / Safari</option>
        <option value="excel">Excel 365 — Windows 11 / Chromium 141</option>
        <option value="docs-native">Google Docs — native Chrome / macOS, 2026-11-23</option>
        <option value="docs">Google Docs — upstream table sample</option>
      </select>
    </label>
    <div class="office-corpus-actions">
      <button type="button" :disabled="!ready" @click="load">{{ t('Воспроизвести образец', 'Replay sample') }}</button>
      <button type="button" :disabled="!ready" @click="undo">{{ t('Отменить вставку', 'Undo paste') }}</button>
    </div>
    <div ref="host"></div>
    <label>{{ t('Результат безопасного импорта', 'Safe import result') }}<textarea :value="output" readonly rows="5"></textarea></label>
    <details><summary>{{ t('Исходный HTML как текст', 'Original HTML as text') }}</summary><textarea :value="source" readonly rows="5" :aria-label="t('Исходный HTML', 'Original HTML')"></textarea></details>
    <details><summary>{{ t('MIT notices внешних данных', 'External data MIT notices') }}</summary><pre>{{ joditNotice }}
{{ lexicalNotice }}
{{ gridclipNotice }}</pre></details>
    <h3>{{ t('Снять собственный реальный буфер', 'Capture a real clipboard') }}</h3>
    <p>{{ t('Скопируйте несекретный фрагмент из приложения и вставьте его в поле ниже. Данные не загружаются на сервер и не рендерятся как HTML. Версию приложения и ОС укажите самостоятельно; эти сведения не проверяются автоматически.', 'Copy a non-sensitive fragment from the application and paste below. Data is not uploaded or rendered as HTML. Enter application version and OS yourself; that metadata is not automatically verified.') }}</p>
    <label>{{ t('Приложение', 'Application') }}<input v-model="application" maxlength="100"></label>
    <label>{{ t('Версия приложения', 'Application version') }}<input v-model="version" maxlength="100"></label>
    <label>{{ t('Операционная система', 'Operating system') }}<input v-model="system" maxlength="100"></label>
    <label>{{ t('Поле захвата буфера', 'Clipboard capture field') }}<textarea :value="capturedHTML" rows="4" :aria-label="t('Поле захвата буфера', 'Clipboard capture field')" @paste="capture"></textarea></label>
    <p role="status">{{ status }}</p>
    <button type="button" :disabled="!capturedAt" @click="download">{{ t('Скачать JSON буфера', 'Download clipboard JSON') }}</button>
  </section>
</template>

<style scoped>
.office-corpus-example { display: grid; gap: 12px; margin: 20px 0; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 12px; min-width: 0; }
.office-corpus-example label { display: grid; gap: 4px; min-width: 0; }
.office-corpus-example pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.office-corpus-example textarea { width: 100%; resize: vertical; font-family: var(--vp-font-family-mono); font-size: 12px; }
.office-corpus-example button, .office-corpus-example input, .office-corpus-example textarea, .office-corpus-example select { padding: 7px 9px; max-width: 100%; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text-1); }
.office-corpus-example button:disabled { opacity: .5; }
.office-corpus-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.office-corpus-example :deep(.mw-editor) { --mw-surface: var(--vp-c-bg); --mw-text: var(--vp-c-text-1); --mw-border: var(--vp-c-divider); --mw-min-height: 120px; }
</style>
