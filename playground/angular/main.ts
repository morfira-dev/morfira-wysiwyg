import { Component, DestroyRef, ErrorHandler, inject, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/angular';
import type { Editor, EditorChange, EditorTranslations } from '@morfira-dev/wysiwyg';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';
import type { AngularHarness } from './types.js';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

declare global {
  interface Window { angularHarness: AngularHarness; }
}

const applicationErrors: string[] = [];

@Component({
  selector: 'angular-harness',
  standalone: true,
  imports: [MorfiraEditor, ReactiveFormsModule, FormsModule],
  template: `
    <button (click)="external()">Update value</button>
    <button (click)="readOnly.set(!readOnly())">Toggle readonly</button>
    <button (click)="toggleDisabled()">Toggle disabled</button>
    <button (click)="locale.set(locale() === 'en' ? 'ru' : 'en')">Toggle locale</button>
    <button (click)="translations.set({'editor.label': 'Angular custom label'})">Override label</button>
    <button (click)="unmount()">Unmount</button>
    <button (click)="visible.set(true)">Remount</button>
    <button>Outside</button>
    @if (visible()) {
      @switch (mode) {
        @case ('form') {
          <morfira-editor #editor [formControl]="control" [readOnly]="readOnly()" [locale]="locale()" [translations]="translations()" [plugins]="plugins" (ready)="ready($event)" (change)="changed($event)" />
        }
        @case ('model') {
          <morfira-editor #editor [(ngModel)]="model" [readOnly]="readOnly()" [locale]="locale()" [translations]="translations()" [plugins]="plugins" (ready)="ready($event)" (change)="changed($event)" />
        }
        @default {
          <morfira-editor #editor [value]="value()" (valueChange)="value.set($event)" [readOnly]="readOnly()" [locale]="locale()" [translations]="translations()" [plugins]="plugins" (ready)="ready($event)" (change)="changed($event)" />
        }
      }
    }
  `,
})
class AngularHarnessApp {
  readonly mode = new URLSearchParams(location.search).get('mode') ?? 'controlled';
  readonly control = new FormControl('<p>Initial content</p>', { nonNullable: true });
  readonly value = signal('<p>Initial content</p>');
  model = '<p>Initial content</p>';
  readonly readOnly = signal(false);
  readonly locale = signal('en');
  readonly translations = signal<EditorTranslations>({});
  readonly visible = signal(true);
  readonly plugins = [tables(), ...(new URLSearchParams(location.search).has('throw-dispose') ? [{
    name: 'throwing-disposer',
    setup: () => () => { throw new Error('Expected Angular dispose failure'); },
  }] : [])];
  readonly component = viewChild<MorfiraEditor>('editor');
  private count = 0;
  private detached: MorfiraEditor | undefined;

  constructor() {
    window.changes = [];
    const subscription = this.control.valueChanges.subscribe(() => this.count++);
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    window.angularHarness = {
      mode: this.mode,
      value: () => this.mode === 'form' ? this.control.value : this.mode === 'model' ? this.model : this.value(),
      changes: () => window.changes.length,
      formChanges: () => this.count,
      touched: () => this.control.touched,
      getEditor: () => this.component()?.getEditor(),
      detachedEditor: () => this.detached?.getEditor(),
      errors: () => [...applicationErrors],
    };
  }

  readonly ready = (editor: Editor): void => { window.editor = editor; };
  readonly unmount = (): void => {
    this.detached = this.component();
    this.visible.set(false);
  };
  readonly changed = (change: EditorChange): void => { window.changes.push(change); };
  readonly external = (): void => {
    if (this.mode === 'form') this.control.setValue('<p>External update</p>');
    else if (this.mode === 'model') this.model = '<p>External update</p>';
    else this.value.set('<p>External update</p>');
  };
  readonly toggleDisabled = (): void => {
    if (this.control.disabled) this.control.enable();
    else this.control.disable();
  };
}

void bootstrapApplication(AngularHarnessApp, { providers: [
  provideZonelessChangeDetection(),
  { provide: ErrorHandler, useValue: { handleError: (error: unknown) => {
    applicationErrors.push(error instanceof AggregateError ? error.errors.map(String).join('; ') : String(error));
  } } },
] }).then((application) => {
  window.dispose = () => application.destroy();
});
