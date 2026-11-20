import { createPrintUI, printUIMessages } from '@morfira-dev/wysiwyg/ui/print';
import type { PrintUIController, PrintUIMessageKey, PrintUIOptions } from '@morfira-dev/wysiwyg/ui/print';
import type { Editor } from '@morfira-dev/wysiwyg';

export interface PrintTestOptions {
  value?: string;
  css?: boolean;
}

declare global {
  interface Window {
    printModule: typeof import('@morfira-dev/wysiwyg/ui/print');
    printUI: PrintUIController;
    printHost: HTMLElement;
    printCalls: number;
    printErrors: unknown[];
    printAction?: () => void;
    printErrorAction?: () => void;
  }
}

const assertPrintTypes = (host: HTMLElement, editor: Editor, key: PrintUIMessageKey) => {
  const options: PrintUIOptions = { label: printUIMessages.en[key], onError: () => {} };
  const ui: PrintUIController = createPrintUI(host, editor, options);
  const accepted: boolean = ui.print();
  const printing: boolean = ui.isPrinting();
  ui.cancel();
  ui.destroy();
  // @ts-expect-error printing never accepts untrusted HTML strings
  createPrintUI(host, editor, { html: '<script>bad()</script>' });
  // @ts-expect-error this print profile does not load images
  createPrintUI(host, editor, { images: 'load' });
  // @ts-expect-error the owned UI element is readonly
  ui.element = host;
  void [accepted, printing];
};
void assertPrintTypes;
