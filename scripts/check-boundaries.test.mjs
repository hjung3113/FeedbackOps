// Focused test for the cross-module-repo-import rule in check-boundaries.mjs.
// Builds throwaway fixture trees under the repository root (so the checker's
// `typescript` import resolves from the root node_modules), runs a pristine
// copy of the checker against each tree, and removes the tree afterwards.
// Run: node scripts/check-boundaries.test.mjs

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-boundaries.mjs');
const MODULES = join('apps', 'backend', 'src', 'modules');

let failures = 0;

function runCase(name, files, expectExit0, expectOutput) {
  const tmp = mkdtempSync(join(REPO_ROOT, '.boundary-test-'));
  try {
    // Pristine copy of the checker so fixture trees are isolated from the
    // real production tree. ROOT inside the checker resolves to `tmp`.
    cpSync(SCRIPT, join(tmp, 'scripts', 'check-boundaries.mjs'));
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(tmp, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
    let stdout = '';
    let exit = 0;
    try {
      stdout = execFileSync('node', [join(tmp, 'scripts', 'check-boundaries.mjs')], {
        encoding: 'utf8',
      });
    } catch (err) {
      exit = err.status ?? 1;
      stdout = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    if (expectExit0) {
      assert.equal(exit, 0, `${name}: expected exit 0, got ${exit}\n${stdout}`);
    } else {
      assert.equal(exit, 1, `${name}: expected exit 1, got ${exit}\n${stdout}`);
    }
    if (expectOutput) {
      const expected = Array.isArray(expectOutput) ? expectOutput : [expectOutput];
      for (const fragment of expected) {
        assert.ok(stdout.includes(fragment), `${name}: output missing "${fragment}"\n${stdout}`);
      }
    }
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    failures++;
    console.error(`not ok - ${name}\n${err.message}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const zero = {
  [join(MODULES, 'findings', 'service.ts')]: [
    "import { selectVocForUpdate } from '../voc/index.js';",
    "import { canManage } from '../voc/authorization.js';",
    "import type { VocRow } from '../voc/read-service.js';",
    "import { findFindingById } from './repo.js';",
    "const s = await import('../voc/index.js');",
    "export { findFindingById } from './repo.js';",
  ].join('\n'),
  [join(MODULES, 'voc', 'jobs', 'purge.ts')]: [
    "import { insertVoc } from '../embedding/repo.js';",
    "import { selectVocForUpdate } from '../repo.js';",
  ].join('\n'),
};

runCase('zero-violation tree passes', zero, true, 'boundaries: OK');

runCase(
  'foreign repo.js at sibling depth fails',
  {
    ...zero,
    [join(MODULES, 'findings', 'record.ts')]: "import { lockTaskById } from '../tasks/repo.js';\n",
  },
  false,
  'apps/backend/src/modules/findings/record.ts:1',
);

runCase(
  'foreign repo-read.js at nested depth fails',
  {
    ...zero,
    [join(MODULES, 'voc', 'jobs', 'purge.ts')]: [
      "import { findFindingById } from '../../findings/repo-read.js';",
    ].join('\n'),
  },
  false,
  'apps/backend/src/modules/voc/jobs/purge.ts:1',
);

runCase(
  'seeded forbidden import identifies file and line',
  {
    ...zero,
    [join(MODULES, 'surveys', 'results.ts')]: [
      "import { ok } from './helpers.js';",
      "import { resolveVocEndpoint } from '../entity-links/repo.js';",
    ].join('\n'),
  },
  false,
  'apps/backend/src/modules/surveys/results.ts:2',
);

runCase(
  'same-module repo, authorization/read-service imports, and comment pass',
  {
    ...zero,
    [join(MODULES, 'dashboard', 'service.ts')]: [
      "import { checkFindingManage } from '../findings/authorization.js';",
      "import type { VocRow } from '../voc/read-service.js';",
      "// import { evil } from '../findings/repo.js';",
      'const notImport = "import { evil } from \'../findings/repo.js\'";',
    ].join('\n'),
  },
  true,
  'boundaries: OK',
);

runCase(
  'import-type expressions referencing foreign repo files fail',
  {
    ...zero,
    [join(MODULES, 'surveys', 'results.ts')]: [
      "import { ok } from './helpers.js';",
      "type Row = import('../findings/repo.js').FindingRow;",
      "type Mod = typeof import('../tasks/repo-read.js');",
    ].join('\n'),
  },
  false,
  [
    'apps/backend/src/modules/surveys/results.ts:2',
    'apps/backend/src/modules/surveys/results.ts:3',
  ],
);

runCase(
  'dynamic import with options argument targeting foreign repo fails',
  {
    ...zero,
    [join(MODULES, 'surveys', 'results.ts')]: [
      "import { ok } from './helpers.js';",
      "const mod = await import('../tasks/repo.js', { with: { type: 'json' } });",
    ].join('\n'),
  },
  false,
  'apps/backend/src/modules/surveys/results.ts:2',
);

runCase(
  'rule 8 rejects VOC hook imports through the feature alias',
  {
    ...zero,
    [join('apps', 'frontend', 'src', 'features', 'findings', 'x.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
  },
  false,
  'apps/frontend/src/features/findings/x.ts:1',
);

runCase(
  'rule 8 rejects relative VOC lib imports from src/lib',
  {
    ...zero,
    [join('apps', 'frontend', 'src', 'lib', 'x.ts')]:
      "import { helper } from '../features/voc/lib/helper';\n",
  },
  false,
  'apps/frontend/src/lib/x.ts:1',
);

runCase(
  'rule 8 treats voc-cluster as a non-VOC feature',
  {
    ...zero,
    [join('apps', 'frontend', 'src', 'features', 'voc-cluster', 'x.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
  },
  false,
  'apps/frontend/src/features/voc-cluster/x.ts:1',
);

runCase(
  'rule 8 excludes frontend tests and allows VOC feature internals',
  {
    ...zero,
    [join('apps', 'frontend', 'src', 'features', 'findings', '__tests__', 'x.test.ts')]:
      "import { useThing } from '@/features/voc/hooks/useThing';\n",
    [join('apps', 'frontend', 'src', 'features', 'voc', 'components', 'x.tsx')]:
      "import { helper } from '@/features/voc/lib/helper';\n",
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 9 rejects foreign imports of VOC seed helpers',
  {
    ...zero,
    [join(MODULES, 'voc-clusters', '__tests__', 'a.test.ts')]:
      "import { seed } from '../../voc/__tests__/_seed-helpers.js';\n",
  },
  false,
  'apps/backend/src/modules/voc-clusters/__tests__/a.test.ts:1',
);

runCase(
  'rule 9 rejects any cross-module seed-helper import (#574)',
  {
    ...zero,
    [join(MODULES, 'tasks', '__tests__', 'a.test.ts')]:
      "import { seed } from '../../findings/__tests__/_seed-helpers.js';\n",
  },
  false,
  'apps/backend/src/modules/tasks/__tests__/a.test.ts:1',
);

runCase(
  'rule 9 allows same-module VOC jobs seed-helper imports',
  {
    ...zero,
    [join(MODULES, 'voc', 'jobs', '__tests__', 'a.test.ts')]:
      "import { seed } from '../../__tests__/_seed-helpers.js';\n",
  },
  true,
  'boundaries: OK',
);

const ownerTableSql = {
  ...zero,
  [join(MODULES, 'managed-systems', 'repo.ts')]:
    'const result = await tx.execute(sql`select * from core.managed_systems`);\n',
  [join(MODULES, 'analytics-areas', 'repo.ts')]:
    'const result = await tx.execute(sql`select * from core.analytics_areas`);\n',
  [join(MODULES, 'tasks', '__tests__', 'fixture.integration.test.ts')]:
    'const result = await tx.execute(sql`select * from core.managed_systems`);\n',
};

runCase(
  'rule 10 allows owner-table SQL in owner modules and skips tests',
  ownerTableSql,
  true,
  'boundaries: OK',
);

runCase(
  'rule 10 rejects Core owner-table imports outside owner modules and in test-support',
  {
    ...zero,
    [join(MODULES, 'findings', 'creation.ts')]:
      "import { managedSystems as coreManagedSystems } from '../../db/schema/core.js';\n",
    [join('apps', 'backend', 'src', 'test-support', 'seed.ts')]:
      "import { analyticsAreas } from '../db/schema/core';\n",
  },
  false,
  [
    'apps/backend/src/modules/findings/creation.ts:1',
    'apps/backend/src/test-support/seed.ts:1',
  ],
);

runCase(
  'rule 10 allows Core owner-table imports in owner modules and skips tests',
  {
    ...zero,
    [join(MODULES, 'analytics-areas', 'schema-import.ts')]:
      "import { analyticsAreas } from '../../db/schema/core.js';\n",
    [join(MODULES, 'tasks', '__tests__', 'fixture.test.ts')]:
      "import { managedSystems } from '../../../db/schema/core.js';\n",
  },
  true,
  'boundaries: OK',
);

runCase(
  'rule 10 rejects raw Core owner-table SQL outside the owner modules',
  {
    ...ownerTableSql,
    [join(MODULES, 'findings', 'creation.ts')]:
      'const result = await tx.execute(sql`select * from core.analytics_areas`);\n',
    [join(MODULES, 'tasks', 'service.ts')]: [
      'const rows = await tx.execute(sql`select * from core.managed_systems`);',
      'await tx.execute(sql`update core.managed_systems set archived_at = now()`);',
    ].join('\n'),
  },
  false,
  [
    'apps/backend/src/modules/findings/creation.ts:1',
    'apps/backend/src/modules/tasks/service.ts:1',
    'apps/backend/src/modules/tasks/service.ts:2',
  ],
);

runCase(
  'rule 10 rejects comma joins and USING references to Core owner tables',
  {
    ...zero,
    [join(MODULES, 'tasks', 'comma-join.ts')]:
      'const rows = await tx.execute(sql`select * from voc.vocs v, core.managed_systems ms`);\n',
    [join(MODULES, 'tasks', 'using.ts')]:
      'await tx.execute(sql`delete from voc.vocs using core.analytics_areas`);\n',
  },
  false,
  [
    'apps/backend/src/modules/tasks/comma-join.ts:1',
    'apps/backend/src/modules/tasks/using.ts:1',
  ],
);

if (failures > 0) {
  console.error(`\n${failures} test case(s) failed`);
  process.exit(1);
}
process.stdout.write('\ncheck-boundaries tests: OK\n');
