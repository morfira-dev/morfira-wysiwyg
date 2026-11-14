# Colors and links

The optional `createLinkForm` UI is available through `@morfira-dev/wysiwyg/ui/links`. It uses these same commands, preserves selection while fields receive focus and supports localization. [Connect the form without a framework](/en/ui#links-without-a-framework).

`format('color', value)` sets the text color; `format('background', value)` sets the highlight color. Pass a CSS color name, hex, rgb/hsl, or `false` to remove that inline property. Arbitrary CSS and `var()` are rejected. Inherited block styles remain intact.

```ts
editor.format('color', '#6658e8');
editor.format('background', 'yellow');
editor.format('color', false);
```

Selections can cross paragraphs, lists and cells while preserving structure and other formatting. At a caret, colors apply to subsequent typing. Moving the selection or externally replacing the document resets pending styles. Undo/redo restores content and the caret. `getFormats()` reports `color`, `background` and the `mixed` array; browsers may normalize colors to rgb.

```ts
import type { LinkFormat } from '@morfira-dev/wysiwyg';
const link: LinkFormat = {
  href: 'https://example.com', title: 'Example', target: '_blank',
};
editor.format('link', link);
editor.format('link', '/guide'); // changes only the URL
editor.format('link', false);
```

With a selection, change or remove only the selected link segments while retaining surrounding links and text styles. At a caret inside a link, edit the entire anchor. Omitted title/target retain existing metadata; `title: ''` removes the title. `getFormats()` reports `link`, `linkTitle`, `linkTarget` and mixed values.

At a caret outside links, create a text-label link:

```ts
editor.format('link', { href: '/guide', text: 'Documentation' });
```

`text` is literal text and is only accepted when inserting at a caret outside an existing link. The caret stays after the new link. Outside links, a command without text or a selection does nothing.

Allowed URLs use http/https/mailto/tel or relative references. Unsafe URLs and invalid API options throw before document mutation. Target accepts only `_self`/`_blank`; `_blank` receives `rel="noopener noreferrer"` automatically during HTML/JSON import and editing. Commands respect read-only and history. Automatic URL previews are not implemented.

The [homepage](/en/#editor) and [playground](/en/playground) include a “Colors and links” sample, text/highlight controls, link title and new-tab options. Form focus preserves the editor selection. Reset buttons affect inline document colors; theme CSS variables are controlled separately.

API behavior change: an invalid link-command URL could previously be ignored. Now handle the exception, for example in the form’s try/catch. HTML/JSON imports still sanitize unsupported attributes.
