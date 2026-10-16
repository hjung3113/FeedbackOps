export const TASK_BOARD_COPY = {
  openOnlyNote: '완료·배포된 Task는 제외됩니다. 상태별 보기에서 확인하세요.',
  columnLoading: '불러오는 중...',
  columnError: '이 열을 불러오지 못했습니다.',
  roleDescription: '끌 수 있는 Task',
  screenReaderInstructions: {
    draggable:
      'Task를 집으려면 스페이스나 엔터를 누르세요. 화살표 키로 열을 옮기고, 스페이스나 엔터로 놓거나 Escape로 취소합니다.',
  },
  pickup: (displayId: string, column: string) =>
    `${displayId} Task를 집었습니다. 현재 열: ${column}.`,
  over: (displayId: string, column: string | null) =>
    column === null
      ? `${displayId} Task가 열 밖에 있습니다.`
      : `${displayId} Task가 ${column} 열 위에 있습니다.`,
  drop: (displayId: string, column: string | null) =>
    column === null
      ? `${displayId} Task를 놓았습니다. 상태는 바뀌지 않습니다.`
      : `${displayId} Task를 ${column} 열에 놓았습니다.`,
  cancel: (displayId: string) => `${displayId} Task 이동을 취소했습니다.`,
};
