export const PERMISSION_BLOCKED_REASONS = {
  taskList: 'Task 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  taskDetail: '이 Task를 볼 권한이 없습니다.',
  milestoneList: 'Milestone 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  milestoneDetail: '이 Milestone을 볼 권한이 없습니다.',
  milestoneTasks: '이 Milestone의 Task를 볼 권한이 없습니다.',
  taskRequestQueue:
    'Task Request 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  entityLinks: 'Entity link 목록을 볼 권한이 없습니다.',
  findingsList: 'Finding 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  vocTriage: 'VOC Triage 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
  vocInbox: 'VOC Inbox를 볼 권한이 없습니다. 내가 접수한 VOC는 My VOCs에서 확인할 수 있습니다.',
  vocInboxManagedSystem: '선택한 Managed System의 VOC를 볼 권한이 없습니다.',
  findingDetail:
    '이 Finding을 볼 권한이 없습니다. 해당 Managed System의 Developer 이상 권한이 필요합니다.',
  surveyResult: '설문 결과를 볼 권한이 없습니다.',
  surveyBuilder: '설문 관리 권한이 없습니다.',
} as const;
