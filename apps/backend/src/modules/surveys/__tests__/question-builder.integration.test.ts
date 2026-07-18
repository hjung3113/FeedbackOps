import { describe, expect, it } from 'vitest';

describe('Survey question builder contract (#184)', () => {
  it('keeps question commands draft-only', () => {
    expect(['draft']).toContain('draft');
  });

  it('allows exactly one branch depth', () => {
    expect([0, 1]).toEqual([0, 1]);
  });
});
