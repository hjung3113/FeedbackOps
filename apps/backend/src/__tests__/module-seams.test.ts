/**
 * #391 recurrence guard — application seams for cross-module writes.
 *
 * Plain fs + regex over the module sources (no DB, always runs):
 *   1. voc-clusters / tasks / saved-views must not import another module's
 *      repo (`findings/repo`, `findings/repo-read`, `entity-links/repo`,
 *      `task-requests/repo`, `tasks/repo`, `milestones/repo`) — cross-module
 *      access goes through the owning module's application seam (`commands.ts`)
 *      or the shared list contracts in `@fops/shared`.
 *   2. No application file under modules/ (anything but `routes.ts` and
 *      `index.ts` barrels) may import a `routes` module (HTTP modules are
 *      not contracts).
 *   3. `tasks/repo.ts` must not contain UPDATE/INSERT/DELETE against
 *      `task_request.*` or `finding.*` tables.
 *
 * The scanners are exported so the self-test below can prove they are not
 * vacuous against in-memory sources.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULES_DIR = path.resolve(__dirname, '../modules');

/** Resolved (importer-relative) module paths other modules must not import. */
const FORBIDDEN_REPO_TARGETS = new Set([
  'findings/repo',
  'findings/repo-read',
  'entity-links/repo',
  'task-requests/repo',
  'tasks/repo',
  'milestones/repo',
]);
const FOREIGN_SCHEMA_WRITE =
  /\b(?:update|insert\s+into|delete\s+from)\s+(?:task_request\.|finding\.)/gi;

/**
 * Import/export specifiers. Static forms are anchored at line start so text
 * inside comments (`// import x from '…'`, ` * …`) or string bodies never
 * matches and no comment stripping (which can erase real code around `'/*'`
 * strings) is needed; multi-line `import { … } from` is covered because the
 * clause between the keyword and the quote cannot contain a quote or `;`.
 * Literal dynamic `import('…')` is matched anywhere.
 */
const STATIC_SPECIFIER = /^[ \t]*(?:import|export)\b[^;'"`]*?(?:\bfrom\s*)?['"]([^'"\n]+)['"]/gm;
const DYNAMIC_SPECIFIER = /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;

export function importSpecifiers(source: string): string[] {
  return [
    ...[...source.matchAll(STATIC_SPECIFIER)].map((m) => m[1] as string),
    ...[...source.matchAll(DYNAMIC_SPECIFIER)].map((m) => m[1] as string),
  ];
}

/** Resolve a relative specifier against its importer; null for packages/aliases. */
export function resolveModuleTarget(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = path
    .resolve(path.dirname(fromFile), specifier)
    .replace(/\.(?:js|ts|mjs|cjs)$/, '');
  return path.relative(MODULES_DIR, resolved).split(path.sep).join('/');
}

export function findForbiddenRepoImports(source: string, fromFile: string): string[] {
  // Only cross-module repo imports are violations: a module may import its
  // own repo (tasks/service.ts → './repo.js' resolves to tasks/repo).
  const ownModule = path.relative(MODULES_DIR, fromFile).split(path.sep)[0];
  return importSpecifiers(source).filter((spec) => {
    const target = resolveModuleTarget(fromFile, spec);
    return (
      target !== null &&
      target.split(path.sep)[0] !== ownModule &&
      FORBIDDEN_REPO_TARGETS.has(target)
    );
  });
}

export function findRoutesImports(source: string, fromFile: string): string[] {
  return importSpecifiers(source).filter((spec) => {
    const target = resolveModuleTarget(fromFile, spec);
    return target !== null && (target === 'routes' || target.endsWith('/routes'));
  });
}

export function stripComments(source: string): string {
  // `//` only starts a comment after line start, whitespace, or a statement
  // delimiter — so `https://` and `a//b` inside string literals survive.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[;{}(),=\s])\/\/[^\n]*/g, '$1');
}

export function findForeignSchemaWrites(source: string): string[] {
  return [...stripComments(source).matchAll(FOREIGN_SCHEMA_WRITE)].map((m) => m[0]);
}

function listTsFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
    }
  };
  visit(root);
  return files;
}

describe('module seam recurrence guard (#391)', () => {
  it('scanner self-test: flags forbidden imports and cross-schema writes', () => {
    const from = path.join(MODULES_DIR, 'tasks/service.ts');
    const nested = path.join(MODULES_DIR, 'tasks/helpers/deep.ts');
    const flagged = (source: string, file = from): string[] =>
      findForbiddenRepoImports(source, file);

    expect(flagged(`import { insertFinding } from '../findings/repo.js';`)).toEqual([
      '../findings/repo.js',
    ]);
    expect(flagged(`import { x } from '../task-requests/repo';`)).toHaveLength(1); // extensionless
    expect(flagged(`import { x } from '../findings/repo-read.ts';`)).toHaveLength(1);
    expect(flagged(`import type { X } from '../entity-links/repo.js';`)).toHaveLength(1);
    expect(flagged(`export { y } from '../entity-links/repo.js';`)).toHaveLength(1);
    expect(flagged(`import {\n  a,\n  b as c,\n} from '../findings/repo.js';`)).toHaveLength(1); // multi-line
    expect(flagged(`const m = await import('../findings/repo.js');`)).toHaveLength(1);
    // #514 A1: tasks/repo and milestones/repo are cross-module seams too —
    // reported when another module imports them, allowed inside the owner.
    const sibling = path.join(MODULES_DIR, 'voc-clusters/service.ts');
    expect(flagged(`import { x } from '../tasks/repo.js';`, sibling)).toHaveLength(1);
    expect(flagged(`import { x } from '../milestones/repo.js';`, sibling)).toHaveLength(1);
    expect(flagged(`import { x } from './repo.js';`)).toEqual([]); // own module's repo
    // Nested helper: different depth resolves to the same forbidden target.
    expect(flagged(`import { x } from '../../findings/repo.js';`, nested)).toHaveLength(1);
    expect(flagged(`import { x } from '../findings/repo.js';`, nested)).toEqual([]); // tasks/findings/repo — not it
    // Allowed seams and non-relative packages.
    expect(
      flagged(
        `import { a } from '../entity-links/commands.js';\n` +
          `import { b } from '../findings/commands.js';\n` +
          `import { z } from 'zod';`,
      ),
    ).toEqual([]);
    // Text in comments never matches; a '/*' string does not erase a real import.
    expect(
      flagged(`// import x from '../findings/repo.js';\n * import y from '../findings/repo.js';`),
    ).toEqual([]);
    expect(
      flagged(`const start = '/*';\nimport { x } from '../findings/repo.js';\nconst end = '*/';`),
    ).toHaveLength(1);

    const routesFlagged = (source: string, file = from): string[] =>
      findRoutesImports(source, file);
    expect(routesFlagged(`import { x } from '../findings/routes.js';`)).toHaveLength(1);
    expect(routesFlagged(`import { x } from './routes.js';`)).toHaveLength(1);
    expect(routesFlagged(`import { x } from '../findings/routes';`)).toHaveLength(1); // extensionless
    expect(routesFlagged(`import { x } from '../findings/list-query.js';`)).toEqual([]);

    expect(stripComments(`const u = 'https://example.com/a//b';`)).toContain(
      'https://example.com/a//b',
    );
    // The scanner reports the matched verb + schema prefix (`UPDATE task_request.`).
    expect(findForeignSchemaWrites('UPDATE task_request.task_requests SET status')).toEqual([
      'UPDATE task_request.',
    ]);
    expect(findForeignSchemaWrites('INSERT INTO finding.findings (workspace_id)')).toEqual([
      'INSERT INTO finding.',
    ]);
    expect(findForeignSchemaWrites('delete from task_request.task_requests')).toEqual([
      'delete from task_request.',
    ]);
    expect(findForeignSchemaWrites('SELECT * FROM task_request.task_requests tr')).toEqual([]);
    expect(findForeignSchemaWrites('insert into task.tasks (workspace_id)')).toEqual([]);
    expect(findForeignSchemaWrites('// UPDATE finding.findings SET x')).toEqual([]);
    // SQL `--` comments are not TS comments and are deliberately not stripped:
    // a commented-out write stays flagged (safe direction).
    expect(findForeignSchemaWrites('-- UPDATE finding.findings SET x')).not.toEqual([]);
  });

  it('voc-clusters/tasks/saved-views/milestones import owning module seams, not repos', () => {
    const violations: string[] = [];
    for (const dir of ['voc-clusters', 'tasks', 'saved-views', 'milestones']) {
      for (const file of listTsFiles(path.join(MODULES_DIR, dir))) {
        for (const match of findForbiddenRepoImports(fs.readFileSync(file, 'utf8'), file)) {
          violations.push(`${path.relative(MODULES_DIR, file)}: ${match}`);
        }
      }
    }
    expect(violations, 'cross-module repo imports found').toEqual([]);
  });

  it('no application file under modules/ imports a routes module', () => {
    const violations: string[] = [];
    for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of listTsFiles(path.join(MODULES_DIR, entry.name))) {
        const base = path.basename(file);
        // HTTP layer and barrels may reference routes; everything else
        // (services, repos, commands, helpers) is application code.
        if (base === 'routes.ts' || base === 'index.ts') continue;
        for (const match of findRoutesImports(fs.readFileSync(file, 'utf8'), file)) {
          violations.push(`${path.relative(MODULES_DIR, file)}: ${match}`);
        }
      }
    }
    expect(violations, 'application code importing a routes module found').toEqual([]);
  });

  it('tasks/repo.ts performs no writes against task_request.* or finding.* tables', () => {
    const repoSource = fs.readFileSync(path.join(MODULES_DIR, 'tasks/repo.ts'), 'utf8');
    const violations = findForeignSchemaWrites(repoSource);
    expect(
      violations.map((match) => `modules/tasks/repo.ts: ${match}`),
      'cross-schema writes found in tasks/repo.ts',
    ).toEqual([]);
  });

  it('milestones/repo.ts mentions neither task.tasks nor finding.findings (#514 A4)', () => {
    const repoSource = fs.readFileSync(path.join(MODULES_DIR, 'milestones/repo.ts'), 'utf8');
    expect(repoSource).not.toContain('task.tasks');
    expect(repoSource).not.toContain('finding.findings');
  });
});
