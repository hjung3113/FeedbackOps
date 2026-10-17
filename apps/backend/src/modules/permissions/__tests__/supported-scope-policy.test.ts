import type { Capability } from '@fops/shared';
import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../db/tx.js';
import { isOrdinarilyRequestable, validateSupportedScope } from '../supported-scope-policy.js';

describe('isOrdinarilyRequestable', () => {
  it.each([
    ['workspace.admin', false],
    ['finding.manage', true],
    ['survey.export', true],
  ] as const)('%s → %s', (capability: Capability, expected) => {
    expect(isOrdinarilyRequestable(capability)).toBe(expected);
  });

  it('validateSupportedScope rejects an ordinary request exactly when the predicate is false', async () => {
    const tx = {} as Tx;
    await expect(
      validateSupportedScope(tx, 'ws', 'workspace.admin', null, null, null),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      validateSupportedScope(tx, 'ws', 'workspace.admin', null, null, null, { approval: true }),
    ).resolves.toBeUndefined();
  });
});
