import { createContentView } from '@morfira-dev/wysiwyg/content-view';
import { createDocumentSchema } from '@morfira-dev/wysiwyg';
import '@morfira-dev/wysiwyg/content-view.css';

Object.assign(window, { createContentView, createDocumentSchema });
