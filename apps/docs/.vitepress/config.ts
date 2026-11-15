import { defineConfig } from 'vitepress';

const pages = ['guide', 'api', 'lists', 'checklists', 'horizontal-rule', 'fonts', 'styling', 'autolink', 'images', 'search', 'statistics', 'markdown', 'suggestions', 'events', 'plugin-sdk', 'plugins', 'ui', 'presets', 'editor-ui', 'adapters', 'localization', 'theming', 'architecture', 'testing', 'performance', 'security', 'roadmap'];
const en = ['Getting started', 'Core API', 'Lists & formatting', 'Checklists', 'Horizontal rule', 'Font family & size', 'Colors & links', 'Automatic links', 'Images & uploads', 'Find & replace', 'Text statistics', 'Markdown shortcuts', 'Mentions & slash', 'Events & extensions', 'Plugin SDK & schema', 'Plugins & tables', 'Reusable UI forms', 'Ready presets', 'Ready editor UI', 'Framework adapters', 'Localization', 'Theming', 'Architecture & size', 'Testing & releases', 'Performance & history', 'Security', 'Roadmap & limitations'];
const ru = ['Быстрый старт', 'API ядра', 'Списки и форматирование', 'Чек-листы', 'Разделитель', 'Шрифты и размер', 'Цвета и ссылки', 'Автоматические ссылки', 'Изображения и загрузка', 'Поиск и замена', 'Статистика текста', 'Markdown shortcuts', 'Упоминания и slash', 'События и расширения', 'SDK плагинов и схема', 'Плагины и таблицы', 'Готовые UI-формы', 'Готовые пресеты', 'Готовая панель', 'Адаптеры фреймворков', 'Локализация', 'Темизация', 'Архитектура и вес', 'Тесты и релизы', 'Производительность и история', 'Безопасность', 'Планы и ограничения'];
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
