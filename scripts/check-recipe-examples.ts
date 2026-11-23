import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { formatDiagnostics, performCompilation, readConfiguration } from '@angular/compiler-cli';

const repository = resolve('.');
const recipeRoot = join(repository, 'apps/docs/.vitepress/theme/recipes');
const temporary = await mkdtemp(join(tmpdir(), 'morfira-recipe-checks-'));
try {
  const svelteFile = join(recipeRoot, 'wrappers/RecipeSvelte.svelte');
  const svelte = compile(await readFile(svelteFile, 'utf8'), { filename: svelteFile, generate: 'client', dev: true, css: 'external' });
  assert.ok(svelte.js.code.includes('@morfira-dev/wysiwyg/svelte'), 'Compile the documented public Svelte adapter import.');
  await writeFile(join(temporary, 'RecipeSvelte.js'), svelte.js.code);

  const output = join(temporary, 'angular');
  await mkdir(output);
  const configuration = join(temporary, 'tsconfig.json');
  await writeFile(configuration, JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      strict: true, skipLibCheck: true, experimentalDecorators: true, verbatimModuleSyntax: true,
      rootDir: recipeRoot, outDir: output, paths: {},
    },
    angularCompilerOptions: { compilationMode: 'full', strictTemplates: true, strictInjectionParameters: true },
    files: [join(recipeRoot, 'wrappers/angular.ts')],
  }, null, 2));
  const config = readConfiguration(configuration);
  if (config.errors.length) throw new Error(formatDiagnostics(config.errors));
  const result = performCompilation({ rootNames: config.rootNames, options: config.options });
  const failures = result.diagnostics.filter((diagnostic) => diagnostic.category === 1);
  if (failures.length) throw new Error(formatDiagnostics(failures));
  const sources = result.program?.getTsProgram().getSourceFiles().map((source) => source.fileName.replaceAll('\\', '/')) ?? [];
  assert.ok(sources.length, 'Angular must compile the actual example and its transitive helpers.');
  assert.ok(sources.every((file) => !/\/packages\/[^/]+\/src\//.test(file)), 'Recipe packages must resolve public artifacts, not workspace source aliases.');
  assert.ok(sources.some((file) => /\/packages\/wysiwyg\/dist\//.test(file) || /\/@morfira-dev\/wysiwyg\/dist\//.test(file)), 'Require the public facade declarations in the AOT graph.');
  const angular = await readFile(join(output, 'wrappers/angular.js'), 'utf8');
  assert.match(angular, /class RecipeAngular\b/, 'Emit the documented Angular recipe class.');
  assert.match(angular, /(?:static\s+ɵcmp|RecipeAngular\.ɵcmp)\s*=[\s\S]*?ɵɵdefineComponent/, 'Emit the real Angular AOT component definition.');
  console.log('Recipe wrappers: documented Svelte template compiled; Angular 21 strict AOT example/transitive helpers compiled against public artifact declarations.');
}
finally {
  await rm(temporary, { recursive: true, force: true });
}
