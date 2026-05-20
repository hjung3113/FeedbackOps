// reporter-status-labels.test.ts — TDD RED
// C4.1: Korean label map for all 8 ReporterFacingStatus values.

import { describe, expect, it } from 'vitest';
import {
  REPORTER_STATUS_LABELS,
  getReporterStatusLabel,
  REPORTER_FACING_STATUS_ALL,
} from '../reporter-status-labels';

describe('REPORTER_STATUS_LABELS', () => {
  it('covers all 8 ReporterFacingStatus enum values with non-empty Korean labels', () => {
    const statuses = [
      'received',
      'reviewing',
      'assigned',
      'progress',
      'prep',
      'resolved',
      'reopened',
      'closed',
    ] as const;
    for (const s of statuses) {
      expect(REPORTER_STATUS_LABELS[s]).toBeTruthy();
      expect(typeof REPORTER_STATUS_LABELS[s]).toBe('string');
    }
  });

  it('throws on unknown status', () => {
    expect(() =>
      getReporterStatusLabel('unknown' as never),
    ).toThrow();
  });
});

describe('REPORTER_FACING_STATUS_ALL', () => {
  it('contains all 8 statuses in the canonical picker order', () => {
    expect(REPORTER_FACING_STATUS_ALL).toHaveLength(8);
    // canonical picker order from prototype: received → reviewing → assigned → progress → prep → resolved → reopened → closed
    expect(REPORTER_FACING_STATUS_ALL[0]).toBe('received');
    expect(REPORTER_FACING_STATUS_ALL[7]).toBe('closed');
  });
});
