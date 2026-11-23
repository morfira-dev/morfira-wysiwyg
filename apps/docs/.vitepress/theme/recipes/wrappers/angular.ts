import { Component, signal } from '@angular/core';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/angular';
import { createRecipeBundle } from '../index.js';
import { createLocalRecipeServices } from '../local-services.js';

@Component({ selector: 'recipe-editor', standalone: true, imports: [MorfiraEditor],
  template: '<morfira-editor [value]="value()" (valueChange)="value.set($event)" [plugins]="plugins" label="Recipe editor" />' })
export class RecipeAngular {
  readonly value = signal('<p>Recipe editor</p>');
  readonly plugins = createRecipeBundle(createLocalRecipeServices().options).plugins;
}
