#!/usr/bin/env node
// Baseline-aware frontend typecheck gate for the generic target verifier.
// Exits 0 when the only `error TS...` lines are already in the baseline.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gateDir = dirname(fileURLToPath(import.meta.url));
const root = join(gateDir, '..', '..');
const baselinePath = join(gateDir, 'frontend-typecheck-baseline.txt');
let out = '';
try {
  out = execFileSync('pnpm', ['--filter', 'frontend', 'exec', 'tsc', '--noEmit'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' },
  });
} catch (err) {
  out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
}
const errors = out.split('\n').filter((l) => /error TS\d+:/.test(l)).map((l) => l.trim()).sort();
if (errors.length === 0 && !/error TS/.test(out)) {
  console.log('frontend typecheck: 0 errors');
  process.exit(0);
}
const baseline = existsSync(baselinePath)
  ? new Set(readFileSync(baselinePath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean))
  : new Set();
const fresh = errors.filter((e) => !baseline.has(e));
console.log(`frontend typecheck: ${errors.length} total, ${baseline.size} baselined, ${fresh.length} new`);
if (fresh.length > 0) {
  console.log('NEW frontend typecheck errors:');
  for (const e of fresh) console.log(`  ${e}`);
  process.exit(1);
}
process.exit(0);
