import { Component, enableProdMode, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/angular';

enableProdMode();

@Component({ selector: 'angular-server', standalone: true, imports: [MorfiraEditor], template: '<morfira-editor value="&lt;p&gt;Server&lt;/p&gt;" />' })
class AngularServerApp {}

export const render = (): Promise<string> => renderApplication(
  (context) => bootstrapApplication(AngularServerApp, { providers: [provideServerRendering(), provideZonelessChangeDetection()] }, context),
  { document: '<!doctype html><html><body><angular-server></angular-server></body></html>', url: 'http://localhost/', allowedHosts: ['localhost'] },
);
