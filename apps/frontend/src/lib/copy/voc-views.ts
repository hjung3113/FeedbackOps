import { GLOSSARY } from './glossary';

export const VOC_TRIAGE_TAB_LABELS = {
  unassigned: GLOSSARY.unassigned,
  high: GLOSSARY.high,
} as const;

export const VOC_TRIAGE_QUEUE_TOTAL_LABELS = {
  loading: '전체 대기열 불러오는 중',
  unavailable: '전체 대기열 알 수 없음',
} as const;

/** #922: shown when the active tab has no rows but the queue total is greater than zero. */
export const VOC_TRIAGE_TAB_EMPTY_LABEL = '이 탭에 해당하는 VOC가 없습니다';

export const VOC_INBOX_NO_LINK_TAB_LABEL = GLOSSARY.noLink;
