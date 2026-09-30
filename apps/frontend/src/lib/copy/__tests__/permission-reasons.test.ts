import { describe, expect, it } from 'vitest';
import { PERMISSION_BLOCKED_REASONS } from '../permission-reasons';

describe('PERMISSION_BLOCKED_REASONS', () => {
  it('does not expose capability IDs in user-facing reason copy', () => {
    const capabilityId = /\b[a-z_]+\.[a-z_]+\b/;
    const exposedReasons = Object.values(PERMISSION_BLOCKED_REASONS).filter((reason) =>
      capabilityId.test(reason),
    );

    expect(exposedReasons).toEqual([]);
  });
});
