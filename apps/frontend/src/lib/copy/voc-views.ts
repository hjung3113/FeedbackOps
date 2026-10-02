import { GLOSSARY } from './glossary';

export const VOC_TRIAGE_TAB_LABELS = {
  unassigned: GLOSSARY.unassigned,
  high: GLOSSARY.high,
} as const;

export const VOC_TRIAGE_QUEUE_TOTAL_LABELS = {
  loading: '전체 대기열 불러오는 중',
  unavailable: '전체 대기열 알 수 없음',
} as const;

export const VOC_INBOX_NO_LINK_TAB_LABEL = GLOSSARY.noLink;
