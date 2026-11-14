import { createElementLifecycle } from './lifecycle.js';
import type { MorfiraEditorElement as ElementContract, MorfiraEditorElementConstructor } from './types.js';

export type { MorfiraEditorElement, MorfiraEditorElementConstructor } from './types.js';

const registrations = new WeakMap<CustomElementRegistry, Map<string, MorfiraEditorElementConstructor>>();

/** Registration is explicit so importing this entry remains safe during SSR. */
export const defineMorfiraEditor = (tagName = 'morfira-wysiwyg'): MorfiraEditorElementConstructor => {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') throw new Error('Defining the editor custom element requires a browser DOM.');
  const owned = registrations.get(customElements) ?? new Map<string, MorfiraEditorElementConstructor>();
  const existing = customElements.get(tagName);
  if (existing) {
    if (owned.get(tagName) === existing) return existing as MorfiraEditorElementConstructor;
    throw new Error(`Custom element ${tagName} is already registered by another owner.`);
  }
  class MorfiraEditorElement extends HTMLElement implements ElementContract {
    static readonly observedAttributes = ['value', 'readonly', 'locale', 'label', 'placeholder'];
    declare value: ElementContract['value'];
    declare readOnly: ElementContract['readOnly'];
    declare locale: ElementContract['locale'];
    declare translations: ElementContract['translations'];
    declare plugins: ElementContract['plugins'];
    declare label: ElementContract['label'];
    declare placeholder: ElementContract['placeholder'];
    private readonly lifecycle = createElementLifecycle(this);
    readonly getEditor = () => this.lifecycle.getEditor();

    connectedCallback(): void {
      this.lifecycle.connect();
    }
    disconnectedCallback(): void {
      this.lifecycle.disconnect();
    }
    attributeChangedCallback(name: string, _previous: string | null, value: string | null): void {
      this.lifecycle.attribute(name, value);
    }
  }
  owned.set(tagName, MorfiraEditorElement);
  registrations.set(customElements, owned);
  try {
    customElements.define(tagName, MorfiraEditorElement);
  }
  catch (error) {
    owned.delete(tagName);
    throw error;
  }
  return MorfiraEditorElement;
};
