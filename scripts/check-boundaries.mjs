#!/usr/bin/env node
// Boundary enforcement per docs/implementation/00-architecture.md and ADR-0016.
// Rules:
//   1. packages/shared MUST NOT import from apps/* or packages/ui.
//   2. packages/ui MUST NOT import from apps/* or packages/shared, MUST NOT call fetch/axios.
//   3. apps/frontend MUST NOT import from @radix-ui/* directly (shadcn primitives wrapped via @fops/ui).
//   4. apps/frontend MUST NOT import from apps/backend.
//   5. apps/backend MUST NOT import from apps/frontend or packages/ui.
//   6. apps/backend/src/modules/* MUST NOT import another top-level module's repo*.js.
//   7. Files outside modules/voc MUST NOT import from modules/voc/jobs/.
//   8. Non-VOC frontend features and src/lib MUST NOT import VOC hooks/lib internals.
//   9. Backend modules MUST NOT import another module's __tests__/_seed-helpers.
//  10. Backend modules outside Core owners MUST NOT name Core owner tables in raw SQL.

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
  {
    scope: 'apps/backend',
    kind: 'outside-voc-imports-voc-jobs',
    msg: 'files outside the VOC module must import job behavior through the VOC public seam',
  },
  {
    scope: 'apps/frontend/src',
    kind: 'feature-imports-voc-internals',
    msg: 'non-VOC frontend features and src/lib must not import VOC hooks or lib internals',
  },
  {
    scope: 'apps/backend/src/modules',
    kind: 'foreign-test-seed-helpers',
    msg: "backend modules must not import another module's __tests__/_seed-helpers; shared helpers live in src/test-support",
  },
  {
    scope: 'apps/backend/src/modules',
    kind: 'foreign-core-owner-table-sql',
    msg: 'backend modules must access Managed Systems and Analytics Areas through their owner surfaces',
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

function isWithinPath(directory, file) {
  const rel = relative(directory, file);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
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
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push({
        specifier: node.arguments[0].text,
        line: source.getLineAndCharacterOfPosition(node.arguments[0].getStart(source)).line + 1,
      });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      out.push({
        specifier: node.argument.literal.text,
        line: source.getLineAndCharacterOfPosition(node.argument.literal.getStart(source)).line + 1,
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
    if (rule.kind === 'outside-voc-imports-voc-jobs') {
      const vocModuleDir = join(ROOT, 'apps/backend/src/modules/voc');
      const vocJobsDir = join(vocModuleDir, 'jobs');
      if (isWithinPath(vocModuleDir, file)) continue;
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        const normalizedSpecifier = specifier.replaceAll('\\', '/');
        const pathNamesVocJobs = /(^|\/)voc\/jobs(?:\/|$)/.test(normalizedSpecifier);
        const resolvedTarget = specifier.startsWith('.') ? resolve(dirname(file), specifier) : null;
        const targetsVocJobs =
          (resolvedTarget !== null && isWithinPath(vocJobsDir, resolvedTarget)) || pathNamesVocJobs;
        if (targetsVocJobs) {
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${specifier})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'feature-imports-voc-internals') {
      const frontendSrc = join(ROOT, 'apps/frontend/src');
      const featureRoot = join(frontendSrc, 'features');
      const libRoot = join(frontendSrc, 'lib');
      const vocHooksDir = join(featureRoot, 'voc/hooks');
      const vocLibDir = join(featureRoot, 'voc/lib');
      const frontendParts = relative(frontendSrc, file).split(sep);
      const featureParts = relative(featureRoot, file).split(sep);
      const isNonVocFeature =
        isWithinPath(featureRoot, file) && featureParts.length > 1 && featureParts[0] !== 'voc';
      const isLibFile = isWithinPath(libRoot, file);
      const isTestFile = frontendParts.includes('__tests__') || /\.test\./.test(basename(file));
      if ((!isNonVocFeature && !isLibFile) || isTestFile) continue;

      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        const normalizedSpecifier = specifier.replaceAll('\\', '/');
        const isVocAlias = /^@\/features\/voc\/(?:hooks|lib)(?:\/|$)/.test(normalizedSpecifier);
        const resolvedTarget = normalizedSpecifier.startsWith('.')
          ? resolve(dirname(file), normalizedSpecifier)
          : null;
        const targetsVocInternals =
          isVocAlias ||
          (resolvedTarget !== null &&
            (isWithinPath(vocHooksDir, resolvedTarget) || isWithinPath(vocLibDir, resolvedTarget)));
        if (targetsVocInternals) {
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${specifier})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'foreign-test-seed-helpers') {
      const moduleRoot = join(ROOT, 'apps/backend/src/modules');
      const srcSegment = moduleSegment(file);
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        const normalizedSpecifier = specifier.replaceAll('\\', '/');
        let targetModule = null;
        let resolvedTarget = null;
        if (normalizedSpecifier.startsWith('.')) {
          resolvedTarget = resolve(dirname(file), normalizedSpecifier);
          const targetRel = relative(moduleRoot, resolvedTarget);
          if (targetRel !== '..' && !targetRel.startsWith(`..${sep}`)) {
            const targetParts = targetRel.split(sep);
            if (
              targetParts[1] === '__tests__' &&
              /^_seed-helpers(?:$|[./])/.test(targetParts[2] ?? '')
            ) {
              targetModule = targetParts[0];
            }
          }
        } else {
          const match = normalizedSpecifier.match(
            /(?:^|\/)modules\/([^/]+)\/__tests__\/_seed-helpers(?:\/|\.|$)/,
          );
          targetModule = match?.[1] ?? null;
        }
        if (srcSegment && targetModule && srcSegment !== targetModule) {
          violations++;
          const displayTarget = resolvedTarget ? relative(ROOT, resolvedTarget) : specifier;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${displayTarget})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'foreign-core-owner-table-sql') {
      const srcSegment = moduleSegment(file);
      const relativeParts = relative(join(ROOT, rule.scope), file).split(sep);
      if (
        !srcSegment ||
        srcSegment === 'managed-systems' ||
        srcSegment === 'analytics-areas' ||
        relativeParts.includes('__tests__') ||
        /\.test\./.test(basename(file))
      ) {
        continue;
      }
      const tableReference =
        new RegExp(
          String.raw`\b(?:from|join|update|into|delete\s+from|truncate(?:\s+table)?|references|alter\s+table|create\s+table|drop\s+table)\s+` +
            String.raw`["']?core["']?\s*\.\s*["']?(managed_systems|analytics_areas)["']?`,
          'gi',
        );
      for (const match of content.matchAll(tableReference)) {
        const line = content.slice(0, match.index).split('\n').length;
        violations++;
        console.error(
          `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (references core.${match[1]})`,
        );
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
