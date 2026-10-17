import { describe, expect, it } from 'vitest';
import { recoveryHistoryWindowStart } from '../history-window.js';

describe('UTC three-calendar-month recovery history window', () => {
  it.each([
    ['2026-10-13T10:20:00.000Z', '2026-08-01T00:00:00.000Z'],
    ['2026-01-31T23:59:59.999Z', '2025-11-01T00:00:00.000Z'],
    ['2024-03-31T12:00:00.000Z', '2024-01-01T00:00:00.000Z'],
    ['2024-02-29T23:59:59.999Z', '2023-12-01T00:00:00.000Z'],
    ['2026-10-01T00:00:00+09:00', '2026-07-01T00:00:00.000Z'],
  ])('uses the current UTC month and two preceding whole months at %s', (clock, expected) => {
    expect(recoveryHistoryWindowStart(new Date(clock)).toISOString()).toBe(expected);
  });
});
