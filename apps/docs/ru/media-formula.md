<script setup>
import MediaFormulaExample from '../.vitepress/theme/MediaFormulaExample.vue';
</script>

# Медиа и формулы

Два независимых необязательных модуля дополняют редактор без расширения ядра и готовых пресетов. Медиа хранит описание YouTube/Vimeo, формулы — буквальный исходник небольшого TeX-подобного языка. Все визуальные представления ниже находятся **вне сохраняемого документа**.

<MediaFormulaExample />

## Что попробовать

1. Загрузите пример: в редакторе появятся семантические узлы, справа/ниже — их отдельные представления. Нативный MathML показывает дробь, корень и индексы без загрузки шрифтов или библиотеки формул.
2. Нажмите вставку формулы, введите `x_1^2 + \frac{a}{b}` и примените. Для правки используйте явное действие редактирования примера; черновик связан с актуальным узлом и позицией, участвует в undo/redo.
3. Откройте вставку медиа и задайте HTTPS-ссылку YouTube/Vimeo и подпись. Вставка сохраняет только разрешённый провайдер, ID и текст, а не `iframe` или произвольную разметку.
4. В карточке медиа нажмите **Загрузить внешнее видео** только при желании обратиться к провайдеру. До нажатия нет `iframe`, миниатюр, `fetch`, oEmbed или preconnect. Выгрузка удаляет только принадлежащий этой карточке `iframe`.
5. Попробуйте отмену и read-only. Просмотр существующего медиа по явному согласию остаётся возможен; пользовательские изменения документа блокируются.

## Подключение

```ts
import { createEditor } from '@morfira-dev/wysiwyg';
import { media } from '@morfira-dev/wysiwyg/plugins/media';
import { formulas } from '@morfira-dev/wysiwyg/plugins/formula';
import { createMediaForm, createMediaView } from '@morfira-dev/wysiwyg/ui/media';
import { createFormulaForm, createFormulaView } from '@morfira-dev/wysiwyg/ui/formula';
import '@morfira-dev/wysiwyg/ui/media.css';
import '@morfira-dev/wysiwyg/ui/formula.css';

const editor = createEditor(editorHost, { plugins: [media(), formulas()] });
const mediaForm = createMediaForm(mediaFormHost, editor);
const formulaForm = createFormulaForm(formulaFormHost, editor);
const mediaView = createMediaView(mediaViewHost, editor);
const formulaView = createFormulaView(formulaViewHost, editor);
// Все UI-контейнеры — вне editor.surface в том же документе.
// При снятии собственной интеграции:
mediaForm.destroy();
formulaForm.destroy();
mediaView.destroy();
formulaView.destroy();
editor.destroy();
```

Сами модули не требуют друг друга. Импортируйте только выбранные возможности; CSS подключается явно. Переключение языка обновляет публичные подписи, а уничтожение редактора очищает принадлежащие ему формы и представления. Конкретные API и ограничения описаны в [медиа](/ru/media) и [формулах](/ru/formulas).

## Границы и безопасность

Формулы — ограниченный синтаксис, **не полный LaTeX**: до 1024 UTF-16 единиц, 512 токенов/узлов и глубины 24. Неизвестные команды отклоняются. Представление использует фиксированный набор MathML-тегов и буквальный `textContent`, без HTML-интерпретации, макросов, URL, пользовательских стилей и сетевых ресурсов. Неподдерживаемый импорт остаётся инертным исходником с сообщением об ошибке. В первой версии формула внутри редактора остаётся атомом-исходником; MathML находится во внешнем контейнере, а не в редактируемом `contentDOM`.

Медиа поддерживает только проверенные URL YouTube/Vimeo; произвольные HTML-вставки и другие провайдеры не поддерживаются. После явной загрузки браузер обращается к провайдеру: CSP `frame-src`, политика приватности приложения, сетевые ограничения и доступность видео остаются ответственностью интеграции. Фронтенд-фильтрация не заменяет серверную проверку и не является сертификацией безопасности.
