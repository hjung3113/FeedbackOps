import { describe, expect, it } from 'vitest';

import { workspaceSettingsUpdatedDetailSchema } from '../workspace-settings.js';

describe('suggestion opt-in audit policy diff', () => {
  it.each([
    [false, true],
    [true, false],
  ])('accepts boolean %s to %s', (from, to) => {
    expect(
      workspaceSettingsUpdatedDetailSchema.safeParse({
        changes: { voc_cluster_suggestions_enabled: { from, to } },
      }).success,
    ).toBe(true);
  });
  it.each([
    { from: 'false', to: true },
    { from: false, to: 1 },
    { from: false, to: true, extra: 1 },
  ])('rejects invalid boolean diff %j', (diff) => {
    expect(
      workspaceSettingsUpdatedDetailSchema.safeParse({
        changes: { voc_cluster_suggestions_enabled: diff },
      }).success,
    ).toBe(false);
  });
});
