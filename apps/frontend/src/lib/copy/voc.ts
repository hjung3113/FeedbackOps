// #582 / ADR-0031 replaces the prototype's old "similar" wording for this heuristic.
export const SAME_MANAGED_SYSTEM_VOC_LABEL = '같은 Managed System의 VOC';
export const SAME_MANAGED_SYSTEM_RECENT_VOC_LABEL = '같은 Managed System의 최근 VOC';
export const SEMANTIC_VOC_RECOMMENDATIONS_LABEL = '유사 VOC 추천';
export const SEMANTIC_VOC_RECOMMENDATIONS_NOTICE =
  '자동 클러스터링은 추천만 합니다. 확정이 필요합니다.';
export const VOC_TRIAGE_SUMMARY_SECTION_LABEL = '요약 · 변경 사항';
export const VOC_DETAIL_BODY_LABEL = '본문';

// #821: one string for every "server search returned nothing" surface
// (inbox list empty state and the Evidence VOC picker listbox).
export const VOC_SEARCH_EMPTY_LABEL = '검색 결과가 없습니다.';

export const VOC_AREA_FILTER_EMPTY_COPY = {
  title: '현재 조건에 맞는 VOC가 없습니다',
  body: (label: string) => `${label} 조건으로 표시 중입니다.`,
} as const;

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

export const SEMANTIC_VOC_PREVIEW_COPY = {
  disclosure:
    '버튼을 누르면 제목과 설명이 AI 임베딩 서비스로 전송됩니다. 첨부파일은 전송되지 않습니다.',
  check: '유사 VOC 확인',
  required: 'Managed System을 선택하고 제목과 상세 설명을 입력해 주세요.',
  loading: '확인 중…',
  empty: '비슷한 VOC를 찾지 못했습니다',
  providerDisabled: '지금은 유사 VOC 확인을 사용할 수 없습니다',
  providerFailed: '유사 VOC를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요',
  expired: '결과가 만료되었습니다. 다시 확인해 주세요',
} as const;

export const VOC_FOLLOW_UP_COPY = {
  createFinding: 'Finding 생성',
  showExecution: '연결된 실행 확인',
  requestTask: 'Task 요청',
  relatedEntities: '관련 엔티티',
  linkedRequest: '연결된 Task Request',
} as const;

export const VOC_NO_FOLLOW_UP = {
  record: '후속 조치 불필요로 결정',
  current: '후속 조치 불필요',
  withdraw: '결정 철회',
  reason: '결정 사유',
  description: '후속 조치가 필요하지 않은 이유를 입력해 주세요.',
  cancel: '취소',
  submit: '결정 기록',
  error: '결정을 저장하지 못했습니다. 다시 시도해 주세요.',
} as const;
