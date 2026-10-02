import type { DashboardSummary } from '@fops/shared';

import { GLOSSARY } from './glossary';

import { COVERAGE_METRIC_LABELS } from './coverage';

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
    const count = queues.reduce((total, queue) => total + queue.count, 0);
    if (count === 0) return '현재 확인할 운영 큐가 없습니다.';
    return `오늘 워크스페이스에 ${count}개의 운영 갭이 있습니다. 우선순위가 높은 큐부터 확인하세요.`;
  },
  // #280: the "My work" heading pointed at a My Work screen that is out of the
  // MVP. The rows below it are live (assigned Tasks + pending Task Requests),
  // so the panel stays and only the promise of a destination goes away.
  queueHeading: '복구 · 후속 조치 큐',
  noZeroQueueItems: '처리할 항목 없음',
  assignedToYou: '내게 배정됨',
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
  coverage_percent: COVERAGE_METRIC_LABELS['voc-task'],
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
    secondaryAction: '일괄 배정',
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
    sidebarLabel: '구성된 후속 조치',
    detail: '진행 중 상태의 Finding 중 Task Request 또는 Task 링크가 없는 항목입니다.',
    primaryAction: 'Task 요청',
    secondaryAction: '큐 열기',
  },
  'released-task-unresolved-voc': {
    title: 'Released Task · 미해결 VOC',
    sidebarLabel: '공개 업데이트 검토',
    detail: 'Task는 Released지만 연결된 공개 상태가 해결됨이 아닙니다.',
    primaryAction: '업데이트 검토',
    secondaryAction: '큐 열기',
  },
  'bad-outcome-no-followup': {
    title: '후속 조치 없는 부정 성과 Survey',
    sidebarLabel: '성과 Survey 후속 조치',
    detail: '부정 성과 Survey 결과에 대한 후속 Finding/Task가 구성되어 있지 않습니다.',
    primaryAction: '후속 조치 생성',
    secondaryAction: 'Survey 보기',
  },
  'permission-requests-pending': {
    title: '검토 대기 중인 권한 요청',
    sidebarLabel: '권한 요청 검토',
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
