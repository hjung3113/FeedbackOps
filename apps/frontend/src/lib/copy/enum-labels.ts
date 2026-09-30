import type {
  EntityLinkRelationType,
  EvidenceHighlightImportance,
  EvidenceHighlightSentiment,
  EvidenceHighlightSourceType,
  FindingConfidence,
  FindingDto,
  FindingSeverity,
  FindingStatus,
  RatingBand,
  SurveyQuestionKind,
  SurveyQuestionResult,
  SurveyStatus,
  SurveyType,
  TaskPriority,
  TaskRequestStatus,
  TaskStatus,
  TriageStateEnum,
} from '@fops/shared';

// #613 applies the Korean-first enum-label decisions from #579/#580 over prototype raw values.
export const TRIAGE_STATE_LABELS: Record<TriageStateEnum, string> = {
  untriaged: '미분류',
  triaged: '분류 완료',
  needs_more_information: '추가 정보 필요',
  dismissed_not_actionable: '조치 불필요',
};

export const SURVEY_TYPE_LABELS: Record<SurveyType, string> = {
  discovery: '탐색',
  validation: '검증',
  outcome: '결과',
};

export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: '초안',
  open: '진행 중',
  closed: '종료됨',
};

export const SURVEY_QUESTION_KIND_LABELS: Record<SurveyQuestionKind, string> = {
  single_choice: '단일 선택',
  multiple_choice: '복수 선택',
  rating: '평점',
  text: '서술형',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  urgent: '긴급',
};

export const FINDING_SEVERITY_LABELS: Record<FindingSeverity, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '심각',
};

export const FINDING_CONFIDENCE_LABELS: Record<FindingConfidence, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
};

export const FINDING_SOURCE_TYPE_LABELS: Record<FindingDto['source_type'], string> = {
  voc: 'VOC',
  voc_cluster: 'VOC Cluster',
  survey: 'Survey',
  survey_response: 'Survey Response',
  manual: 'Manual',
};

export const EVIDENCE_SOURCE_TYPE_LABELS: Record<EvidenceHighlightSourceType, string> = {
  voc: 'VOC',
  survey_response: 'Survey',
  note: 'Manual note',
};

export const EVIDENCE_SENTIMENT_LABELS: Record<EvidenceHighlightSentiment, string> = {
  negative: '부정',
  neutral: '중립',
  positive: '긍정',
};

export const EVIDENCE_IMPORTANCE_LABELS: Record<EvidenceHighlightImportance, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
};

export const RATING_BAND_LABELS: Record<RatingBand, string> = {
  low: '낮은 점수',
  mid: '중간 점수',
  high: '높은 점수',
};

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  draft: '초안',
  active: '진행 중',
  not_actionable: '조치 불필요',
  converted: 'Task 전환됨',
  archived: '보관됨',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  doing: 'Doing',
  review: 'Review',
  done: 'Done',
  released: 'Released',
  reopened: 'Reopened',
};

export const TASK_REQUEST_STATUS_LABELS: Record<TaskRequestStatus, string> = {
  pending_review: '검토 대기',
  needs_more_evidence: '근거 추가 필요',
  approved: '승인됨',
  rejected: '반려됨',
  converted: 'Task 전환됨',
};

export const ENTITY_LINK_RELATION_LABELS: Record<EntityLinkRelationType, string> = {
  related_to: '관련 항목',
  created_finding: '생성한 Finding',
  generated_finding: '생성된 Finding',
  evidence_of: '근거',
  requested_task: '요청한 Task',
  converted_to: '전환된 항목',
};

type SurveyResultKind = Extract<SurveyQuestionResult, { visibility: 'visible' }>['kind'];

export const SURVEY_RESULT_KIND_LABELS: Record<SurveyResultKind, string> = {
  choice: '선택형',
  rating: '평점',
  text: '서술형',
} as const;
