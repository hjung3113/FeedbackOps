export const TASK_LINK_MISSING_MESSAGE =
  '요청한 Task를 찾을 수 없습니다. 삭제되었거나 현재 권한·범위 밖일 수 있습니다.';

export const RESPONSIBILITY_COPY = {
  modes: { automatic: '자동 배정', unassigned: '미배정', actor: '사용자 지정', team: '팀 지정' },
  edit: '배정 수정',
  mode: '배정 방식',
  actor: '담당 사용자',
  selectActor: '사용자 선택',
  selectTeam: '팀 선택',
  noTeams: '선택할 수 있는 팀이 없습니다',
  reviewer: '배정된 검토자',
  save: '배정 저장',
  saved: '배정을 저장했습니다.',
  allReviewers: '모든 검토자',
  mine: '내 검토 요청',
  // Assigned reviewer vs actual decision Actor (ADR-0067 56-F) and team identity.
  assignedShort: '검토 담당',
  decider: '결정자',
  decidedShort: '결정',
  undecided: '미결정',
  teamMark: '팀',
  ineligible: '지정할 수 없음',
};
