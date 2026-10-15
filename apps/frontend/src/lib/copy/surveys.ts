export const SURVEY_LIST_COPY = {
  emptyUnmanagedTitle: '관리할 수 있는 Survey가 없습니다.',
  emptyUnmanagedBody: '참여할 Survey는 Survey 참여에서 확인하세요.',
} as const;

export const SURVEY_REPORT_FILTER_COPY = {
  status: (label: string) => `상태: ${label}`,
  followUp: '후속 조치 필요',
} as const;
