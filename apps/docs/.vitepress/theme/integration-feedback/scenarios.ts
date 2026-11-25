import type { IntegrationScenario } from './types.js';

export const integrationScenarios: readonly IntegrationScenario[] = [
  {
    id: 'article',
    features: ['standard preset', 'images', 'save-state', 'content-view'],
    title: { ru: 'Статья для CMS', en: 'CMS article' },
    steps: {
      ru: ['Откройте локальное поле и напишите заголовок с двумя абзацами.', 'Выделите фразу и примените форматирование. При желании имитируйте загрузку изображения.', 'Сохраните текст, измените черновик и восстановите сохранённую версию.'],
      en: ['Open the local field and write a heading with two paragraphs.', 'Select a phrase and apply formatting. Optionally simulate an image upload.', 'Save the text, edit the draft and restore the saved version.'],
    },
    expected: {
      ru: ['Панель применяет действие к выбранному тексту.', 'Сохранённая версия отделена от новых правок; восстановление возвращает принятый снимок.', 'Загрузка в примере локальная, содержимое файлов не передаётся.'],
      en: ['Toolbar actions affect the chosen text.', 'Saved content remains separate from new edits; restoring returns the accepted snapshot.', 'The example upload is local and sends no file content.'],
    },
  },
  {
    id: 'knowledge-base',
    features: ['standard preset', 'tables', 'table clipboard', 'history'],
    title: { ru: 'База знаний с таблицами', en: 'Knowledge base with tables' },
    steps: {
      ru: ['В локальном поле откройте действие таблицы в панели или меню «Ещё».', 'Вставьте таблицу 3 × 3 и заполните несколько ячеек синтетическими значениями.', 'Сохраните, измените содержимое и выполните Undo. Для объединения и офисной вставки откройте руководство таблиц ниже.'],
      en: ['In the local field, open Table in the toolbar or More menu.', 'Insert a 3 × 3 table and fill several cells with synthetic values.', 'Save, edit content and use Undo. Open the table guide below for merging and Office paste.'],
    },
    expected: {
      ru: ['Tab перемещает ввод между ячейками по поддержанным правилам таблиц.', 'Undo возвращает изменение; сохранение не смешивает старый снимок с новым черновиком.', 'Для вставки из офисного приложения используйте обезличенный образец, а не рабочие данные.'],
      en: ['Tab moves input between cells under the supported table rules.', 'Undo restores the change; saving does not mix an older snapshot with a newer draft.', 'Use an anonymized sample for Office paste instead of production data.'],
    },
  },
  {
    id: 'application-form',
    features: ['Vue adapter', 'field semantics', 'read-only', 'save-state'],
    title: { ru: 'Поле формы приложения', en: 'Application form field' },
    steps: {
      ru: ['Очистите текст локального поля и нажмите «Сохранить публикацию».', 'Заполните поле и включите «Только чтение».', 'Выключите read-only, включите «Следующее сохранение с ошибкой», сохраните и повторите.'],
      en: ['Clear the local field and choose Save publication.', 'Enter text and enable Read only.', 'Disable read-only, choose Fail next save, save and retry.'],
    },
    expected: {
      ru: ['Пустое текстовое поле получает понятную ошибку и фокус; запрос не выполняется.', 'Read-only блокирует редактирование, не уничтожая текст.', 'Ошибка не теряет черновик; повтор сохраняет актуальное содержимое.'],
      en: ['An empty text field receives a clear error and focus; no save runs.', 'Read-only blocks editing while retaining content.', 'A failure retains the draft; retry saves the current content.'],
    },
  },
];
