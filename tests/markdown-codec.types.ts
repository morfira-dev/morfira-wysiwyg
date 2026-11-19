import { parseMarkdown, serializeMarkdown } from '@morfira-dev/wysiwyg/codecs/markdown';
import type { EditorDocument } from '@morfira-dev/wysiwyg';

const checkMarkdownCodecTypes = () => {
  const document: EditorDocument = parseMarkdown('# Heading');
  const source: string = serializeMarkdown(document);
  // @ts-expect-error Markdown source must be a string
  parseMarkdown({ text: source });
  // @ts-expect-error Markdown export requires the versioned document, not HTML
  serializeMarkdown('<p>Text</p>');
  return source;
};

void checkMarkdownCodecTypes;
