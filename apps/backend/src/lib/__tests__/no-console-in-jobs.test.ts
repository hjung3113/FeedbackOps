// Guard (ADR-0013, amended 2026-09-22): product job paths must not bypass
// the structured Pino root logger. Reads the source of every job
// registration/handler file plus lib/jobs.ts and the storage factory and
// asserts no console.info/log/warn/error call remains outside comments.
// Intentionally a source-text check — the constraint IS textual. Comment
// stripping is deliberately simple: block comments and whole-line comments.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const GUARDED_FILES = [
  'modules/core/jobs/idempotency-purge.ts',
  'modules/core/jobs/rate-limits-purge.ts',
  'modules/core/jobs/purge-unlinked-attachments.ts',
  'modules/core/jobs/index.ts',
  'modules/voc/jobs/embed-voc.ts',
  'modules/voc/jobs/embedding-backfill.ts',
  'modules/voc/jobs/index.ts',
  'modules/voc/jobs/released-review-candidates.ts',
  'lib/jobs.ts',
  'lib/storage/factory.ts',
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('no console logging in job/storage product paths', () => {
  it.each(GUARDED_FILES)('%s has no console.info/log/warn/error outside comments', (rel) => {
    const src = stripComments(readFileSync(join(SRC_ROOT, rel), 'utf8'));
    expect(src).not.toMatch(/console\.(info|log|warn|error)\s*\(/);
  });
});
