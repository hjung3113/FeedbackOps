import type { CoverageMetricId, CoverageThresholdPair } from '@fops/shared';

import { COVERAGE_METRIC_LABELS } from './coverage';

// #1088 (ADR-0067 56-C): Korean chrome for the five Coverage band rows in
// /admin/settings. Metric names reuse the shipped Coverage labels; band values
// are server-applied percent cutoffs, not client-side thresholds.
export const WORKSPACE_SETTINGS_COVERAGE_COPY = {
  sectionTitle: '커버리지 기준',
  sectionDescription:
    '대시보드 커버리지 신호의 양호·주의 기준을 지표별로 정합니다. 저장하면 모든 범위의 요약에 새 기준이 반영됩니다.',
  goodLabel: '양호 기준',
  warnLabel: '주의 기준',
  rowDescription:
    '이 지표의 양호 최소 비율과 주의 최소 비율입니다. 주의 비율은 양호 비율보다 작아야 합니다.',
  savedPair: (pair: CoverageThresholdPair) =>
    `양호 ≥ ${pair.good_min_percent}% · 주의 ≥ ${pair.warn_min_percent}%`,
  invalidReason: '0에서 100 사이의 정수를 입력하세요. 주의 기준은 양호 기준보다 작아야 합니다.',
  editBands: '커버리지 기준 편집',
} as const;

export function coverageBandFieldLabel(metric: CoverageMetricId, band: 'good' | 'warn'): string {
  return `${COVERAGE_METRIC_LABELS[metric]} ${band === 'good' ? WORKSPACE_SETTINGS_COVERAGE_COPY.goodLabel : WORKSPACE_SETTINGS_COVERAGE_COPY.warnLabel}`;
}
