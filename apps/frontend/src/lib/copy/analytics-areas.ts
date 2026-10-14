export const ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL = '작업량 신호';
export const ANALYTICS_AREA_RECENT_FINDINGS_LABEL = '최근 Finding';

export const ANALYTICS_AREA_FILTER_COPY = {
  unset: 'Analytics Area: 미지정',
  unresolved: 'Analytics Area: 선택한 Area',
  resolved: (name: string, archived: boolean) =>
    `Analytics Area: ${name}${archived ? ' (보관됨)' : ''}`,
} as const;
