type NoSummaryParams = Record<string, never>;

export interface NotificationSummaryParamsByEvent {
  'voc.assigned_to_me': NoSummaryParams;
  'voc.reporter_replied': NoSummaryParams;
  'voc.severity_set_high_or_critical': { severity: 'high' | 'critical' };
  'task_request.approved': NoSummaryParams;
  'task_request.rejected': NoSummaryParams;
  'task_request.needs_more_evidence': NoSummaryParams;
  'task.assigned_to_me': NoSummaryParams;
  'task.released': NoSummaryParams;
  'permission_request.submitted': NoSummaryParams;
  'permission_request.decided': { outcome: 'approved' | 'rejected' };
}

export type NotificationSubjectType =
  | 'voc'
  | 'task_request'
  | 'task'
  | 'permission_request'
  | 'public_update_review_candidate';

type NotificationCatalogueShape = {
  [K in keyof NotificationSummaryParamsByEvent]: {
    recipients: string;
    subject_type: NotificationSubjectType;
    in_app: true;
    email: boolean;
    summary: (params: NotificationSummaryParamsByEvent[K]) => string;
  };
};

export const notificationCatalogue = {
  'voc.assigned_to_me': {
    recipients: 'Resolved user owner; team-owned VOCs have no Actor recipient.',
    subject_type: 'voc',
    in_app: true,
    email: false,
    summary: () => 'VOC 담당자로 지정되었습니다.',
  },
  'voc.reporter_replied': {
    recipients: 'Current VOC owner plus every workspace actor with role_level=admin.',
    subject_type: 'voc',
    in_app: true,
    email: false,
    summary: () => 'VOC에 작성자 답변이 등록되었습니다.',
  },
  'voc.severity_set_high_or_critical': {
    recipients: 'Current VOC owner plus every workspace actor with role_level=admin.',
    subject_type: 'voc',
    in_app: true,
    email: true,
    summary: ({ severity }) =>
      severity === 'high'
        ? 'VOC 심각도가 높음으로 설정되었습니다.'
        : 'VOC 심각도가 매우 높음으로 설정되었습니다.',
  },
  'task_request.approved': {
    recipients: 'Task Request creator (requester_actor_id); self-notification is allowed.',
    subject_type: 'task_request',
    in_app: true,
    email: false,
    summary: () => '작업 요청이 승인되었습니다.',
  },
  'task_request.rejected': {
    recipients: 'Task Request creator (requester_actor_id).',
    subject_type: 'task_request',
    in_app: true,
    email: true,
    summary: () => '작업 요청이 반려되었습니다.',
  },
  'task_request.needs_more_evidence': {
    recipients: 'Task Request creator (requester_actor_id).',
    subject_type: 'task_request',
    in_app: true,
    email: false,
    summary: () => '작업 요청에 추가 근거가 필요합니다.',
  },
  'task.assigned_to_me': {
    recipients: 'New Task assignee.',
    subject_type: 'task',
    in_app: true,
    email: false,
    summary: () => '작업 담당자로 지정되었습니다.',
  },
  'task.released': {
    recipients:
      'Current owner of the linked VOC; caller applies the ADR-0014 exclusions for releasing actor, Task assignee, Reporter, and worker actor.',
    subject_type: 'public_update_review_candidate',
    in_app: true,
    email: false,
    summary: () => '연결된 VOC에 공개 업데이트 검토 요청이 등록되었습니다.',
  },
  'permission_request.submitted': {
    recipients: 'Every workspace actor with role_level=admin.',
    subject_type: 'permission_request',
    in_app: true,
    email: true,
    summary: () => '새 권한 요청이 등록되었습니다.',
  },
  'permission_request.decided': {
    recipients: 'Permission Request requester.',
    subject_type: 'permission_request',
    in_app: true,
    email: true,
    summary: ({ outcome }) =>
      outcome === 'approved' ? '권한 요청이 승인되었습니다.' : '권한 요청이 반려되었습니다.',
  },
} satisfies NotificationCatalogueShape;

export type NotificationEventType = keyof typeof notificationCatalogue;

export function isNotificationEventType(value: unknown): value is NotificationEventType {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(notificationCatalogue, value)
  );
}
