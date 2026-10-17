import type { DashboardSummary } from '@fops/shared';

import { GLOSSARY } from './glossary';

import { DASHBOARD_QUEUE_ACTION_LABELS } from './dashboard-actions';

export const HOME_COPY = {
  title: (name: string) => `안녕하세요, ${name}님`,
  subtitle: (
    queues: DashboardSummary['action_queues'] | undefined,
    coverage: DashboardSummary['coverage'] | undefined,
  ) => {
    if (queues === undefined) return '오늘 워크스페이스의 운영 현황을 불러오는 중입니다.';
    if (queues.length === 0) {
      if (coverage?.length === 0) {
        return '운영 큐와 커버리지는 Managed System 담당 범위가 있을 때만 표시됩니다. 지금은 나에게 배정된 작업만 보입니다.';
      }
      return '현재 확인할 운영 큐가 없습니다.';
    }
    if (!queues.some((queue) => queue.count > 0)) return '현재 확인할 운영 큐가 없습니다.';
    return '오늘 확인할 운영 큐가 있습니다. 우선순위가 높은 큐부터 확인하세요.';
  },
  // #280: the "My work" heading pointed at a My Work screen that is out of the
  // MVP. The rows below it are live (assigned Tasks + pending Task Requests),
  // so the panel stays and only the promise of a destination goes away.
  queueHeading: '복구 · 후속 조치 큐',
  noZeroQueueItems: '처리할 항목 없음',
  assignedToYou: '내게 배정됨',
  myVocs: GLOSSARY.myVocs,
  coverage: '커버리지 신호',
  openRequests: '열린 요청',
  noOpenRequests: '열린 요청이 없습니다.',
  refresh: '큐 새로고침',
  newVoc: 'VOC 생성',
  viewCoverage: '커버리지 보기',
} as const;

export const HOME_KPI_COPY = {
  open_voc: '미해결 VOC',
  active_finding: '활성 Finding',
  pending_request: '대기 중 Task Request',
  tasks_in_flight: GLOSSARY.tasksInFlight,
} as const;

export const HOME_QUEUE_COPY: Record<
  DashboardSummary['action_queues'][number]['id'],
  {
    title: string;
    sidebarLabel: string;
    detail: string;
    primaryAction: string;
    secondaryAction?: string;
  }
> = {
  'unassigned-voc': {
    title: '미배정 VOC',
    sidebarLabel: '미배정 VOC',
    detail: '담당자가 지정되지 않은 VOC가 누적되어 있습니다. 우선 분류와 담당 배정이 필요합니다.',
    primaryAction: 'VOC 검토',
    secondaryAction: '미배정 VOC 보기',
  },
  'high-severity-unlinked': {
    title: GLOSSARY.highNoLink,
    sidebarLabel: GLOSSARY.highNoLink,
    detail:
      '높음·심각 VOC 중 Finding, Task Request, Task 연결이 없고, 소속 Cluster의 Finding 또는 Task Request 연결도 없는 항목입니다.',
    primaryAction: '높은 심각도 VOC 검토',
    secondaryAction: '큐 열기',
  },
  'actionable-finding-no-execution': {
    title: '실행 계획 없는 Finding',
    sidebarLabel: '실행 계획 없는 Finding',
    detail: '진행 중 상태의 Finding 중 Task Request 또는 Task 링크가 없는 항목입니다.',
    // #1179: the link opens the Findings list, so it keeps the Integration
    // wording for the same destination instead of promising a Task Request.
    primaryAction: DASHBOARD_QUEUE_ACTION_LABELS['actionable-finding-no-execution'],
    secondaryAction: '큐 열기',
  },
  'released-task-unresolved-voc': {
    title: 'Released Task · 미해결 VOC',
    sidebarLabel: 'Released Task · 미해결 VOC',
    detail: 'Task는 Released지만 연결된 공개 상태가 해결됨이 아닙니다.',
    primaryAction: '업데이트 검토',
    secondaryAction: '큐 열기',
  },
  'bad-outcome-no-followup': {
    title: '후속 조치 없는 부정 성과 Survey',
    sidebarLabel: '후속 조치 없는 부정 성과 Survey',
    detail: '부정 성과 Survey 결과에 대한 후속 Finding/Task가 구성되어 있지 않습니다.',
    // #1179: the link opens the outcome Surveys review, so it keeps the
    // Integration wording instead of promising to create the follow-up.
    primaryAction: DASHBOARD_QUEUE_ACTION_LABELS['bad-outcome-no-followup'],
    secondaryAction: 'Survey 보기',
  },
  'permission-requests-pending': {
    title: '검토 대기 중인 권한 요청',
    sidebarLabel: '검토 대기 중인 권한 요청',
    detail: '워크스페이스 관리자 검토를 기다리는 상위 권한 요청입니다.',
    primaryAction: '요청 열기',
  },
};

export const HOME_INBOX_COPY = {
  tabs: {
    dashboard: '대시보드',
    inbox: GLOSSARY.inbox,
  },
  tabListLabel: '홈 보기',
  filterLabel: '알림 필터',
  unread: '읽지 않음',
  all: GLOSSARY.all,
  categories: {
    voc: 'VOC',
    task_request: 'Task Request',
    task: 'Task',
    permission_request: '권한 요청',
    permission_grant: '권한',
    public_update_review_candidate: '공개 업데이트',
  },
  emptyUnread: '읽지 않은 알림이 없습니다.',
  emptyAll: '받은 알림이 없습니다.',
  error: '알림을 불러오지 못했습니다.',
  retry: '다시 시도',
  loadMore: '더 불러오기',
  loadingMore: '불러오는 중…',
  markAsRead: '읽음으로 표시',
  archive: '보관',
  subjectUnavailable: '접근할 수 없는 항목',
  railNotificationsLabel: (unreadCount: number | undefined) =>
    unreadCount !== undefined && unreadCount > 0 ? `알림, 읽지 않음 ${unreadCount}건` : '알림',
} as const;

export function homeSeverityLabel(
  severity: DashboardSummary['action_queues'][number]['severity'],
): string {
  return severity === 'urgent' ? '복구' : severity === 'warn' ? '후속 조치' : '검토';
}

export const HOME_PERMISSION_COPY = {
  title: '내 권한 요청',
  description: '요청 내용을 확인하고 수정하거나 철회합니다.',
  loading: '요청을 불러오는 중입니다.',
  loadError: '요청을 불러오지 못했습니다.',
  retry: '다시 확인',
  edit: '수정',
  supplement: '보완 제출',
  withdraw: '요청 철회',
  withdrawReason: '철회 사유 · 선택',
  withdrawConfirm: '요청을 철회할까요?',
  withdrawDescription: '철회한 요청은 기록에 남으며 관리자 검토 대상에서 제외됩니다.',
  close: '닫기',
  question: '관리자의 최신 질문',
  reason: '사유',
  scope: '요청 범위',
  expiration: '요청 만료일',
  keep: '요청 만료일 유지',
  change: '만료일 변경',
  clear: '만료 없음',
  newExpiration: '새 만료일',
  stale: '요청이 변경되었습니다. 입력은 유지됩니다. 최신 내용과 비교한 뒤 다시 확인해 주세요.',
  reconcile: '최신 요청 확인 · 입력 유지',
  latestReason: '최신 요청 사유',
  closedRequest: '이 요청은 이미 종료되었습니다.',
  invalidReason: '사유를 입력하세요.',
  invalidExpiration: '만료일은 현재 시각보다 이후여야 합니다.',
  cancel: GLOSSARY.cancel,
  noChanges: '변경 사항이 없습니다.',
  questionHint: '답변은 사유에 작성한 뒤 보완 제출하세요.',
  editSaved: '요청이 수정되었습니다.',
  supplementSent: '보완 답변이 제출되었습니다.',
  withdrawn: '요청이 철회되었습니다.',
} as const;
