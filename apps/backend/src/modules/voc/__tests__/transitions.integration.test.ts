// Integration tests for nextReporterStates() reader (Slice 3 #12 Task 6).
//
// Verifies that the reporter_facing_status_transitions seed rows are present
// and that nextReporterStates() returns the correct allowed / forbidden maps
// for three representative statuses.
//
// Gate: DATABASE_URL env must be set (app role is enough; table is SELECT-only).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { nextReporterStates } from '../transitions.js';

const DB_URL = process.env.DATABASE_URL ?? '';
const runIntegration = Boolean(DB_URL);

if (!runIntegration) {
  // Visible in vitest output when env is missing — prevents CI silent-green.
  console.warn(
    '[transitions] skipping integration suite — set DATABASE_URL to run.',
  );
}

describe.skipIf(!runIntegration)('nextReporterStates()', () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(DB_URL);
  });

  afterAll(async () => {
    if (handle) await handle.close();
  });

  it('received → allowed=[reviewing,closed] sorted, forbidden has resolved+prep', async () => {
    const result = await nextReporterStates('received', handle.db);

    expect([...result.allowed].sort()).toEqual(['closed', 'reviewing']);
    expect(result.forbidden['resolved']).toBe('결과 확인 전에 해결됨으로 바꿀 수 없습니다.');
    expect(result.forbidden['prep']).toBe('먼저 검토를 시작해야 합니다.');
  });

  it('closed → allowed=[reopened], forbidden.resolved matches /이미 종료된/', async () => {
    const result = await nextReporterStates('closed', handle.db);

    expect(result.allowed).toEqual(['reopened']);
    expect(result.forbidden['resolved']).toMatch(/이미 종료된/);
  });

  it('resolved → allowed=[closed,reopened] sorted, forbidden={}', async () => {
    const result = await nextReporterStates('resolved', handle.db);

    expect([...result.allowed].sort()).toEqual(['closed', 'reopened']);
    expect(result.forbidden).toEqual({});
  });
});
