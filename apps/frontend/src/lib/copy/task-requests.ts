export const TASK_REQUEST_REVIEW_DECISION_LABEL = '검토 결정';

export const TASK_REQUEST_LINK_MISSING_MESSAGE =
  '요청한 Task Request를 찾을 수 없습니다. 삭제되었거나 현재 권한·범위 밖일 수 있습니다.';

export const TASK_REQUEST_COPY = {
  decisions: {
    approve: '승인했습니다. Task로 전환할 수 있습니다.',
    reject: '반려했습니다.',
    'request-more-evidence': '추가 근거를 요청했습니다.',
  },
  unassigned: '담당자 없음',
  unknownTeam: '이름 확인 불가',
  automaticNote: '자동 배정은 설정된 기본값을 사용합니다.',
  converted: (displayId: string, assignee: string) =>
    `Task ${displayId}${/[036]$/.test(displayId) ? '으로' : '로'} 전환했습니다. 담당자: ${assignee}`,
  convertToTask: 'Task로 전환',
  openTask: 'Task 열기',
  created: 'Task Request가 생성되었습니다.',
  openRequest: 'Task Request 열기',
  selfApproved: '본인이 승인함',
  peerApproved: '다른 검토자가 승인함',
  notApproved: '아직 승인되지 않음',
};
