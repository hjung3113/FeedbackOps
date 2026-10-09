// #582 / ADR-0031 replaces the prototype's old "similar" wording for this heuristic.
export const SAME_MANAGED_SYSTEM_VOC_LABEL = '같은 Managed System의 VOC';
export const SAME_MANAGED_SYSTEM_RECENT_VOC_LABEL = '같은 Managed System의 최근 VOC';
export const SEMANTIC_VOC_RECOMMENDATIONS_LABEL = '유사 VOC 추천';
export const VOC_TRIAGE_SUMMARY_SECTION_LABEL = '요약 · 변경 사항';
export const VOC_DETAIL_BODY_LABEL = '본문';

// #821: one string for every "server search returned nothing" surface
// (inbox list empty state and the Evidence VOC picker listbox).
export const VOC_SEARCH_EMPTY_LABEL = '검색 결과가 없습니다.';

// #935: one set of strings for every "list fetch failed" surface
// (inbox VocList error state and the Triage queue error state).
export const VOC_LIST_LOAD_ERROR_LABELS = {
  title: '불러오기 실패',
  body: '잠시 후 다시 시도해 주세요.',
  retry: '다시 시도',
} as const;

export const VOC_SOURCE_PICKER_COPY = {
  label: 'VOC 선택',
  placeholder: 'VOC 선택',
  searchPlaceholder: 'VOC ID 또는 제목 검색',
  listboxLabel: 'VOC 목록',
  emptyText: VOC_SEARCH_EMPTY_LABEL,
  empty: '선택할 수 있는 VOC가 없습니다.',
  required: 'VOC를 선택하세요.',
  limitHint: '최근 100건만 표시됩니다. VOC ID나 제목으로 검색하세요.',
  searchLimitHint: '결과가 많습니다. 검색어를 더 입력하세요.',
  loading: 'VOC 목록을 불러오는 중입니다.',
  error: 'VOC 목록을 불러오지 못했습니다.',
} as const;

export function formatSameManagedSystemVocCount(count: number): string {
  return `${SAME_MANAGED_SYSTEM_VOC_LABEL} ${count}건`;
}
