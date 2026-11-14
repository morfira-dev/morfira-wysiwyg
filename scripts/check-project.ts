import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const errors: string[] = [];
const inspect = (sourceText: string, filename: string): void => {
  const source = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const projectPath = relative(process.cwd(), resolve(filename)).split(sep).join('/');
  const featureSource = /^packages\/(core|plugins)\/src\//.test(projectPath);
  const typeOwner = /^(types|internal-types)\.ts$|\.types\.ts$/.test(basename(filename));
  if (featureSource && !typeOwner) {
    for (const statement of source.statements) {
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
        const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
        errors.push(`${filename}:${line}: move named types to the owning feature's types.ts.`);
      }
    }
  }
  const inspectCoreImport = (specifier: ts.Node | undefined): void => {
    if (!projectPath.startsWith('packages/core/src/') || !specifier || !ts.isStringLiteralLike(specifier)) return;
    const name = specifier.text;
    const target = name.startsWith('.') ? relative(process.cwd(), resolve(dirname(filename), name)).split(sep).join('/') : name;
    const workspaceDependency = target.startsWith('packages/') && !target.startsWith('packages/core/');
    const packageDependency = /^@morfira-dev\/wysiwyg(?:-|\/|$)/.test(target) && !/^@morfira-dev\/wysiwyg-core(?:\/|$)/.test(target);
    if (workspaceDependency || packageDependency) {
      const line = source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1;
      errors.push(`${filename}:${line}: core must not import plugins, adapters or the public facade.`);
    }
  };
  const visit = (node: ts.Node): void => {
    const platformCallback = ts.isMethodDeclaration(node)
      && projectPath === 'packages/web-component/src/index.ts'
      && ts.isClassDeclaration(node.parent) && node.parent.name?.text === 'MorfiraEditorElement'
      && ts.isIdentifier(node.name) && ['connectedCallback', 'disconnectedCallback', 'attributeChangedCallback'].includes(node.name.text);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || (ts.isMethodDeclaration(node) && !platformCallback)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      errors.push(`${filename}:${line}: use const/property arrow functions.`);
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) inspectCoreImport(node.moduleSpecifier);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) inspectCoreImport(node.arguments[0]);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) inspectCoreImport(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(source);
};
const walk = async (directory: string): Promise<void> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'cache', 'test-results', 'artifacts'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(ts|tsx|vue|svelte)$/.test(path) && !path.endsWith('.d.ts')) {
      const text = await readFile(path, 'utf8');
      if (/\.(vue|svelte)$/.test(path)) {
        for (const match of text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) inspect(match[1], `${path}.ts`);
      } else inspect(text, path);
    }
  }
};
for (const directory of ['packages', 'scripts', 'tests', 'playground', 'apps/docs/.vitepress']) await walk(directory);
for (const name of ['core', 'plugins', 'vue', 'react', 'svelte', 'angular', 'web-component', 'wysiwyg']) {
  const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8')) as { license?: string; dependencies?: Record<string, string>; };
  if (manifest.license !== 'MIT') errors.push(`${name}: package license must be MIT.`);
  if (['core', 'plugins'].includes(name) && Object.keys(manifest.dependencies ?? {}).length) errors.push(`${name}: runtime dependencies must be empty.`);
}
const skill = await readFile('skills/morfira-sdd/SKILL.md', 'utf8');
if (!skill.startsWith('---\nname: morfira-sdd\ndescription:') || /TODO|\[INSERT/.test(skill)) errors.push('SDD skill: missing metadata or unfinished scaffold.');
if (errors.length) throw new Error(errors.join('\n'));
console.log('Project contracts: arrow functions, feature-owned types, core/plugin boundaries, MIT, runtime dependencies, and skill metadata passed.');
