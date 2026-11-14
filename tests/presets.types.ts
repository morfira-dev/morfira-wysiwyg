import { createMinimalPreset } from '@morfira-dev/wysiwyg/presets/minimal';
import { createStandardPreset } from '@morfira-dev/wysiwyg/presets/standard';
import { createExtendedPreset } from '@morfira-dev/wysiwyg/presets/extended';
import type { EditorOptions } from '@morfira-dev/wysiwyg';
import type { StandardPresetOptions } from '@morfira-dev/wysiwyg/presets/standard';

const minimal: EditorOptions = createMinimalPreset({ plugins: Object.freeze([]), locale: 'ru' });
const standard: EditorOptions = createStandardPreset({ images: { maxFileSize: 1024 }, search: false, markdown: { blocks: false }, autolink: false });
const extended: EditorOptions = createExtendedPreset({ mentions: { provide: () => [] }, slash: { provide: () => [] } });
const options: StandardPresetOptions = { readOnly: true, statistics: { locale: 'en' } };
void minimal;
void standard;
void extended;
void options;
// @ts-expect-error minimal preset does not import or configure optional behavior
createMinimalPreset({ images: {} });
// @ts-expect-error feature configurations use false or a feature-owned options record
createStandardPreset({ images: true });
// @ts-expect-error search has no factory options; configure its query after editor creation
createStandardPreset({ search: { wholeWord: true } });
// @ts-expect-error extended requires explicit application providers
createExtendedPreset({});
// @ts-expect-error a mention provider is a function
createExtendedPreset({ mentions: { provide: [] }, slash: { provide: () => [] } });
