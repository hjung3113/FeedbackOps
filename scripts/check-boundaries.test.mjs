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
      assert.ok(
        stdout.includes(expectOutput),
        `${name}: output missing "${expectOutput}"\n${stdout}`,
      );
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

if (failures > 0) {
  console.error(`\n${failures} test case(s) failed`);
  process.exit(1);
}
process.stdout.write('\ncheck-boundaries tests: OK\n');
