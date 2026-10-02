import type { DashboardCoverageId } from '@fops/shared';

// #680 uses the accepted Korean-first labels while prototype data.js remains English.
export const COVERAGE_METRIC_LABELS = {
  'voc-task': 'VOC → Task 연결',
  'finding-execution': '실행 중인 Finding',
  'milestone-outcome': '성과 Survey가 있는 Milestone',
  'high-followup': '높은 심각도 VOC 후속 조치',
  'released-update': '공개 업데이트가 있는 Released Task',
  'analytics-area': 'Analytics Area가 지정된 VOC',
} satisfies Record<DashboardCoverageId, string>;

export const COVERAGE_METRIC_IDS = Object.keys(COVERAGE_METRIC_LABELS) as DashboardCoverageId[];

export const INTEGRATION_AVERAGE_COVERAGE_LABEL = '평균 커버리지';
