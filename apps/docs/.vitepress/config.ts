import { defineConfig } from 'vitepress';

const pages = ['guide', 'api', 'lists', 'styling', 'images', 'search', 'statistics', 'markdown', 'suggestions', 'events', 'plugins', 'ui', 'adapters', 'localization', 'theming', 'architecture', 'testing', 'performance', 'roadmap'];
const en = ['Getting started', 'Core API', 'Lists & formatting', 'Colors & links', 'Images & uploads', 'Find & replace', 'Text statistics', 'Markdown shortcuts', 'Mentions & slash', 'Events & extensions', 'Plugins & tables', 'Reusable UI forms', 'Framework adapters', 'Localization', 'Theming', 'Architecture & size', 'Testing & releases', 'Performance & history', 'Roadmap & limitations'];
const ru = ['Быстрый старт', 'API ядра', 'Списки и форматирование', 'Цвета и ссылки', 'Изображения и загрузка', 'Поиск и замена', 'Статистика текста', 'Markdown shortcuts', 'Упоминания и slash', 'События и расширения', 'Плагины и таблицы', 'Готовые UI-формы', 'Адаптеры фреймворков', 'Локализация', 'Темизация', 'Архитектура и вес', 'Тесты и релизы', 'Производительность и история', 'Планы и ограничения'];
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
