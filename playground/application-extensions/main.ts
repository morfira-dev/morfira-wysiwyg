import { createEditor } from '@morfira-dev/wysiwyg';
import { createContentView } from '@morfira-dev/wysiwyg/content-view';
import { createApplicationExtensions } from '../../apps/docs/.vitepress/theme/application-extensions/index.js';
import type {} from './types.js';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/content-view.css';

window.applicationExtensionFixture = { createEditor, createContentView, createApplicationExtensions };
