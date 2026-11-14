import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/angular';
import { changed, plugins, ready } from './common.js';

@Component({
  selector: 'angular-consumer',
  standalone: true,
  imports: [MorfiraEditor],
  template: `
    <button data-action="external" (click)="replace()">External value</button>
    <button data-action="readonly" (click)="readOnly.set(!readOnly())">Read only</button>
    <button data-action="unmount" (click)="mounted.set(false)">Unmount</button>
    @if (mounted()) {
      <morfira-editor [value]="value()" (valueChange)="value.set($event)"
        [readOnly]="readOnly()" [plugins]="plugins" locale="en" label="Consumer editor"
        (ready)="ready($event)" (change)="changed($event)" />
    }
  `,
})
class AngularConsumer {
  readonly value = signal('<p>Initial</p>');
  readonly readOnly = signal(false);
  readonly mounted = signal(true);
  readonly plugins = plugins;
  readonly ready = ready;
  readonly changed = changed;
  private external = 0;

  readonly replace = (): void => {
    this.value.set(`<p>External ${++this.external}</p>`);
  };
}

void bootstrapApplication(AngularConsumer, { providers: [provideZonelessChangeDetection()] });
