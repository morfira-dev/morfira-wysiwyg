<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useData, withBase } from 'vitepress';
import { createIntegrationReport, feedbackBrowserFamily, integrationScenarios } from './integration-feedback/index.js';
import type { IntegrationScenarioId } from './integration-feedback/types.js';

const { lang } = useData();
const language = computed(() => lang.value === 'ru' ? 'ru' : 'en');
const t = (ru: string, en: string) => language.value === 'ru' ? ru : en;
const prefix = useId();
const selectedScenario = ref<IntegrationScenarioId>('article');
const scenario = computed(() => integrationScenarios.find((entry) => entry.id === selectedScenario.value) ?? integrationScenarios[0]);
const sandboxOpen = ref(false);
const EditorFieldExample = defineAsyncComponent(() => import('./EditorFieldExample.vue'));
const toggleSandbox = (event: Event) => { sandboxOpen.value = (event.currentTarget as HTMLDetailsElement).open; };
const applicationVersion = ref('');
const steps = ref('');
const expected = ref('');
const actual = ref('');
const includeBrowser = ref(false);
const reviewed = ref(false);
const report = ref('');
const reportField = ref<HTMLTextAreaElement>();
const error = ref('');
const copyStatus = ref<'idle' | 'copied' | 'manual'>('idle');
const packageVersion = __MW_PACKAGE_VERSION__;
let generation = 0;
let disposed = false;
const invalidate = () => {
  generation++;
  report.value = '';
  reviewed.value = false;
  copyStatus.value = 'idle';
  error.value = '';
};
watch([selectedScenario, applicationVersion, steps, expected, actual, includeBrowser, language], invalidate, { flush: 'sync' });
const generate = () => {
  if (disposed) return;
  invalidate();
  const result = createIntegrationReport({
    scenario: selectedScenario.value, packageVersion, applicationVersion: applicationVersion.value,
    steps: steps.value, expected: expected.value, actual: actual.value,
    browser: includeBrowser.value ? feedbackBrowserFamily(navigator.userAgent) : undefined,
    language: language.value,
  });
  if (!result.ok) {
    error.value = result.reason === 'private-input'
      ? t('Замените адреса, email и похожие на секреты значения синтетическими обозначениями. Проверьте все поля.', 'Replace addresses, email and secret-looking values with synthetic placeholders. Review every field.')
      : result.reason === 'bounds'
        ? t('Сократите шаги до 4000 символов, ожидаемое и фактическое поведение — до 2000.', 'Limit steps to 4000 characters and expected/actual behavior to 2000 each.')
        : t('Заполните шаги, ожидаемое и фактическое поведение. Версия приложения — короткое обозначение без пробелов.', 'Complete steps, expected and actual behavior. Application version must be a short token without spaces.');
    return;
  }
  report.value = result.text;
};
const copy = async () => {
  if (disposed || !reviewed.value || !report.value) return;
  const snapshot = report.value;
  const current = generation;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable.');
    await navigator.clipboard.writeText(snapshot);
    if (!disposed && current === generation && reviewed.value && report.value === snapshot) copyStatus.value = 'copied';
  }
  catch {
    if (disposed || current !== generation || !reviewed.value || report.value !== snapshot) return;
    copyStatus.value = 'manual';
    reportField.value?.focus();
    reportField.value?.select();
  }
};
onBeforeUnmount(() => {
  disposed = true;
  generation++;
});
</script>

<template>
  <section class="integration-feedback-example">
    <h3>{{ t('Попробуйте свой сценарий интеграции', 'Try an integration scenario') }}</h3>
    <p>{{ t('Это локальные примеры, а не действующие внедрения или собранные отзывы. Здесь ничего не отправляется автоматически.', 'These are local examples, not deployed integrations or collected feedback. Nothing is sent automatically here.') }}</p>
    <label :for="`${prefix}-scenario`">{{ t('Сценарий интеграции', 'Integration scenario') }}</label>
    <select :id="`${prefix}-scenario`" v-model="selectedScenario">
      <option v-for="entry in integrationScenarios" :key="entry.id" :value="entry.id">{{ entry.title[language] }}</option>
    </select>
    <div class="integration-task" :aria-label="scenario.title[language]">
      <h4>{{ t('Что попробовать', 'Actions to try') }}</h4>
      <ol><li v-for="step in scenario.steps[language]" :key="step">{{ step }}</li></ol>
      <h4>{{ t('Ожидаемый результат', 'Expected result') }}</h4>
      <ul><li v-for="result in scenario.expected[language]" :key="result">{{ result }}</li></ul>
      <p class="integration-features">{{ t('Возможности сценария', 'Scenario features') }}: {{ scenario.features.join(', ') }}</p>
    </div>
    <p>{{ t('Смена сценария меняет инструкции и отчёт, но сохраняет открытый черновик. Закрытие локального поля уничтожает его экземпляр; повторное открытие начинает новый пример.', 'Switching scenarios changes instructions and the report, while preserving an open draft. Closing the local field destroys its instance; reopening starts a new example.') }}</p>
    <details @toggle="toggleSandbox">
      <summary>{{ t('Открыть локальное поле', 'Open local field') }}</summary>
      <EditorFieldExample v-if="sandboxOpen" />
    </details>
    <p class="integration-links">
      <a :href="withBase(language === 'ru' ? '/ru/editor-field' : '/editor-field')">{{ t('Подключение поля', 'Field integration') }}</a>
      <a :href="withBase(language === 'ru' ? '/ru/plugins' : '/plugins')">{{ t('Таблицы и команды', 'Tables and commands') }}</a>
      <a :href="withBase(language === 'ru' ? '/ru/content-view' : '/content-view')">{{ t('Показ сохранённого', 'Displaying saved content') }}</a>
    </p>
    <h3>{{ t('Подготовить обезличенное сообщение', 'Prepare a synthetic reproduction report') }}</h3>
    <p>{{ t('Опишите проблему на выдуманном примере. Не вставляйте реальный текст, файлы, ID, адреса внутренних систем, email или секреты. Локальная проверка замечает лишь некоторые шаблоны и не гарантирует обезличивание; прочитайте весь результат перед копированием.', 'Describe the issue using synthetic content. Do not paste real text, files, IDs, internal addresses, email or secrets. The local check recognizes only some patterns and does not guarantee anonymization; read the complete result before copying.') }}</p>
    <p>{{ t('Версия пакета в сборке примера', 'Package manifest version in this example build') }}: <code>{{ packageVersion }}</code></p>
    <div class="integration-report-fields">
      <label :for="`${prefix}-application`">{{ t('Версия приложения — необязательно', 'Application version — optional') }}</label>
      <input :id="`${prefix}-application`" v-model="applicationVersion" maxlength="64" placeholder="1.0.0">
      <label :for="`${prefix}-steps`">{{ t('Шаги воспроизведения', 'Reproduction steps') }}</label>
      <textarea :id="`${prefix}-steps`" v-model="steps" maxlength="4000" rows="4" />
      <label :for="`${prefix}-expected`">{{ t('Ожидаемое поведение', 'Expected behavior') }}</label>
      <textarea :id="`${prefix}-expected`" v-model="expected" maxlength="2000" rows="3" />
      <label :for="`${prefix}-actual`">{{ t('Фактическое поведение', 'Actual behavior') }}</label>
      <textarea :id="`${prefix}-actual`" v-model="actual" maxlength="2000" rows="3" />
    </div>
    <label class="integration-check"><input v-model="includeBrowser" type="checkbox"> {{ t('Добавить только семейство браузера при подготовке отчёта', 'Include only the browser family when generating the report') }}</label>
    <button type="button" @click="generate">{{ t('Подготовить отчёт', 'Generate report') }}</button>
    <p v-if="error" class="integration-error" role="alert">{{ error }}</p>
    <div v-if="report" class="integration-report-preview">
      <label :for="`${prefix}-report`">{{ t('Предпросмотр отчёта', 'Report preview') }}</label>
      <textarea :id="`${prefix}-report`" ref="reportField" :value="report" readonly rows="16" />
      <label class="integration-check"><input v-model="reviewed" type="checkbox"> {{ t('Я прочитал отчёт и удалил частные данные', 'I reviewed the report and removed private data') }}</label>
      <button type="button" :disabled="!reviewed" @click="copy">{{ t('Копировать проверенный отчёт', 'Copy reviewed report') }}</button>
    </div>
    <p role="status">{{ copyStatus === 'copied' ? t('Отчёт скопирован. Он никуда не отправлен.', 'Report copied. It has not been sent anywhere.') : copyStatus === 'manual' ? t('Автоматическое копирование недоступно. Выделенный текст можно скопировать вручную.', 'Clipboard access is unavailable. Copy the selected text manually.') : '' }}</p>
  </section>
</template>

<style scoped>
.integration-feedback-example { margin-block: 1.5rem; min-width: 0; padding: 1rem; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.integration-feedback-example h3 { margin-top: 1.25rem; }
.integration-task { padding: .5rem 1rem; margin-block: 1rem; background: var(--vp-c-bg-soft); border-radius: 8px; }
.integration-task h4 { margin-block: .75rem .25rem; }
.integration-features { font-size: .875rem; }
.integration-feedback-example select, .integration-feedback-example input:not([type=checkbox]), .integration-feedback-example textarea { box-sizing: border-box; display: block; width: 100%; max-width: 100%; padding: .5rem; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); }
.integration-feedback-example textarea { resize: vertical; font: inherit; }
.integration-report-fields { display: grid; gap: .5rem; }
.integration-check { display: flex; align-items: start; gap: .5rem; margin-block: 1rem; }
.integration-check input { margin-top: .25rem; }
.integration-links { display: flex; gap: 1rem; flex-wrap: wrap; }
.integration-feedback-example button { padding: .5rem .75rem; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.integration-feedback-example button:disabled { opacity: .5; cursor: not-allowed; }
.integration-feedback-example summary { cursor: pointer; font-weight: 600; }
.integration-report-preview { margin-top: 1rem; }
.integration-error { color: var(--vp-c-danger-1); }
</style>
