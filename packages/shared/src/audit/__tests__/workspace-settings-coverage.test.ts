import { describe, expect, it } from 'vitest';

import { workspaceSettingsUpdatedDetailSchema } from '../workspace-settings.js';

const pair = { good_min_percent: 80, warn_min_percent: 50 };
const diff = { from: { good_min_percent: 75, warn_min_percent: 40 }, to: pair };

describe('workspace settings Coverage audit contract', () => {
  it('retains per-metric diffs alongside existing policy changes', () => {
    const detail = {
      changes: {
        coverage_thresholds: { 'voc-task': diff, 'high-followup': diff },
        survey_anonymity_threshold: { from: 5, to: 7 },
        permission_self_approval: { from: 'allowed', to: 'forbidden' },
      },
    };
    expect(workspaceSettingsUpdatedDetailSchema.parse(detail)).toEqual(detail);
  });

  it.each([
    {},
    { 'milestone-outcome': diff },
    { unknown: diff },
    { 'voc-task': { from: diff.from, to: { good_min_percent: 50, warn_min_percent: 50 } } },
    { 'voc-task': { ...diff, extra: true } },
  ])('rejects empty or invalid metric diff %j', (coverage_thresholds) => {
    expect(
      workspaceSettingsUpdatedDetailSchema.safeParse({ changes: { coverage_thresholds } }).success,
    ).toBe(false);
  });
});
