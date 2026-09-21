// Source guard for #392 — VOC routes must not own mutation frames.
//
// modules/voc/routes.ts used to inline `db.transaction` + the advisory-lock
// idempotency frame in six handlers. That ownership moved into the
// application commands (vocService / conversationService). Intentionally a
// source-text check — the constraint IS textual. Only the
// apply-public-update-candidate handler keeps its own `db.transaction`
// (out of #392 scope). Comment stripping mirrors
// lib/__tests__/no-console-in-jobs.test.ts: block comments and whole-line
// comments.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

const routesSource = stripComments(
  readFileSync(fileURLToPath(new URL('../routes.ts', import.meta.url)), 'utf8'),
);

describe('voc routes.ts frame-ownership guard (#392)', () => {
  it('contains no advisory-lock idempotency statement', () => {
    expect(routesSource).not.toContain('pg_advisory_xact_lock');
  });

  it('never calls idempotencyService directly', () => {
    expect(routesSource).not.toContain('idempotencyService.');
  });

  it('has exactly one .transaction( — the apply-public-update-candidate handler', () => {
    expect(countOccurrences(routesSource, '.transaction(')).toBe(1);
  });

  it('scanner self-test: flags frame code in code/strings, ignores comments', () => {
    const dirty = stripComments(
      [
        'const s = "idempotencyService.lookup(tx, a, b)"; // idempotencyService.record(tx)',
        'db.transaction(async (tx) => { /* pg_advisory_xact_lock in comment */ });',
      ].join('\n'),
    );
    expect(dirty).toContain('idempotencyService.');
    expect(dirty).toContain('.transaction(');
    expect(dirty).not.toContain('pg_advisory_xact_lock');
  });
});
