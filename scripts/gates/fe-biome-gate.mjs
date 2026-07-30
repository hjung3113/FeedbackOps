#!/usr/bin/env node
// Biome gate scoped to the files a branch actually changes.
//
// Why this shape: biome is not part of `pnpm typecheck` and was not part of the
// frontend verify profile, so a branch could introduce lint or format
// diagnostics while every gate stayed green (issue #245 shipped three
// lint/a11y/noLabelWithoutControl diagnostics that way). A whole-repo count is
// not usable as an oracle here — `biome check .` reports thousands of
// diagnostics dominated by untracked `.review/` scratch, and the totals differ
// per checkout, so develop and a worktree cannot be compared. The files the
// branch touches CAN be compared, and that is the scope this gate enforces.
//
// Contract: every changed tracked file that biome understands must be free of
// error diagnostics, except identities listed in the allowlist as pre-existing.
//
// Usage:   node scripts/gates/fe-biome-gate.mjs [--base <ref>] [--list]
// Allowlist: scripts/gates/frontend-biome-allowlist.txt, one `<path> <category>` per
// line, `#` comments allowed. Each entry needs a reason on the same line after
// ` -- `; the gate prints them so a stale exemption stays visible.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gateDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(gateDir, '..', '..');
const allowlistPath = join(gateDir, 'frontend-biome-allowlist.txt');
const baseArgIndex = process.argv.indexOf('--base');
const baseRef = baseArgIndex === -1 ? 'develop' : process.argv[baseArgIndex + 1];
const listOnly = process.argv.includes('--list');

const git = (...args) => {
  const run = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (run.status !== 0) {
    console.error(`frontend biome gate: git ${args.join(' ')} failed: ${run.stderr?.trim()}`);
    process.exit(2);
  }
  return run.stdout.trim();
};

const base = git('merge-base', 'HEAD', baseRef);
const changed = git('diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD')
  .split('\n')
  .filter((path) => /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc)$/.test(path))
  .filter((path) => existsSync(join(repoRoot, path)));

if (listOnly) {
  console.log(changed.join('\n'));
  process.exit(0);
}

if (changed.length === 0) {
  console.log(`frontend biome: no biome-checkable files changed against ${baseRef} (${base})`);
  process.exit(0);
}

const run = spawnSync(
  'pnpm',
  ['exec', 'biome', 'check', '--reporter=json', '--max-diagnostics=500', ...changed],
  { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' }, maxBuffer: 64e6 },
);

if (run.error) {
  console.error(`frontend biome gate: could not run biome: ${run.error.message}`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('frontend biome gate: biome produced no parseable JSON report');
  console.error((run.stdout || run.stderr || '').slice(-2000));
  process.exit(2);
}

if (report.summary?.diagnosticsNotPrinted > 0) {
  console.error(
    `frontend biome gate: ${report.summary.diagnosticsNotPrinted} diagnostics were withheld; raise --max-diagnostics`,
  );
  process.exit(2);
}

const allowed = new Map();
if (existsSync(allowlistPath)) {
  for (const raw of readFileSync(allowlistPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [identity, reason] = line.split(' -- ');
    allowed.set(identity.trim(), reason?.trim() ?? '(no reason recorded)');
  }
}

const errors = new Map();
const warnings = new Map();
for (const diagnostic of report.diagnostics ?? []) {
  if (diagnostic.severity !== 'error' && diagnostic.severity !== 'warning') continue;
  const file = diagnostic.location?.path?.file ?? '(unknown)';
  const identity = `${file.replace(/^\.\//, '')} ${diagnostic.category}`;
  const found = diagnostic.severity === 'error' ? errors : warnings;
  found.set(identity, (found.get(identity) ?? 0) + 1);
}

const introduced = [...errors.entries()].filter(([identity]) => !allowed.has(identity));
const warningCount = [...warnings.values()].reduce((total, count) => total + count, 0);
console.log(
  `frontend biome: ${changed.length} changed files, ${errors.size} error identities, ${warningCount} warnings across ${warnings.size} identities, ${allowed.size} allowlisted, ${introduced.length} unexpected errors`,
);
for (const [identity, reason] of allowed) console.log(`  allowlisted ${identity} -- ${reason}`);
for (const [identity, count] of warnings) console.log(`  WARNING ${identity} (${count}x)`);
if (introduced.length > 0) {
  for (const [identity, count] of introduced) console.error(`  NEW ${identity} (${count}x)`);
  process.exit(1);
}
process.exit(0);
