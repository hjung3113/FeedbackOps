#!/usr/bin/env node
// Boundary enforcement per docs/implementation/00-architecture.md and ADR-0016.
// Rules:
//   1. packages/shared MUST NOT import from apps/* or packages/ui.
//   2. packages/ui MUST NOT import from apps/* or packages/shared, MUST NOT call fetch/axios.
//   3. apps/frontend MUST NOT import from @radix-ui/* directly (shadcn primitives wrapped via @fops/ui).
//   4. apps/frontend MUST NOT import from apps/backend.
//   5. apps/backend MUST NOT import from apps/frontend or packages/ui.
//   6. apps/backend/src/modules/* MUST NOT import another top-level module's repo*.js.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import ts from 'typescript';

const ROOT = new URL('..', import.meta.url).pathname;
const RULES = [
  {
    scope: 'packages/shared',
    forbid: [/from\s+['"]@fops\/ui/, /from\s+['"]\.\.\/\.\.\/apps\//],
    msg: 'packages/shared must not import apps/* or @fops/ui',
  },
  {
    scope: 'packages/ui',
    forbid: [
      /from\s+['"]@fops\/shared/,
      /from\s+['"]\.\.\/\.\.\/apps\//,
      /\bfetch\s*\(/,
      /from\s+['"]axios['"]/,
    ],
    msg: 'packages/ui must not call APIs or import apps/* or @fops/shared',
  },
  {
    scope: 'apps/frontend',
    forbid: [/from\s+['"]@radix-ui\//, /from\s+['"]\.\.\/\.\.\/backend\//],
    msg: 'apps/frontend must import primitives via @fops/ui, not @radix-ui/*; must not import apps/backend',
  },
  {
    scope: 'apps/backend',
    forbid: [/from\s+['"]@fops\/ui/, /from\s+['"]\.\.\/\.\.\/frontend\//],
    msg: 'apps/backend must not import @fops/ui or apps/frontend',
  },
  {
    scope: 'apps/backend/src/modules',
    kind: 'cross-module-repo-import',
    targetBasename: /^repo[^/]*\.js$/,
    msg: 'backend modules must import another module through its approved public seam, not repo*.js',
  },
];

const EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo' || name === 'build')
      continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if ([...EXT].some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

function moduleSegment(file) {
  const rel = relative(join(ROOT, 'apps/backend/src/modules'), file);
  if (rel.startsWith('..')) return null;
  return rel.split(sep)[0];
}

function collectImportSpecifiers(file, content) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const out = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push({
        specifier: node.moduleSpecifier.text,
        line: source.getLineAndCharacterOfPosition(node.moduleSpecifier.getStart(source)).line + 1,
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push({
        specifier: node.arguments[0].text,
        line: source.getLineAndCharacterOfPosition(node.arguments[0].getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

let violations = 0;
for (const rule of RULES) {
  const base = join(ROOT, rule.scope);
  try {
    statSync(base);
  } catch {
    continue;
  }
  for (const file of walk(base)) {
    const content = readFileSync(file, 'utf8');
    if (rule.kind === 'cross-module-repo-import') {
      const srcSegment = moduleSegment(file);
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier);
        const targetSegment = moduleSegment(target);
        if (
          srcSegment &&
          targetSegment &&
          srcSegment !== targetSegment &&
          rule.targetBasename.test(basename(target))
        ) {
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${relative(ROOT, target)})`,
          );
        }
      }
      continue;
    }
    for (const pat of rule.forbid) {
      if (pat.test(content)) {
        violations++;
        console.error(`[boundary] ${relative(ROOT, file)}: ${rule.msg} (matched ${pat})`);
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} boundary violation(s)`);
  process.exit(1);
}
console.log('boundaries: OK');
