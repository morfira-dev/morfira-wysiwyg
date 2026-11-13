import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

const errors: string[] = [];
const inspect = (sourceText: string, filename: string): void => {
  const source = ts.createSourceFile(filename, sourceText, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      errors.push(`${filename}:${line}: use const/property arrow functions.`);
    }
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
for (const name of ['core', 'plugins', 'vue', 'react', 'svelte', 'wysiwyg']) {
  const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8')) as { license?: string; dependencies?: Record<string, string>; };
  if (manifest.license !== 'MIT') errors.push(`${name}: package license must be MIT.`);
  if (['core', 'plugins'].includes(name) && Object.keys(manifest.dependencies ?? {}).length) errors.push(`${name}: runtime dependencies must be empty.`);
}
const skill = await readFile('skills/morfira-sdd/SKILL.md', 'utf8');
if (!skill.startsWith('---\nname: morfira-sdd\ndescription:') || /TODO|\[INSERT/.test(skill)) errors.push('SDD skill: missing metadata or unfinished scaffold.');
if (errors.length) throw new Error(errors.join('\n'));
console.log('Project contracts: arrow functions, MIT, runtime dependency boundaries, and skill metadata passed.');
