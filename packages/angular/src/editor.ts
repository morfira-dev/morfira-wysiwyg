import { afterNextRender, Component, DestroyRef, effect, ElementRef, forwardRef, inject, input, output, signal, untracked } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import type { ControlValueAccessor } from '@angular/forms';
import { createEditor } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorChange, EditorPlugin, EditorTranslations } from '@morfira-dev/wysiwyg-core';
import type { AngularTouched, AngularValueChange, MorfiraEditorHandle } from './types.js';

@Component({
  selector: 'morfira-editor',
  standalone: true,
  template: '<div class="mw-host"></div>',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MorfiraEditor), multi: true }],
})
export class MorfiraEditor implements ControlValueAccessor, MorfiraEditorHandle {
  readonly value = input<string>();
  readonly readOnly = input(false);
  readonly locale = input('ru');
  readonly translations = input<EditorTranslations>({});
  readonly placeholder = input<string>();
  readonly label = input<string>();
  readonly plugins = input<EditorPlugin[]>([]);
  readonly valueChange = output<string>();
  readonly change = output<EditorChange>();
  readonly ready = output<Editor>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly disabled = signal(false);
  private instance: Editor | undefined;
  private formValue: string | undefined;
  private applying = false;
  private onValue: AngularValueChange = () => {};
  private onTouched: AngularTouched = () => {};
  private removeBlur: (() => void) | undefined;

  constructor() {
    effect(() => {
      const value = this.value();
      const readOnly = this.readOnly() || this.disabled();
      const locale = this.locale();
      const translations = this.translations();
      untracked(() => {
        this.instance?.setReadOnly(readOnly);
        this.instance?.setLocale(locale, translations);
        if (this.formValue === undefined && value !== undefined) this.replace(value);
      });
    });
    afterNextRender(() => {
      if (this.destroyRef.destroyed) return;
      const target = this.host.nativeElement.querySelector<HTMLElement>('.mw-host')!;
      this.instance = createEditor(target, {
        value: this.formValue ?? this.value() ?? '',
        readOnly: this.readOnly() || this.disabled(),
        locale: this.locale(), translations: this.translations(),
        placeholder: this.placeholder(), label: this.label(), plugins: this.plugins(),
        onChange: (change) => {
          if (this.applying) return;
          this.onValue(change.html);
          this.valueChange.emit(change.html);
          this.change.emit(change);
        },
      });
      const blur = (event: FocusEvent) => {
        if (!(event.relatedTarget instanceof Node) || !this.host.nativeElement.contains(event.relatedTarget)) this.onTouched();
      };
      this.host.nativeElement.addEventListener('focusout', blur);
      this.removeBlur = () => this.host.nativeElement.removeEventListener('focusout', blur);
      this.ready.emit(this.instance);
    });
    this.destroyRef.onDestroy(() => {
      const previous = this.instance;
      const removeBlur = this.removeBlur;
      this.instance = undefined;
      this.removeBlur = undefined;
      try {
        removeBlur?.();
      }
      finally {
        previous?.destroy();
      }
    });
  }

  readonly getEditor = (): Editor | undefined => this.instance;

  readonly writeValue = (value: unknown): void => {
    if (value !== null && value !== undefined && typeof value !== 'string') throw new TypeError('The Angular editor value must be a string or null.');
    this.formValue = value ?? '';
    this.replace(this.formValue);
  };

  readonly registerOnChange = (callback: AngularValueChange): void => {
    this.onValue = callback;
  };

  readonly registerOnTouched = (callback: AngularTouched): void => {
    this.onTouched = callback;
  };

  readonly setDisabledState = (disabled: boolean): void => {
    this.disabled.set(disabled);
    this.instance?.setReadOnly(disabled || this.readOnly());
  };

  private readonly replace = (value: string): void => {
    if (!this.instance || value === this.instance.getHTML()) return;
    this.applying = true;
    try {
      this.instance.setHTML(value);
    }
    finally {
      this.applying = false;
    }
  };
}
