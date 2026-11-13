import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import EditorDemo from './EditorDemo.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-after': () => h('div', { class: 'homepage-lab', id: 'editor' }, [h(EditorDemo, { full: true })]) }),
  enhanceApp: ({ app }) => { app.component('EditorDemo', EditorDemo); },
} satisfies Theme;
