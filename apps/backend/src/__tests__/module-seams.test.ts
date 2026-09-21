/**
 * #391 recurrence guard — application seams for cross-module writes.
 *
 * Plain fs + regex over the module sources (no DB, always runs):
 *   1. voc-clusters / tasks / saved-views must not import another module's
 *      repo (`findings/repo`, `findings/repo-read`, `entity-links/repo`,
 *      `task-requests/repo`) — cross-module access goes through the owning
 *      module's application seam (`commands.ts`, `list-query.ts`).
 *   2. No `service.ts` / `repo.ts` under modules/ may import a `routes.js`
 *      module (HTTP modules are not contracts).
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

const FORBIDDEN_REPO_IMPORT =
  /["']\.\.\/(?:findings\/repo(?:-read)?|entity-links\/repo|task-requests\/repo)(?:\.js)?["']/g;
const ROUTES_IMPORT = /["'][^"']*\/routes\.js["']/g;
const FOREIGN_SCHEMA_WRITE =
  /\b(?:update|insert\s+into|delete\s+from)\s+(?:task_request\.|finding\.)/gi;

export function stripComments(source: string): string {
  // `//` only starts a comment after line start, whitespace, or a statement
  // delimiter — so `https://` and `a//b` inside string literals survive.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[;{}(),=\s])\/\/[^\n]*/g, '$1');
}

export function findForbiddenRepoImports(source: string): string[] {
  return [...stripComments(source).matchAll(FORBIDDEN_REPO_IMPORT)].map((m) => m[0]);
}

export function findRoutesImports(source: string): string[] {
  return [...stripComments(source).matchAll(ROUTES_IMPORT)].map((m) => m[0]);
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
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  visit(root);
  return files;
}

describe('module seam recurrence guard (#391)', () => {
  it('scanner self-test: flags forbidden imports and cross-schema writes', () => {
    expect(
      findForbiddenRepoImports(`import { insertFinding } from '../findings/repo.js';`),
    ).toEqual(["'../findings/repo.js'"]);
    expect(
      findForbiddenRepoImports(`import { findTaskRequestById } from '../task-requests/repo.js';`),
    ).toEqual(["'../task-requests/repo.js'"]);
    expect(
      findForbiddenRepoImports(`import { findFindingById } from '../findings/repo-read.js';`),
    ).toEqual(["'../findings/repo-read.js'"]);
    expect(
      findForbiddenRepoImports(
        `import { createEntityLink } from '../entity-links/commands.js';\n` +
          `import { linkTaskToFinding } from '../findings/commands.js';\n` +
          `// history lives in ../entity-links/repo.js`,
      ),
    ).toEqual([]);

    expect(findRoutesImports(`import { x } from '../findings/routes.js';`)).toEqual([
      "'../findings/routes.js'",
    ]);
    expect(findRoutesImports(`import { x } from './routes.js';`)).toEqual(["'./routes.js'"]);
    expect(findRoutesImports(`import { x } from '../findings/list-query.js';`)).toEqual([]);
    expect(stripComments(`const u = 'https://example.com/a//b';`)).toContain(
      'https://example.com/a//b',
    );

    expect(findForeignSchemaWrites('UPDATE task_request.task_requests SET status')).toEqual([
      'UPDATE task_request.task_requests',
    ]);
    expect(findForeignSchemaWrites('INSERT INTO finding.findings (workspace_id)')).toEqual([
      'INSERT INTO finding.findings',
    ]);
    expect(findForeignSchemaWrites('delete from task_request.task_requests')).toEqual([
      'delete from task_request.task_requests',
    ]);
    expect(findForeignSchemaWrites('SELECT * FROM task_request.task_requests tr')).toEqual([]);
    expect(findForeignSchemaWrites('insert into task.tasks (workspace_id)')).toEqual([]);
    expect(findForeignSchemaWrites('// UPDATE finding.findings SET x')).toEqual([]);
    // SQL `--` comments are not TS comments and are deliberately not stripped:
    // a commented-out write stays flagged (safe direction).
    expect(findForeignSchemaWrites('-- UPDATE finding.findings SET x')).not.toEqual([]);
  });

  it('voc-clusters/tasks/saved-views import owning module seams, not repos', () => {
    const violations: string[] = [];
    for (const dir of ['voc-clusters', 'tasks', 'saved-views']) {
      for (const file of listTsFiles(path.join(MODULES_DIR, dir))) {
        for (const match of findForbiddenRepoImports(fs.readFileSync(file, 'utf8'))) {
          violations.push(`${path.relative(MODULES_DIR, file)}: ${match}`);
        }
      }
    }
    expect(violations, 'cross-module repo imports found').toEqual([]);
  });

  it('no service.ts/repo.ts under modules/ imports a routes.js module', () => {
    const violations: string[] = [];
    for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of listTsFiles(path.join(MODULES_DIR, entry.name))) {
        const base = path.basename(file);
        if (base !== 'service.ts' && base !== 'repo.ts') continue;
        for (const match of findRoutesImports(fs.readFileSync(file, 'utf8'))) {
          violations.push(`${path.relative(MODULES_DIR, file)}: ${match}`);
        }
      }
    }
    expect(violations, 'service/repo importing routes.js found').toEqual([]);
  });

  it('tasks/repo.ts performs no writes against task_request.* or finding.* tables', () => {
    const repoSource = fs.readFileSync(path.join(MODULES_DIR, 'tasks/repo.ts'), 'utf8');
    const violations = findForeignSchemaWrites(repoSource);
    expect(
      violations.map((match) => `modules/tasks/repo.ts: ${match}`),
      'cross-schema writes found in tasks/repo.ts',
    ).toEqual([]);
  });
});
