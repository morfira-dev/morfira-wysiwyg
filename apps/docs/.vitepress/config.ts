import { defineConfig } from 'vitepress';

const pages = ['block-navigation', 'text-tools', 'guide', 'api', 'lists', 'list-quote-input', 'list-properties', 'text-direction', 'checklists', 'horizontal-rule', 'fonts', 'styling', 'autolink', 'text-drop', 'images', 'media', 'formulas', 'media-formula', 'image-input', 'table-picker', 'table-properties', 'office-paste', 'search', 'search-highlights', 'special-characters', 'fullscreen', 'preview', 'print', 'outline', 'save-state', 'statistics', 'markdown', 'markdown-codec', 'suggestions', 'persistent-mentions', 'atomic-mentions', 'atomic-mention-clipboard', 'events', 'plugin-sdk', 'plugin-extensions', 'plugins', 'ui', 'presets', 'editor-ui', 'contextual-toolbar', 'contextual-links', 'contextual-images', 'contextual-tables', 'adapters', 'localization', 'theming', 'architecture', 'testing', 'accessibility', 'performance', 'security', 'roadmap'];
const en = ['Object navigation', 'Paragraph layout & format painter', 'Getting started', 'Core API', 'Lists & formatting', 'List quote boundaries', 'List properties', 'Text direction', 'Checklists', 'Horizontal rule', 'Font family & size', 'Colors & links', 'Automatic links', 'Text drag & drop', 'Images & uploads', 'Video embeds', 'Mathematical formulas', 'Media & formula demo', 'Image clipboard & drop', 'Table size picker', 'Table & cell properties', 'Office paste', 'Find & replace', 'Search highlights', 'Special characters', 'Fullscreen workspace', 'Document preview', 'Browser print', 'Document outline', 'Save state', 'Text statistics', 'Markdown shortcuts', 'Markdown import & export', 'Mentions & slash', 'Persistent mention IDs', 'Atomic mentions', 'Mention clipboard', 'Events & extensions', 'Plugin SDK & schema', 'Nodes, views & mapping', 'Plugins & tables', 'Reusable UI forms', 'Ready presets', 'Ready editor UI', 'Contextual toolbar', 'Contextual link actions', 'Contextual image properties', 'Contextual table toolbar', 'Framework adapters', 'Localization', 'Theming', 'Architecture & size', 'Testing & releases', 'Accessibility & devices', 'Performance & history', 'Security', 'Roadmap & limitations'];
const ru = ['Навигация вокруг объектов', 'Интервалы и перенос форматирования', 'Быстрый старт', 'API ядра', 'Списки и форматирование', 'Границы цитат в списке', 'Свойства списка', 'Направление текста', 'Чек-листы', 'Разделитель', 'Шрифты и размер', 'Цвета и ссылки', 'Автоматические ссылки', 'Перетаскивание текста', 'Изображения и загрузка', 'Вставка видео', 'Математические формулы', 'Демо media и формул', 'Изображения из буфера и drop', 'Выбор размера таблицы', 'Свойства таблиц и ячеек', 'Офисная вставка', 'Поиск и замена', 'Подсветка поиска', 'Спецсимволы', 'Полноэкранный режим', 'Предпросмотр документа', 'Печать документа', 'Оглавление документа', 'Состояние сохранения', 'Статистика текста', 'Markdown shortcuts', 'Markdown: импорт и экспорт', 'Упоминания и slash', 'Сохраняемые упоминания', 'Атомарные упоминания', 'Буфер упоминаний', 'События и расширения', 'SDK плагинов и схема', 'Узлы, представления и mapping', 'Плагины и таблицы', 'Готовые UI-формы', 'Готовые пресеты', 'Готовая панель', 'Контекстная панель', 'Действия со ссылкой', 'Свойства изображения', 'Контекстная панель таблиц', 'Адаптеры фреймворков', 'Локализация', 'Темизация', 'Архитектура и вес', 'Тесты и релизы', 'Доступность и устройства', 'Производительность и история', 'Безопасность', 'Планы и ограничения'];
export default defineConfig({
  title: 'Morfira WYSIWYG',
  description: 'A modular TypeScript editor. A small core, room for more.',
  cleanUrls: true,
  lastUpdated: false,
  locales: {
    root: {
      label: 'Русский', lang: 'ru', themeConfig: {
        nav: [{ text: 'Документация', link: '/guide' }, { text: 'Редактор', link: '/playground' }],
        sidebar: [{ text: 'Morfira WYSIWYG', items: pages.map((page, i) => ({ text: ru[i], link: `/${page}` })) }, { text: 'Попробовать', items: [{ text: 'Интерактивный редактор', link: '/playground' }] }],
        outline: { label: 'На этой странице' }, docFooter: { prev: 'Назад', next: 'Далее' },
      }
    },
    en: {
      label: 'English', lang: 'en', themeConfig: {
        nav: [{ text: 'Documentation', link: '/en/guide' }, { text: 'Playground', link: '/en/playground' }],
        sidebar: [{ text: 'Morfira WYSIWYG', items: pages.map((page, i) => ({ text: en[i], link: `/en/${page}` })) }, { text: 'Try it', items: [{ text: 'Interactive editor', link: '/en/playground' }] }],
      }
    },
  },
  themeConfig: { search: { provider: 'local' }, logo: '/logo.svg', footer: { message: 'TypeScript · Modular by design · Local preview' } },
  vite: { server: { fs: { allow: ['../..'] } } },
});
