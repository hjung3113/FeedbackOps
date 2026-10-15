export const PERMISSION_BLOCKED_REASONS = {
  taskList: 'Task 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  taskDetail: '이 Task를 볼 권한이 없습니다.',
  milestoneList: 'Milestone 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  vocClusterList:
    'VOC Cluster 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  milestoneDetail: '이 Milestone을 볼 권한이 없습니다.',
  milestoneTasks: '이 Milestone의 Task를 볼 권한이 없습니다.',
  taskRequestQueue:
    'Task Request 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  entityLinks: '엔티티 링크 목록을 볼 권한이 없습니다.',
  findingsList: 'Finding 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  vocTriage: 'VOC Triage 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  vocTriageManagedSystem: '선택한 Managed System의 VOC Triage 권한이 없습니다.',
  vocInbox: 'VOC 수신함을 볼 권한이 없습니다. 내가 접수한 VOC는 내 VOC에서 확인할 수 있습니다.',
  vocInboxManagedSystem: '선택한 Managed System의 VOC를 볼 권한이 없습니다.',
  findingDetail:
    '이 Finding을 볼 권한이 없습니다. 해당 Managed System의 개발자 이상 권한이 필요합니다.',
  surveyResult: 'Survey 결과를 볼 권한이 없습니다.',
  surveyBuilder: 'Survey 관리 권한이 없습니다.',
} as const;

export const VOC_READ_PERMISSION_REASONS: Readonly<Record<string, string>> = {
  explicit_deny: '이 Managed System의 VOC 조회가 제한되어 있습니다.',
  grant_expired: 'VOC 조회 권한이 만료되었습니다.',
  grant_revoked: 'VOC 조회 권한이 회수되었습니다.',
  no_grant: '이 Managed System의 VOC를 볼 권한이 없습니다.',
};
