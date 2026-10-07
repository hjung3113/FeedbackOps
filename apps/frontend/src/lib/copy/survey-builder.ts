export const SURVEY_BUILDER_COPY = {
  addOption: '옵션 추가',
  addQuestionBeforeLaunch: '시작하려면 질문을 하나 이상 추가하세요.',
  branchParentLabel: (number: number, prompt: string) =>
    prompt.trim() ? `Q${number} · ${prompt}` : `Q${number}`,
  branchOptionResetNotice:
    '분기 조건으로 사용 중인 옵션을 삭제하면 첫 번째 남은 옵션으로 변경됩니다.',
  branchParentKindChange: '분기 질문이 있으면 복수 선택으로 바꿀 수 없습니다.',
  deleteParentTitle: '질문 삭제',
  deleteParentWithBranches: (count: number) =>
    `이 질문을 삭제하면 ${count}개 질문의 분기 조건이 해제됩니다. 계속할까요?`,
  deleteQuestion: '삭제',
  deleteQuestionLabel: (number: number) => `Q${number} 질문 삭제`,
  cancelDeleteQuestion: '취소',
  emptyPrompt: '질문을 입력하세요.',
  emptyOptionLabel: '옵션을 입력하세요.',
  firstQuestionHelp: {
    single_choice: '하나의 답변을 고릅니다.',
    multiple_choice: '여러 개의 답변을 고릅니다.',
    rating: '점수 범위로 평가합니다.',
    text: '직접 답변을 작성합니다.',
  },
  launchSaveFailed: '저장하지 못해 시작하지 않았습니다.',
  launchOptionValidationFailed: '빈 옵션을 채운 후 다시 시작하세요.',
  optionDeleteLabel: (number: number) => `옵션 ${number} 삭제`,
  optionLabel: (number: number) => `옵션 ${number}`,
  promptPlaceholder: '질문을 입력하세요',
  questionTitleMissing: '제목 없는 질문',
  ratingMax: '최대 점수',
  ratingMin: '최소 점수',
  ratingRange: '점수 범위는 0~10 사이의 정수이며, 최소 점수는 최대 점수보다 작아야 합니다.',
  titleRequired: 'Survey 제목을 입력하세요.',
} as const;
