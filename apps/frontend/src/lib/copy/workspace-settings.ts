import type { CoverageMetricId, CoverageThresholdPair } from '@fops/shared';

import { COVERAGE_METRIC_LABELS } from './coverage';

// #1088 (ADR-0067 56-C): Korean chrome for the five Coverage band rows in
// /admin/settings. Metric names reuse the shipped Coverage labels; band values
// are server-applied percent cutoffs, not client-side thresholds.
// What each metric counts (numerator / denominator), per the dashboard summary contract.
const COVERAGE_BAND_ROW_DESCRIPTIONS = {
  'voc-task': '열린 VOC 중 Task와 연결된 비율입니다.',
  'finding-execution': '활성 Finding 중 실행 항목으로 이어진 비율입니다.',
  'high-followup': '열린 높은 심각도 VOC 중 후속 연결이 있는 비율입니다.',
  'released-update': 'VOC와 연결된 Released Task 중 공개 업데이트가 있는 비율입니다.',
  'analytics-area': '열린 VOC 중 Analytics Area가 지정된 비율입니다.',
} satisfies Record<CoverageMetricId, string>;

export const WORKSPACE_SETTINGS_COVERAGE_COPY = {
  sectionTitle: '커버리지 기준',
  // The shared band rule and where the bands land live here once (#1087 UX);
  // rows describe what their own metric counts.
  sectionDescription:
    '각 지표의 양호·주의 기준을 0에서 100 사이의 정수(%)로 정합니다. 주의 기준은 양호 기준보다 작아야 합니다. 저장하면 홈 · 연동 커버리지 · 액션 대시보드의 커버리지 신호에 새 기준이 반영됩니다.',
  goodLabel: '양호 기준',
  warnLabel: '주의 기준',
  goodPrefix: '양호',
  warnPrefix: '주의',
  rowDescription: (metric: CoverageMetricId) => COVERAGE_BAND_ROW_DESCRIPTIONS[metric],
  savedPair: (pair: CoverageThresholdPair) =>
    `양호 ≥ ${pair.good_min_percent}% · 주의 ≥ ${pair.warn_min_percent}%`,
  // Valid-state hint under the inputs; invalid states get the specific broken rule.
  hint: '0에서 100 사이의 정수를 입력하세요. 주의 기준은 양호 기준보다 작아야 합니다.',
  rangeInvalid: '0에서 100 사이의 정수를 입력하세요.',
  orderInvalid: '주의 기준은 양호 기준보다 작아야 합니다.',
  editBands: '커버리지 기준 편집',
} as const;

export function coverageBandFieldLabel(metric: CoverageMetricId, band: 'good' | 'warn'): string {
  return `${COVERAGE_METRIC_LABELS[metric]} ${band === 'good' ? WORKSPACE_SETTINGS_COVERAGE_COPY.goodLabel : WORKSPACE_SETTINGS_COVERAGE_COPY.warnLabel}`;
}
