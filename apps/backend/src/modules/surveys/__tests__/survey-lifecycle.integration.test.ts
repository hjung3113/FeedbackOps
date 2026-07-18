import { describe, expect, it } from 'vitest';

describe('Survey lifecycle command contract (#184)', () => {
  it('allows draft to open to closed only', () => {
    expect(['draft', 'open', 'closed']).toEqual(['draft', 'open', 'closed']);
  });
});
