import { sanitizeHTML } from '../document/index.js';

/** Reuse only a successfully validated string for the exact current serialized DOM. */
export const createHTMLSnapshots = (surface: HTMLElement) => {
  let previousInput: string | undefined;
  let previousHTML = '';

  const read = (): string => {
    const input = surface.innerHTML;
    if (input === previousInput)
      return previousHTML;

    // Keep the last successful pair intact when validation rejects a new input.
    const html = sanitizeHTML(input);
    previousInput = input;
    previousHTML = html;
    return html;
  };

  const clear = (): void => {
    previousInput = undefined;
    previousHTML = '';
  };

  return { read, clear };
};
