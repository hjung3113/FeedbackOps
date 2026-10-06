// #582 / ADR-0031 replaces the prototype's old "similar" wording for this heuristic.
export const SAME_MANAGED_SYSTEM_VOC_LABEL = '같은 Managed System의 VOC';
export const SAME_MANAGED_SYSTEM_RECENT_VOC_LABEL = '같은 Managed System의 최근 VOC';
export const SEMANTIC_VOC_RECOMMENDATIONS_LABEL = '유사 VOC 추천';

export const VOC_SOURCE_PICKER_COPY = {
  label: 'VOC 선택',
  placeholder: 'VOC 선택',
  searchPlaceholder: 'VOC ID 또는 제목 검색',
  listboxLabel: 'VOC 목록',
  emptyText: '검색 결과가 없습니다.',
  empty: '선택할 수 있는 VOC가 없습니다.',
  required: 'VOC를 선택하세요.',
  limitHint: '최근 100건만 표시됩니다. 이전 VOC는 VOC ID로 검색하세요.',
  loading: 'VOC 목록을 불러오는 중입니다.',
  error: 'VOC 목록을 불러오지 못했습니다.',
  resolving: 'VOC를 확인하고 있습니다.',
  unavailable: 'VOC를 찾을 수 없거나 권한이 없습니다.',
} as const;

export function formatSameManagedSystemVocCount(count: number): string {
  return `${SAME_MANAGED_SYSTEM_VOC_LABEL} ${count}건`;
}
