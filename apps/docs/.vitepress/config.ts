import { defineConfig } from 'vitepress';

const pages = ['guide', 'api', 'lists', 'list-properties', 'text-direction', 'checklists', 'horizontal-rule', 'fonts', 'styling', 'autolink', 'images', 'image-input', 'table-picker', 'table-properties', 'office-paste', 'search', 'statistics', 'markdown', 'markdown-codec', 'suggestions', 'events', 'plugin-sdk', 'plugins', 'ui', 'presets', 'editor-ui', 'contextual-toolbar', 'contextual-links', 'contextual-images', 'contextual-tables', 'adapters', 'localization', 'theming', 'architecture', 'testing', 'performance', 'security', 'roadmap'];
const en = ['Getting started', 'Core API', 'Lists & formatting', 'List properties', 'Text direction', 'Checklists', 'Horizontal rule', 'Font family & size', 'Colors & links', 'Automatic links', 'Images & uploads', 'Image clipboard & drop', 'Table size picker', 'Table & cell properties', 'Office paste', 'Find & replace', 'Text statistics', 'Markdown shortcuts', 'Markdown import & export', 'Mentions & slash', 'Events & extensions', 'Plugin SDK & schema', 'Plugins & tables', 'Reusable UI forms', 'Ready presets', 'Ready editor UI', 'Contextual toolbar', 'Contextual link actions', 'Contextual image properties', 'Contextual table toolbar', 'Framework adapters', 'Localization', 'Theming', 'Architecture & size', 'Testing & releases', 'Performance & history', 'Security', 'Roadmap & limitations'];
const ru = ['Быстрый старт', 'API ядра', 'Списки и форматирование', 'Свойства списка', 'Направление текста', 'Чек-листы', 'Разделитель', 'Шрифты и размер', 'Цвета и ссылки', 'Автоматические ссылки', 'Изображения и загрузка', 'Изображения из буфера и drop', 'Выбор размера таблицы', 'Свойства таблиц и ячеек', 'Офисная вставка', 'Поиск и замена', 'Статистика текста', 'Markdown shortcuts', 'Markdown: импорт и экспорт', 'Упоминания и slash', 'События и расширения', 'SDK плагинов и схема', 'Плагины и таблицы', 'Готовые UI-формы', 'Готовые пресеты', 'Готовая панель', 'Контекстная панель', 'Действия со ссылкой', 'Свойства изображения', 'Контекстная панель таблиц', 'Адаптеры фреймворков', 'Локализация', 'Темизация', 'Архитектура и вес', 'Тесты и релизы', 'Производительность и история', 'Безопасность', 'Планы и ограничения'];
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
