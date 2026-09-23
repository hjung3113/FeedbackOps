// Unit test for the postgres-text -> ISO 8601 cursor timestamp normalizer
// (astra medium review, PR #449): a "+00"-only regex would 422 every cursor
// the day this DB's session timezone stops defaulting to UTC. No DB needed.

import { describe, expect, it } from 'vitest';

import { normalizePgTimestampToIso } from '../../../lib/pg-timestamp.js';

describe('normalizePgTimestampToIso (#377 / #449 review)', () => {
  it('normalizes the UTC "+00" offset this DB currently uses', () => {
    expect(normalizePgTimestampToIso('2026-01-01 00:00:00.500900+00')).toBe(
      '2026-01-01T00:00:00.500900+00:00',
    );
  });

  it('normalizes a non-UTC two-digit offset (the case the original fix missed)', () => {
    expect(normalizePgTimestampToIso('2026-01-01 09:00:00.500900+09')).toBe(
      '2026-01-01T09:00:00.500900+09:00',
    );
  });

  it('normalizes a negative two-digit offset', () => {
    expect(normalizePgTimestampToIso('2026-01-01 00:00:00.500900-05')).toBe(
      '2026-01-01T00:00:00.500900-05:00',
    );
  });

  it('leaves an already-colon-separated offset unchanged', () => {
    expect(normalizePgTimestampToIso('2026-01-01 09:30:00.500900+05:30')).toBe(
      '2026-01-01T09:30:00.500900+05:30',
    );
  });

  it('preserves microsecond precision (the original bug this normalizer exists for)', () => {
    const normalized = normalizePgTimestampToIso('2026-01-01 00:00:00.500123+00');
    expect(normalized).toContain('.500123');
  });
});
